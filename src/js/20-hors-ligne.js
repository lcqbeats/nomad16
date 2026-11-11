  // ---------- HORS LIGNE : l'app et ses sons gardés dans l'appareil ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") { try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch (e) {} }
  const OFF = { busy: false };
  function offStatus(txt) { if ($("offInfo")) $("offInfo").textContent = txt; }
  async function warmOffline(full) {
    if (OFF.busy || !navigator.onLine || !("serviceWorker" in navigator)) { if (full && !navigator.onLine) offStatus("Pas de réseau : réessayez une fois connecté."); return; }
    OFF.busy = true;
    const get = u => fetch(u).then(r => { if (!r.ok) throw new Error(r.status); return r; });
    let n = 0, fail = 0;
    try {
      const idx = await (await get("kits/index.json")).json();
      for (const k of idx.kits) {
        offStatus(`Préparation : kit ${k.name}…`);
        try { const kj = await (await get(`kits/${k.id}/kit.json`)).json(); for (const p of kj.pads) { try { await (await get(`kits/${k.id}/${p.file}`)).arrayBuffer(); n++; } catch (e) { fail++; } } } catch (e) { fail++; }
      }
      if (full) {
        const inst = await (await get("sons/instruments.json")).json();
        for (const i of inst.instruments.filter(x => x.regions)) {
          offStatus(`Préparation : ${i.name}…`);
          for (const r of i.regions) { try { await (await get(i.base + r[0].split("/").map(encodeURIComponent).join("/") + ".m4a")).arrayBuffer(); n++; } catch (e) { fail++; } }
        }
        const cr = await (await get("crate/crate.json")).json();
        for (const [cid, title, ci] of SCR_LOC) { const c = cr.collections.find(x => x.id === cid), it = c && c.items.find(x => x.t === title); if (it && it.c[ci]) { try { await (await get(cr.base + cid + "/" + it.c[ci][0] + ".wav")).arrayBuffer(); n++; } catch (e) { fail++; } } }
      }
      store.set(full ? "offFull" : "offKits", Date.now());
      offStatus(full ? `Prêt hors ligne : kits, instruments et sons de scratch (${n} fichiers${fail ? `, ${fail} manquants` : ""}).` : `Kits prêts hors ligne (${n} sons). Instruments et bac : téléchargés au fur et à mesure.`);
    } catch (e) { offStatus("Préparation interrompue (réseau ?)."); }
    OFF.busy = false;
  }

