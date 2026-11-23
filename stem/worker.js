// STEM SEMILIA · séparation dans le navigateur (HTDemucs v4 via ONNX Runtime Web).
// Le calcul tourne ici, hors de la page, pour qu'elle reste fluide. Rien ne quitte l'ordinateur.
import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.webgpu.min.mjs";
import { DemucsProcessor, CONSTANTS } from "./lib/index.js";

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) : 1;

const MODEL_URL = CONSTANTS.DEFAULT_MODEL_URL;
const CACHE = "stem-semilia-modele-v1";
let proc = null, backend = "";

const post = (type, data = {}, transfer) => self.postMessage({ type, ...data }, transfer || []);

// Le modèle (172 Mo) n'est téléchargé qu'une fois : il est gardé dans le cache du navigateur
async function modelBytes() {
  let cache = null;
  try { cache = await caches.open(CACHE); const hit = await cache.match(MODEL_URL); if (hit) { post("dl", { p: 1, cached: true }); return await hit.arrayBuffer(); } } catch (e) {}
  const res = await fetch(MODEL_URL, { mode: "cors" });
  if (!res.ok) throw new Error("téléchargement du modèle impossible (" + res.status + ")");
  const total = +res.headers.get("Content-Length") || 172e6, reader = res.body.getReader(), parts = [];
  let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; post("dl", { p: Math.min(0.999, got / total) }); }
  const buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  try { if (cache) await cache.put(MODEL_URL, new Response(buf.slice().buffer, { headers: { "Content-Type": "application/octet-stream" } })); } catch (e) {}
  post("dl", { p: 1 });
  return buf.buffer;
}

async function load() {
  if (proc) return;
  const bytes = await modelBytes();
  post("phase", { msg: "préparation du moteur…" });
  let gpu = false;
  try { gpu = !!(self.navigator.gpu && await self.navigator.gpu.requestAdapter()); } catch (e) {}
  const tries = gpu ? [["webgpu"], ["wasm"]] : [["wasm"]];
  let lastErr = null;
  for (const eps of tries) {
    try {
      proc = new DemucsProcessor({ ort, sessionOptions: { executionProviders: eps, graphOptimizationLevel: "basic" } });
      await proc.loadModel(bytes);
      backend = eps[0] === "webgpu" ? "carte graphique (WebGPU)" : "processeur" + (ort.env.wasm.numThreads > 1 ? ` (${ort.env.wasm.numThreads} cœurs)` : " (1 cœur)");
      post("ready", { backend });
      return;
    } catch (e) { lastErr = e; proc = null; }
  }
  throw lastErr || new Error("moteur indisponible");
}

// une passe, avec suivi segment par segment
async function pass(L, R, label, k, of) {
  let t0 = performance.now();
  proc.onProgress = ({ progress, currentSegment, totalSegments }) => {
    const el = (performance.now() - t0) / 1000, per = el / currentSegment;
    post("prog", { p: (k + progress) / of, seg: currentSegment, segs: totalSegments, label, eta: per * (totalSegments - currentSegment) + (of - k - 1) * per * totalSegments });
  };
  return proc.separate(L, R);
}

self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === "load") { await load(); return; }
    if (m.type === "separate") {
      await load();
      const { left, right, careful } = m, n = left.length, of = careful ? 2 : 1;
      const t0 = performance.now();
      const res = await pass(left, right, "passe 1", 0, of);
      if (careful) {
        // 2e passe décalée d'une demi-seconde (méthode « shifts » de Demucs) : les deux résultats sont moyennés,
        // ce qui gomme une partie des artefacts aux jointures des segments
        const sh = Math.round(CONSTANTS.SAMPLE_RATE * 0.5), L2 = new Float32Array(n + sh), R2 = new Float32Array(n + sh);
        L2.set(left, sh); R2.set(right, sh);
        const res2 = await pass(L2, R2, "passe 2", 1, of);
        for (const t of CONSTANTS.TRACKS) {
          const a = res[t], b = res2[t];
          for (let i = 0; i < n; i++) { a.left[i] = (a.left[i] + b.left[i + sh]) * 0.5; a.right[i] = (a.right[i] + b.right[i + sh]) * 0.5; }
        }
      }
      const out = {}, tr = [];
      for (const t of CONSTANTS.TRACKS) { out[t] = { left: res[t].left, right: res[t].right }; tr.push(res[t].left.buffer, res[t].right.buffer); }
      post("done", { stems: out, secs: (performance.now() - t0) / 1000, backend }, tr);
    }
  } catch (err) {
    post("error", { msg: String(err && err.message || err) });
  }
};
