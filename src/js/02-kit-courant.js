  // ---------- Kit courant ----------
  let names = SYNTH_NAMES.slice();
  let buffers = [];
  let gains = new Array(16).fill(1);
  let synthBuffers = null;
  let kitIndex = [{ id: "synth", name: "NOMAD SYNTH", style: "Synthèse", desc: "Les sons de départ, synthétisés" }];
  let kitCur = "synth";
  let selected = 0, openHatSrc = null, kitChoke = false;
  const PDEF = { tune: 0, decay: 1, pan: 0, level: 1, start: 0, end: 1, oneshot: true, rev: false, loop: false, att: 0, rel: 0.05, tone: 0.5, choke: 0, fit: 1, fitBeats: 0, echo: 0, dirt: 0, fitMode: 0, eqL: 0, eqM: 0, eqH: 0, vc: 1 };
  const newParams = () => Array.from({ length: 16 }, () => ({ ...PDEF }));
  const fixParams = arr => Array.from({ length: 16 }, (_, i) => ({ ...PDEF, ...((arr && arr[i]) || {}) }));
  let padParams = newParams();
  const lastVoice = new Array(16).fill(null);
  const hits = [], notesAny = [];
  let padsOnCh10 = false;
  let calib = null;

