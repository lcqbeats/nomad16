  "use strict";
  const BASE_NOTE = 36;
  const MAX_LAYERS = 6;
  const COLORS = ["#d92b2f", "#22a35a", "#ece3d3", "#d92b2f", "#22a35a", "#ece3d3"];
  const SYNTH_NAMES = ["Kick","Snare","Hat","Open hat","Clap","Rim","Shaker","Snap","Tom bas","Tom haut","Conga","Cloche","Ride","Basse 808","Stab","Blip"];
  const KNOB_LABELS = {
    play: ["Filtre", "Écho", "Saleté", "Attaque", "Tune", "Decay", "Pan", "Niveau"],
    sp: ["Vinyle", "Cassette", "Lo-fi", "Graves", "Médiums", "Aigus", "Sortie SP", "—"],
    song: ["Piste 1", "Piste 2", "Piste 3", "Piste 4", "Piste 5", "Piste 6", "Boucles", "Métronome"],
    loops: ["Piste 1", "Piste 2", "Piste 3", "Piste 4", "Piste 5", "Piste 6", "Boucles", "Undo ↻"],
    guitar: ["Gain", "Basses", "Médiums", "Aigus", "Présence", "Réverbe", "Master", "Écho"],
    fx: ["Filtre", "Réso", "Envoi écho", "Temps", "Retour", "Ressort", "Bitcrush", "Master"],
    sample: ["Bac ↻", "Pitch", "Sensib.", "Découpes", "—", "—", "—", "Volume"],
    sons: ["Volume", "Relâche", "Filtre", "Réverbe", "Octave", "Tonalité", "Style", "Accord ↻"],
    scratch: ["Volume", "Pitch", "Filtre", "Démarrage", "Freinage", "Coupure", "Main", "Fader"]
  };
  const knobVals = { play: [0.5, 0, 0, 0, 0.5, 1, 0.5, 0.8], loops: [1, 1, 1, 1, 1, 1, 0.9, 0], guitar: [0.5, 0.5, 0.5, 0.5, 0.5, 0.3, 0.6, 0.3], fx: [0.5, 0.2, 0, 0.5, 0.55, 0, 0, 0.85], sample: [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0.9], sons: [0.8, 0.35, 1, 0.25, 0.5, 0, 0, 0], song: [1, 1, 1, 1, 1, 1, 0.9, 0.6], sp: [0, 0, 0, 0.5, 0.5, 0.5, 0.8, 0], scratch: [0.85, 0.5, 0.5, 0.2, 0.3, 0.3, 0, 0.2] };
  let tab = "play";

  let chPads, chSons, chGtr, chMaster, spIn, mixOut, ctx, sr, echoIn, liveIn, filter, drive, delay, delayFb, delayWet, padOut, liveBus, loopBus, master, fxOut;
  const store = {
    get(k, d) { try { const v = localStorage.getItem("nomad16." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("nomad16." + k, JSON.stringify(v)); } catch (e) {} }
  };
  const $ = id => document.getElementById(id);
  function lcd(id, label, value, cls) { if (!$(id)) return; $(id).innerHTML = `<span class="k">${label}&nbsp;</span><span class="${cls || ""}">${value}</span>`; }

