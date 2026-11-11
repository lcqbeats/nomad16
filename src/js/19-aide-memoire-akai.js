  // ---------- AIDE-MÉMOIRE AKAI (RÉGLAGES) : toutes les assignations, repliées par thème ----------
  function padGrid(labels, off = 0) {
    // disposition du MPK : 5-8 en haut, 1-4 en bas
    const cell = i => `<span><b>${i + 1 + off}</b>${labels[i] || "—"}</span>`;
    return `<div class="glgrid">${[4, 5, 6, 7, 0, 1, 2, 3].map(cell).join("")}</div>`;
  }
  function renderGlossary() {
    const el = $("glossary"); if (!el) return;
    const fxA = FX_PATTERNS.slice(0, 8).map(f => f.name), fxB = FX_PATTERNS.slice(8, 16).map(f => f.name);
    const kn = t => KNOB_LABELS[t].map((l, i) => `<span><b>${i + 1}</b>${l}</span>`).join("");
    const kits = kitIndex.slice(0, 16).map((k, i) => `<span><b>${i + 1}</b>${k.name}</span>`).join("");
    const sec = (title, body, open) => `<details class="gl"${open ? " open" : ""}><summary>${title}</summary><div>${body}</div></details>`;
    el.innerHTML = [
      sec("PARTOUT", `<p><b>Pédale Sustain</b> : REC / superposition du looper.</p><p><b>Clavier</b> : joue l'instrument de SONS (ou le pad choisi, transposé) ; en mode ACCORDS, les touches graves jouent les accords ; dans SCRATCH, il transpose le disque.</p><p><b>Potards</b> : changent de rôle selon l'onglet (voir POTARDS).</p>`, true),
      sec("BOUTON CC (pads en CC, preset 3)", `<p class="glh">Banque A</p>${padGrid(["Play / stop looper", "Annuler", "Muet piste 1", "Muet piste 2", "Muet piste 3", "Muet piste 4", "Muet piste 5", "Muet piste 6"])}<p class="glh">Banque B</p>${padGrid(["Kit précédent", "Kit suivant", "Morceau ▶/■", "Séquence ◀", "Note repeat", "Séquence ▶", "Onglet suivant", "Entrée guitare"], 8)}`),
      sec("BOUTON PROG CHANGE (charge un kit)", `<p>PROG CHANGE puis le pad n° : charge le kit n°.</p><div class="gllist">${kits}</div>`),
      sec("PADS EN NOTES, SELON L'ONGLET", `<p><b>PADS, LOOPER, SONG, SP, GUITARE</b> : les 16 sons du kit (banque A = 1 à 8, banque B = 9 à 16).</p>
        <p class="glh">FX · banque A : motifs</p>${padGrid(fxA)}<p class="glh">FX · banque B : textures</p>${padGrid(fxB, 8)}
        <p><b>DIGGING</b> : avec CHOP LIVE et le disque qui tourne, chaque pad pose sa découpe ; sinon, le kit.</p>
        <p><b>SONS</b> en mode ACCORDS : pads 1 à 7 = les accords du style choisi, pad 8 = le premier à l'octave ; banque B = une octave plus haut.</p>
        <p class="glh">SCRATCH · banque A (tenir)</p>${padGrid(["◀ Arrière", "Ouvre", "Coupe", "Baby", "▶ Avant", "Chirp", "Transform", "Flare"])}
        <p class="glh">SCRATCH · banque B</p>${padGrid(["Tear", "Stab", "Start / stop", "Au repère", "CUE 1", "CUE 2", "CUE 3", "CUE 4"], 8)}`),
      sec("POTARDS, SELON L'ONGLET", [["PADS", "play"], ["LOOPER", "loops"], ["SONG", "song"], ["FX", "fx"], ["SP", "sp"], ["DIGGING", "sample"], ["SCRATCH", "scratch"], ["SONS", "sons"], ["GUITARE", "guitar"]].map(([n, t]) => `<p class="glh">${n}</p><div class="glknobs">${kn(t)}</div>`).join(""))
    ].join("");
  }
