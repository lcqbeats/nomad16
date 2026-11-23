// STEM SEMILIA · séparation dans le navigateur (HTDemucs v4 via ONNX Runtime Web).
// Le calcul tourne ici, hors de la page, pour qu'elle reste fluide. Rien ne quitte l'ordinateur.
// 4 pistes : HTDemucs (demucs-web, MIT) · 6 pistes : HTDemucs 6s (export ONNX kramp/htdemucs-6s-webgpu-onnx, MIT)
import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.webgpu.min.mjs";
import { DemucsProcessor, CONSTANTS } from "./lib/index.js";

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) : 1;

const MODELS = {
  4: { url: CONSTANTS.DEFAULT_MODEL_URL, size: 172e6, tracks: ["drums", "bass", "other", "vocals"] },
  6: { url: "https://huggingface.co/kramp/htdemucs-6s-webgpu-onnx/resolve/main/htdemucs_6s.onnx", size: 285e6, tracks: ["drums", "bass", "other", "vocals", "guitar", "piano"] }
};
const SEG = CONSTANTS.TRAINING_SAMPLES, OVER = CONSTANTS.SEGMENT_OVERLAP;
const CACHE = "stem-semilia-modele-v1";
let eng = null;   // { key, n, tracks, proc (4) | sess (6), backend }

const post = (type, data = {}, transfer) => self.postMessage({ type, ...data }, transfer || []);

// Le modèle n'est téléchargé qu'une fois : il est gardé dans le cache du navigateur
async function modelBytes(M) {
  let cache = null;
  try { cache = await caches.open(CACHE); const hit = await cache.match(M.url); if (hit) { post("dl", { p: 1, cached: true }); return await hit.arrayBuffer(); } } catch (e) {}
  const res = await fetch(M.url, { mode: "cors" });
  if (!res.ok) throw new Error("téléchargement du modèle impossible (" + res.status + ")");
  const total = +res.headers.get("Content-Length") || M.size, reader = res.body.getReader(), parts = [];
  let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; post("dl", { p: Math.min(0.999, got / total), mb: Math.round(M.size / 1e6) }); }
  const buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  try { if (cache) await cache.put(M.url, new Response(buf.slice().buffer, { headers: { "Content-Type": "application/octet-stream" } })); } catch (e) {}
  post("dl", { p: 1 });
  return buf.buffer;
}

async function load(engine = "auto", n = 4) {
  const key = engine + "/" + n;
  if (eng && eng.key === key) return eng;
  eng = null;
  const M = MODELS[n], bytes = await modelBytes(M);
  post("phase", { msg: "préparation du moteur…" });
  let gpu = false;
  try { gpu = !!(self.navigator.gpu && await self.navigator.gpu.requestAdapter()); } catch (e) {}
  const tries = engine === "cpu" || !gpu ? [["wasm"]] : engine === "gpu" ? [["webgpu"]] : [["webgpu"], ["wasm"]];
  let lastErr = null;
  for (const eps of tries) {
    try {
      const opts = { executionProviders: eps, graphOptimizationLevel: "basic" };
      const e = { key, n, tracks: M.tracks };
      if (n === 4) { e.proc = new DemucsProcessor({ ort, sessionOptions: opts }); await e.proc.loadModel(bytes); }
      else e.sess = await ort.InferenceSession.create(bytes, opts);
      e.backend = eps[0] === "webgpu" ? "carte graphique (WebGPU)" : "processeur" + (ort.env.wasm.numThreads > 1 ? ` (${ort.env.wasm.numThreads} cœurs)` : " (1 cœur)");
      eng = e; post("ready", { backend: e.backend });
      return e;
    } catch (err) { lastErr = err; }
  }
  throw lastErr || new Error("moteur indisponible");
}

// 6 pistes : le modèle prend 7,8 s de stéréo et rend les 6 pistes ; segments recouverts au quart, fondus en triangle
async function separate6(e, left, right, onP) {
  const total = left.length, stride = Math.floor(SEG * (1 - OVER)), nSeg = Math.ceil(Math.max(0, total - SEG) / stride) + 1;
  const outs = e.tracks.map(() => ({ left: new Float32Array(total), right: new Float32Array(total) })), wsum = new Float32Array(total);
  const inName = e.sess.inputNames[0], outName = e.sess.outputNames[0];
  let k = 0;
  for (let start = 0; start < total; start += stride) {
    const len = Math.min(SEG, total - start), x = new Float32Array(2 * SEG);
    x.set(left.subarray(start, start + len), 0); x.set(right.subarray(start, start + len), SEG);
    const r = await e.sess.run({ [inName]: new ort.Tensor("float32", x, [1, 2, SEG]) }), y = r[outName].data;
    for (let i = 0; i < len; i++) {
      const w = Math.max(1e-4, Math.min(1, i / (stride * 0.5), (len - i) / (stride * 0.5))); wsum[start + i] += w;
      for (let t = 0; t < e.tracks.length; t++) { outs[t].left[start + i] += y[(t * 2) * SEG + i] * w; outs[t].right[start + i] += y[(t * 2 + 1) * SEG + i] * w; }
    }
    k++; onP({ progress: k / nSeg, currentSegment: k, totalSegments: nSeg });
    if (start + SEG >= total) break;
  }
  const res = {};
  e.tracks.forEach((t, j) => { const o = outs[j]; for (let i = 0; i < total; i++) { const w = wsum[i] || 1; o.left[i] /= w; o.right[i] /= w; } res[t] = o; });
  return res;
}

// une passe, avec suivi segment par segment
async function pass(e, L, R, label, k, of) {
  const t0 = performance.now();
  const onP = ({ progress, currentSegment, totalSegments }) => {
    const per = (performance.now() - t0) / 1000 / currentSegment;
    post("prog", { p: (k + progress) / of, seg: currentSegment, segs: totalSegments, label, eta: per * (totalSegments - currentSegment) + (of - k - 1) * per * totalSegments });
  };
  if (e.n === 4) { e.proc.onProgress = onP; return e.proc.separate(L, R); }
  return separate6(e, L, R, onP);
}

self.onmessage = async ev => {
  const m = ev.data;
  try {
    if (m.type === "separate") {
      const e = await load(m.engine, m.stems === 6 ? 6 : 4);
      const { left, right, careful } = m, n = left.length, of = careful ? 2 : 1;
      const t0 = performance.now();
      const res = await pass(e, left, right, "passe 1", 0, of);
      if (careful) {
        // 2e passe décalée d'une demi-seconde (méthode « shifts » de Demucs) : les deux résultats sont moyennés,
        // ce qui gomme une partie des artefacts aux jointures des segments
        const sh = Math.round(CONSTANTS.SAMPLE_RATE * 0.5), L2 = new Float32Array(n + sh), R2 = new Float32Array(n + sh);
        L2.set(left, sh); R2.set(right, sh);
        const res2 = await pass(e, L2, R2, "passe 2", 1, of);
        for (const t of e.tracks) {
          const a = res[t], b = res2[t];
          for (let i = 0; i < n; i++) { a.left[i] = (a.left[i] + b.left[i + sh]) * 0.5; a.right[i] = (a.right[i] + b.right[i + sh]) * 0.5; }
        }
      }
      const out = {}, tr = [];
      for (const t of e.tracks) { out[t] = { left: res[t].left, right: res[t].right }; tr.push(res[t].left.buffer, res[t].right.buffer); }
      post("done", { stems: out, secs: (performance.now() - t0) / 1000, backend: e.backend }, tr);
    }
  } catch (err) {
    post("error", { msg: String(err && err.message || err) });
  }
};
