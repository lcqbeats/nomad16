  // ---------- ORDINATEUR : mise en page paysage façon MPC 1000 sur grand écran avec souris ; touches F1 à F9 = onglets ----------
  const DESK_Q = window.matchMedia ? window.matchMedia("(min-width: 1000px) and (hover: hover) and (pointer: fine)") : null;
  let deskMode = store.get("layout", "auto");
  function applyDesk() {
    const on = deskMode === "desk" || (deskMode === "auto" && DESK_Q && DESK_Q.matches);
    document.documentElement.classList.toggle("desk", on);
    const b = $("layoutBtn"); if (b) b.textContent = "AFFICHAGE : " + { auto: "AUTOMATIQUE", phone: "TÉLÉPHONE", desk: "ORDINATEUR" }[deskMode];
    if (typeof drawSpPads === "function" && tab === "sp") drawSpPads();
  }
  TABS.forEach((t, i) => { const el = $("tab-" + t); if (el) el.dataset.f = "F" + (i + 1); });
  if (DESK_Q) { try { DESK_Q.addEventListener("change", applyDesk); } catch (e) { DESK_Q.addListener && DESK_Q.addListener(applyDesk); } }
  $("layoutBtn").addEventListener("click", () => { deskMode = { auto: "desk", desk: "phone", phone: "auto" }[deskMode]; store.set("layout", deskMode); applyDesk(); });
  window.addEventListener("keydown", e => {
    const m = /^F([1-9])$/.exec(e.key); if (!m) return;
    const t = TABS[+m[1] - 1]; if (!t) return;
    e.preventDefault(); setTab(t); lcd("lcdPad", "ONGLET", $("tab-" + t).textContent);
  });
  applyDesk();
