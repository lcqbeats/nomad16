  // ---------- Textes d'aide (masqués par défaut) ----------
  function setHelp(on) {
    if (on) document.documentElement.dataset.help = "1"; else delete document.documentElement.dataset.help;
    $("helpBtn").textContent = on ? "AFFICHÉS" : "MASQUÉS"; $("helpBtn").setAttribute("aria-pressed", on); $("helpBtn").classList.toggle("on", on);
    store.set("help", on);
  }
  setHelp(store.get("help", false) === true);
  $("helpBtn").addEventListener("click", () => setHelp(!document.documentElement.dataset.help));

