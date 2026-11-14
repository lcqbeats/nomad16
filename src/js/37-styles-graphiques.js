  // ---------- Styles graphiques ----------
  function setSkin(sk) {
    if (sk) document.documentElement.dataset.skin = sk; else delete document.documentElement.dataset.skin;
    document.querySelectorAll(".skin:not(.dskin):not(.ftype)").forEach(b => b.classList.toggle("on", b.dataset.skin === sk));
    store.set("skin", sk);
  }
  document.querySelectorAll(".skin:not(.dskin):not(.ftype)").forEach(b => b.addEventListener("click", () => setSkin(b.dataset.skin)));
  setSkin(store.get("skin", ""));
  // Lettrage : MPK (sérigraphie de l'Akai : capitales grasses façon Arial) ou NOMAD (d'origine)
  function setType(t) {
    if (t) document.documentElement.dataset.type = t; else delete document.documentElement.dataset.type;
    document.querySelectorAll(".ftype").forEach(b => b.classList.toggle("on", b.dataset.type === t));
    store.set("type", t);
  }
  document.querySelectorAll(".ftype").forEach(b => b.addEventListener("click", () => setType(b.dataset.type)));
  setType(store.get("type", "mpk"));

  // Apparence sur ordinateur : noire (façon 1000) ou grise (façon 2000XL)
  function setDeskSkin(d) {
    if (d) document.documentElement.dataset.desk = d; else delete document.documentElement.dataset.desk;
    document.querySelectorAll(".dskin").forEach(b => b.classList.toggle("on", b.dataset.desk === d));
    store.set("deskSkin", d);
  }
  document.querySelectorAll(".dskin").forEach(b => b.addEventListener("click", () => setDeskSkin(b.dataset.desk)));
  setDeskSkin(store.get("deskSkin", ""));
