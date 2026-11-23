// STEM SEMILIA · séparation dans le navigateur (HTDemucs v4 via ONNX Runtime Web).
// Le calcul tourne ici, hors de la page, pour qu'elle reste fluide. Rien ne quitte l'ordinateur.
// 4 pistes : HTDemucs (demucs-web, MIT) · 6 pistes : HTDemucs 6s (export ONNX kramp/htdemucs-6s-webgpu-onnx, MIT)
import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.webgpu.min.mjs";
import { DemucsProcessor, CONSTANTS, stft, istft } from "./lib/index.js";

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

// ---------- Batterie en éléments (option) : 3 petits modèles Timbrica (kick, caisse claire, toms ; licence CC BY-NC-SA 4.0,
// usage non commercial) qui donnent chacun un masque sur le spectre de la piste batterie ; charleys + cymbales = le reste.
// Rien n'est chargé ni calculé si l'option est éteinte.
const DRUM_BASE = "https://huggingface.co/Faridzar/timbrica-drum-separator/resolve/main/";
const DRUM_PARTS = [["kick", "drums-kick-fp16.onnx"], ["snare", "drums-snare-r2-fp16.onnx"], ["toms", "drums-toms-fp16.onnx"]];
const NF = 4096, HOP = 1024, BINS = 2048, FR = 512, CH_LEN = (FR - 1) * HOP + NF, CH_STEP = 448 * HOP;
let drumSess = null, drumKey = "";
async function drumLoad(engine) {
  const key = engine;
  if (drumSess && drumKey === key) return drumSess;
  const sess = {};
  for (const [part, file] of DRUM_PARTS) {
    const bytes = await modelBytes({ url: DRUM_BASE + file, size: 19.7e6 });
    const gpu = engine !== "cpu" && !!self.navigator.gpu;
    try { sess[part] = await ort.InferenceSession.create(bytes, { executionProviders: gpu ? ["webgpu", "wasm"] : ["wasm"], graphOptimizationLevel: "basic" }); }
    catch (e) { sess[part] = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "basic" }); }
  }
  drumSess = sess; drumKey = key; return sess;
}
async function drumSplit(engine, L, R, onP) {
  post("phase", { msg: "batterie en éléments : chargement des 3 petits modèles…" });
  const sess = await drumLoad(engine), n = L.length;
  const outs = {}; for (const [p] of DRUM_PARTS) outs[p] = { left: new Float32Array(n), right: new Float32Array(n) };
  const wsum = new Float32Array(n), nCh = Math.max(1, Math.ceil(Math.max(0, n - CH_LEN) / CH_STEP) + 1), over = CH_LEN - CH_STEP;
  for (let c = 0, s0 = 0; c < nCh; c++, s0 += CH_STEP) {
    // spectre du morceau de 512 trames (≈ 11,9 s)
    const specs = [L, R].map(x => { const seg = new Float32Array(CH_LEN); seg.set(x.subarray(s0, Math.min(n, s0 + CH_LEN))); return stft(seg, NF, HOP); });
    const nb = specs[0].numBins, mag = new Float32Array(2 * BINS * FR), k = Math.sqrt(NF);
    for (let ch = 0; ch < 2; ch++) { const sp = specs[ch]; for (let f = 0; f < FR; f++) for (let b = 0; b < BINS; b++) { const i = f * nb + b; mag[(ch * BINS + b) * FR + f] = Math.hypot(sp.real[i], sp.imag[i]) * k; } }
    const len = Math.min(CH_LEN, n - s0);
    for (const [part] of DRUM_PARTS) {
      const s = sess[part], r = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", mag, [1, 2, BINS, FR]) }), m = r[s.outputNames[0]].data;
      for (let ch = 0; ch < 2; ch++) {
        const sp = specs[ch], re = new Float32Array(sp.real.length), im = new Float32Array(sp.imag.length);
        for (let f = 0; f < FR; f++) for (let b = 0; b < nb; b++) { const i = f * nb + b, g = m[(ch * BINS + Math.min(b, BINS - 1)) * FR + f]; re[i] = sp.real[i] * g; im[i] = sp.imag[i] * g; }
        const y = istft(re, im, FR, nb, NF, HOP, CH_LEN), o = ch ? outs[part].right : outs[part].left;
        for (let i = 0; i < len; i++) { const w = Math.max(1e-4, Math.min(1, c ? i / over : 1, c < nCh - 1 ? (CH_LEN - i) / over : 1)); o[s0 + i] += y[i] * w; if (part === "kick" && ch === 0) wsum[s0 + i] += w; }
      }
    }
    onP({ progress: (c + 1) / nCh, currentSegment: c + 1, totalSegments: nCh });
  }
  const res = {};
  for (const [p] of DRUM_PARTS) { const o = outs[p]; for (let i = 0; i < n; i++) { const w = wsum[i] || 1; o.left[i] /= w; o.right[i] /= w; } res[p] = o; }
  const hl = new Float32Array(n), hr = new Float32Array(n);
  for (let i = 0; i < n; i++) { hl[i] = L[i] - res.kick.left[i] - res.snare.left[i] - res.toms.left[i]; hr[i] = R[i] - res.kick.right[i] - res.snare.right[i] - res.toms.right[i]; }
  res.hats = { left: hl, right: hr };
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
      let e = await load(m.engine, m.stems === 6 ? 6 : 4);
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
      if (m.drumsplit && res.drums) {
        const t1 = performance.now();
        const parts = await drumSplit(m.engine, res.drums.left, res.drums.right, ({ progress, currentSegment, totalSegments }) => {
          const per = (performance.now() - t1) / 1000 / currentSegment;
          post("prog", { p: progress, seg: currentSegment, segs: totalSegments, label: "batterie en éléments", eta: per * (totalSegments - currentSegment) });
        });
        delete res.drums; Object.assign(res, parts); e = { ...e, tracks: e.tracks.filter(t => t !== "drums").concat(["kick", "snare", "toms", "hats"]) };
      }
      const out = {}, tr = [];
      for (const t of e.tracks) { out[t] = { left: res[t].left, right: res[t].right }; tr.push(res[t].left.buffer, res[t].right.buffer); }
      post("done", { stems: out, secs: (performance.now() - t0) / 1000, backend: e.backend }, tr);
    }
  } catch (err) {
    post("error", { msg: String(err && err.message || err) });
  }
};
