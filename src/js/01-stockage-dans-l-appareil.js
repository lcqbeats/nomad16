  // ---------- Stockage dans l'appareil (IndexedDB) ----------
  const DB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const r = indexedDB.open("nomad16", 2);
        r.onupgradeneeded = () => { const d = r.result; ["kits", "projects", "scratch"].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: "id" }); }); };
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    async tx(store, mode, fn) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const os = t.objectStore(store); const rq = fn(os); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); }); },
    put(store, obj) { return this.tx(store, "readwrite", os => os.put(obj)); },
    get(store, id) { return this.tx(store, "readonly", os => os.get(id)); },
    all(store) { return this.tx(store, "readonly", os => os.getAll()); },
    del(store, id) { return this.tx(store, "readwrite", os => os.delete(id)); }
  };
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  const packBuf = b => b ? { sr: b.sampleRate, ch: Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c).slice()) } : null;
  // version compacte (16 bits, moitié moins de place) pour les kits de chops gardés automatiquement
  const packBuf16 = b => b ? { sr: b.sampleRate, q: 1, ch: Array.from({ length: b.numberOfChannels }, (_, c) => { const d = b.getChannelData(c), o = new Int16Array(d.length); for (let i = 0; i < d.length; i++) o[i] = Math.max(-32767, Math.min(32767, Math.round(d[i] * 32767))); return o; }) } : null;
  const unpackBuf = o => { if (!o) return null; const b = ctx.createBuffer(o.ch.length, o.ch[0].length, o.sr); o.ch.forEach((d, c) => b.copyToChannel(o.q ? Float32Array.from(d, v => v / 32767) : d, c)); return b; };

