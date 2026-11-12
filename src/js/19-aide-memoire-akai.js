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
    const kits = PC_KITS.map(id => (kitIndex.find(k => k.id === id) || { name: id }).name);
    const sec = (title, body, open) => `<details class="gl"${open ? " open" : ""}><summary>${title}</summary><div>${body}</div></details>`;
    el.innerHTML = [
      sec("PARTOUT", `<p><b>Pédale Sustain</b> : REC / superposition du looper.</p><p><b>Clavier</b> : joue l'instrument de SONS (ou le pad choisi, transposé) ; en mode ACCORDS, les touches graves jouent les accords ; dans SCRATCH, il transpose le disque ; dans FX, les 8 premières touches blanches (do à do) choisissent la cible : TOUT, LIVE, P1 à P6.</p><p><b>Potards</b> : changent de rôle selon l'onglet (voir POTARDS).</p><p><b>Sur ordinateur</b> : touches & é " ' ( § è ! ç (ou F1 à F9) = onglets (PADS, LOOPER, SONS / DIGGING, SCRATCH, GUITARE / FX, SP, SONG, dans l'ordre de la grille), Espace = REC, Retour arrière = annuler.</p>`, true),
      sec("BOUTON CC (pads en CC, preset 3)", `<p class="glh">Banque A</p>${padGrid(["Play / stop looper", "Annuler", "Muet piste 1", "Muet piste 2", "Muet piste 3", "Muet piste 4", "Muet piste 5", "Muet piste 6"])}<p class="glh">Banque B</p>${padGrid(["Kit précédent", "Kit suivant", "Morceau ▶/■", "Séquence ◀", "Note repeat", "Séquence ▶", "Onglet suivant", "Guitare (onglet + entrée)"], 8)}`),
      sec("BOUTON PROG CHANGE (onglets et kits)", `<p>PROG CHANGE allumé, un pad, puis PROG CHANGE éteint pour rejouer.</p><p>Les numéros sous les onglets de l'iPhone rappellent le pad.</p><p class="glh">Banque A : aller à l'onglet</p>${padGrid(["PADS", "LOOPER", "SONS", "DIGGING", "SCRATCH", "GUITARE", "FX", "SP"])}<p class="glh">Banque B : charger le kit</p>${padGrid(kits, 8)}<p>Pad 16 en mode CC : allume l'entrée guitare et ouvre l'onglet.</p>`),
      sec("PADS EN NOTES, SELON L'ONGLET", `<p><b>PADS, SONG, SP, GUITARE</b> : les 16 sons du kit (banque A = 1 à 8, banque B = 9 à 16).</p>
        <p class="glh">LOOPER · banque A</p>${padGrid(["Muet piste 1", "Muet piste 2", "Muet piste 3", "Tout couper", "Muet piste 4", "Muet piste 5", "Muet piste 6", "Tout rétablir"])}
        <p class="glh">LOOPER · banque B</p>${padGrid(["Solo piste 1", "Solo piste 2", "Solo piste 3", "Tape stop", "Solo piste 4", "Solo piste 5", "Solo piste 6", "▶ Lecture"], 8)}
        <p class="glh">FX · banque A : motifs</p>${padGrid(fxA)}<p class="glh">FX · banque B : textures</p>${padGrid(fxB, 8)}
        <p class="glh">SP · banque A : couleur (appui court = allumé, long = tant qu'on tient)</p>${padGrid(SP_FX.slice(0, 8).map(f => f.name))}<p class="glh">SP · banque B : espace et jeu</p>${padGrid(SP_FX.slice(8).map(f => f.name), 8)}
        <p><b>DIGGING</b> : avec CHOP LIVE et le disque qui tourne, chaque pad pose sa découpe ; sinon, le kit.</p>
        <p><b>SONS</b> en mode ACCORDS : pads 1 à 7 = les accords du style choisi, pad 8 = le premier à l'octave ; banque B = une octave plus haut.</p>
        <p class="glh">SCRATCH · banque A</p>${padGrid(["◀ Arrière", "Ouvre", "Coupe", "Start / stop", "▶ Avant", "CUE 1", "CUE 2", "CUE 3"])}
        <p class="glh">SCRATCH · banque B (phrases tenues)</p>${padGrid(["Baby", "Chirp", "Transform", "◀ Repère", "Flare", "Tear", "Stab", "Repère ▶"], 8)}`),
      sec("POTARDS, SELON L'ONGLET", [["PADS", "play"], ["LOOPER", "loops"], ["SONG", "song"], ["FX", "fx"], ["SP", "sp"], ["DIGGING", "sample"], ["SCRATCH", "scratch"], ["SONS", "sons"], ["GUITARE", "guitar"]].map(([n, t]) => `<p class="glh">${n}</p><div class="glknobs">${kn(t)}</div>`).join(""))
    ].join("");
  }
