  // ---------- ÉCRAN RETOURNÉ : l'iPhone posé tête en bas, prises vers le haut ----------
  // iOS ne tourne pas l'écran à l'envers sur les iPhone à encoche : NOMAD retourne donc lui-même toute la page.
  // Les coordonnées des doigts et des éléments sont remises à l'endroit, pour que tout le code de jeu reste inchangé.
  const FLIP = { on: false, wrap: null, scroll: null };
  (() => {
    const W = () => window.innerWidth, H = () => window.innerHeight;
    const gb = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      const r = gb.call(this);
      return FLIP.on ? new DOMRect(W() - r.right, H() - r.bottom, r.width, r.height) : r;
    };
    [window.MouseEvent && MouseEvent.prototype, window.Touch && Touch.prototype].filter(Boolean).forEach(P => {
      ["clientX", "clientY"].forEach(k => {
        const d = Object.getOwnPropertyDescriptor(P, k); if (!d || !d.get) return;
        Object.defineProperty(P, k, { configurable: true, enumerable: true, get() { const v = d.get.call(this); return FLIP.on ? (k === "clientX" ? W() : H()) - v : v; } });
      });
    });
  })();
  function setFlip(on) {
    FLIP.on = on; store.set("flip", on);
    if (on && !FLIP.wrap) {
      FLIP.wrap = document.createElement("div"); FLIP.wrap.id = "flip";
      FLIP.scroll = document.createElement("div"); FLIP.scroll.id = "flipScroll";
      FLIP.wrap.appendChild(FLIP.scroll);
      const kids = [...document.body.children].filter(el => el.tagName !== "SCRIPT");
      document.body.insertBefore(FLIP.wrap, document.body.firstChild);
      kids.forEach(el => (el.classList.contains("machine") ? FLIP.scroll : FLIP.wrap).appendChild(el));
    } else if (!on && FLIP.wrap) {
      const m = FLIP.scroll.querySelector(".machine");
      [m, ...[...FLIP.wrap.children].filter(el => el !== FLIP.scroll)].forEach(el => document.body.insertBefore(el, FLIP.wrap));
      FLIP.wrap.remove(); FLIP.wrap = FLIP.scroll = null;
    }
    document.documentElement.classList.toggle("flipped", on);
    const b = $("flipBtn"); if (b) { b.textContent = "ÉCRAN : " + (on ? "RETOURNÉ" : "À L'ENDROIT"); b.classList.toggle("on", on); }
    if (typeof resizeCanvas === "function") setTimeout(() => { try { resizeCanvas(); } catch (e) {} }, 50);
  }
  $("flipBtn").addEventListener("click", () => setFlip(!FLIP.on));
  $("flipPower").addEventListener("click", () => setFlip(!FLIP.on));
  setFlip(store.get("flip", false));
