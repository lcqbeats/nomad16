  // ---------- ORDINATEUR : mise en page paysage façon MPC 1000 sur grand écran avec souris ; touches F1 à F9 = onglets ----------
  const DESK_Q = window.matchMedia ? window.matchMedia("(min-width: 1000px) and (hover: hover) and (pointer: fine)") : null;
  let deskMode = store.get("layout", "auto");
  function applyDesk() {
    const on = deskMode === "desk" || (deskMode === "auto" && DESK_Q && DESK_Q.matches);
    document.documentElement.classList.toggle("desk", on);
    const b = $("layoutBtn"); if (b) b.textContent = "AFFICHAGE : " + { auto: "AUTOMATIQUE", phone: "TÉLÉPHONE", desk: "ORDINATEUR" }[deskMode];
    if (typeof drawSpPads === "function" && tab === "sp") drawSpPads();
    if (typeof placeScrDisk === "function") placeScrDisk();
  }
  // grille 3×3 : jouer (PADS LOOPER SONS), matière (DIGGING SCRATCH GUITARE), finition (FX SP SONG), même ordre que sur téléphone
  TABS.forEach((t, i) => { const el = $("tab-" + t); if (el) el.dataset.f = i + 1; });
  if (DESK_Q) { try { DESK_Q.addEventListener("change", applyDesk); } catch (e) { DESK_Q.addListener && DESK_Q.addListener(applyDesk); } }
  $("layoutBtn").addEventListener("click", () => { deskMode = { auto: "desk", desk: "phone", phone: "auto" }[deskMode]; store.set("layout", deskMode); applyDesk(); });
  // rangée du haut d'un clavier AZERTY (Mac) sans Maj : & é " ' ( § è ! ç = onglets 1 à 9 ; F1 à F9 marchent aussi
  const AZ_TABS = ["&", "é", "\"", "'", "(", "§", "è", "!", "ç"];
  window.addEventListener("keydown", e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
    const m = /^F([1-9])$/.exec(e.key), a = AZ_TABS.indexOf(e.key);
    if (!m && a < 0) return;
    const t = TABS[m ? +m[1] - 1 : a]; if (!t) return;
    e.preventDefault(); setTab(t); lcd("lcdPad", "ONGLET", $("tab-" + t).textContent);
  });
  applyDesk();
