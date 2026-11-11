  // ---------- EQ 3 bandes par pad ----------
  function eqChain(c, pp, head) {
    [["lowshelf", 200, "eqL"], ["peaking", 1000, "eqM"], ["highshelf", 5000, "eqH"]].forEach(([type, f, k]) => {
      if (!pp[k]) return;
      const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.gain.value = pp[k]; if (type === "peaking") b.Q.value = 0.8;
      head.connect(b); head = b;
    });
    return head;
  }

