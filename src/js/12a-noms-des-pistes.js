  // ---------- Noms : petite fenêtre de saisie (pas de prompt(), que l'app iPhone n'affiche pas) ----------
  function askName(title, value, max = 16) {
    return new Promise(res => {
      const ov = document.createElement("div"); ov.className = "namedlg";
      ov.innerHTML = `<form><b></b><input type="text" autocomplete="off" autocapitalize="characters" spellcheck="false"><div><button type="button" class="mini" data-a="x">ANNULER</button><button type="button" class="mini" data-a="clr">EFFACER</button><button type="submit" class="mini on">OK</button></div></form>`;
      const f = ov.querySelector("form"), inp = ov.querySelector("input");
      ov.querySelector("b").textContent = title; inp.value = value || ""; inp.maxLength = max;
      const done = v => { ov.remove(); res(v); };
      f.addEventListener("submit", e => { e.preventDefault(); done(inp.value.trim().toUpperCase()); });
      ov.querySelector('[data-a="x"]').addEventListener("click", () => done(null));
      ov.querySelector('[data-a="clr"]').addEventListener("click", () => done(""));
      ov.addEventListener("pointerdown", e => { if (e.target === ov) done(null); });
      inp.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") done(null); });
      inp.addEventListener("keyup", e => e.stopPropagation());
      document.body.appendChild(ov); setTimeout(() => { inp.focus(); inp.select(); }, 30);
    });
  }
  // nom affiché d'une piste de la bank affichée : son nom, sinon « P1 » / « PISTE 1 »
  const layerName = (i, long) => { const l = LP.layers[i]; return (l && l.name) || (long ? "PISTE " : "P") + (i + 1); };
  async function renameLayer(i) {
    const l = LP.layers[i]; if (!l) return;
    const v = await askName(`NOM DE LA PISTE ${i + 1} · BANK ${SEQ_N[SQ.cur]}`, l.name, 12);
    if (v === null) return;
    l.name = v; drawTargetNames(); drawSeqSel();
    lcd("lcdLoop", "PISTE " + (i + 1), v ? "s'appelle " + v : "nom effacé");
  }
  // les boutons P1 à P6 de FX et SP prennent le nom des pistes
  function drawTargetNames() {
    document.querySelectorAll(".fxt, .spt").forEach(b => { const t = b.dataset.t; if (/^\d$/.test(t)) { const l = LP.layers[+t - 1]; b.textContent = l && l.name ? l.name.slice(0, 6) : "P" + t; b.title = l && l.name ? `P${t} · ${l.name}` : "P" + t; } });
  }
