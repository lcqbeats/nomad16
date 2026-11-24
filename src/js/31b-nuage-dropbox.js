  // ---------- NUAGE (Dropbox) : mêmes projets sur le téléphone et l'ordinateur, sans serveur ni abonnement ----------
  // Connexion OAuth « PKCE » (pas de secret dans la page) ; jeton de rafraîchissement gardé dans l'appareil.
  // Les projets vont dans Dropbox › Applications › NOMAD16 › projets, au format .nomad (le même que FICHIER).
  const DBX_KEY = "5ii447sf90agytv";   // clé publique de l'app Dropbox « NOMAD16 lcqbeats » (dossier d'app, PKCE)
  const DBX_REDIRECT = location.origin + location.pathname.replace(/[^/]*$/, "");
  const inIosApp = () => !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nomadMidi);
  let DBX = store.get("dbx", null);   // { refresh, access, exp }
  const b64u = a => btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  // la paire PKCE est préparée d'avance : l'ouverture de Dropbox reste ainsi « directe » (iOS bloque une fenêtre ouverte après une attente)
  let PK = null;
  async function dbxPrep() {
    const ver = b64u(crypto.getRandomValues(new Uint8Array(48))), chal = b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ver)));
    PK = { ver, chal };
  }
  dbxPrep().catch(() => {});
  function dbxUrl(app) {
    const q = new URLSearchParams({ client_id: DBX_KEY, response_type: "code", code_challenge: PK.chal, code_challenge_method: "S256", token_access_type: "offline" });
    if (!app) q.set("redirect_uri", DBX_REDIRECT);
    return "https://www.dropbox.com/oauth2/authorize?" + q;
  }
  async function dbxLogin() {
    if (!DBX_KEY) { lcd("lcdPad", "NUAGE", "clé Dropbox pas encore installée"); return; }
    if (!PK) await dbxPrep();
    const ver = PK.ver; store.set("dbxVer", ver);
    const app = inIosApp(), url = dbxUrl(app);
    if (!app) { location.href = url; return; }
    // dans l'app iPhone : Dropbox s'ouvre dans Safari et affiche un code à recopier ici
    try { window.open(url, "_blank"); } catch (e) {}
    const pr = askName("CODE AFFICHÉ PAR DROPBOX (copier, revenir, coller)", "", 80, true);
    const f = document.querySelector(".namedlg form");
    if (f) {   // secours : lien à toucher si Safari ne s'est pas ouvert
      const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; a.className = "mini on dbxopen";
      a.textContent = "OUVRIR DROPBOX DANS SAFARI"; a.style.cssText = "display:block;text-align:center;margin:8px 0;padding:10px;text-decoration:none";
      f.insertBefore(a, f.querySelector("input"));
      const inp = f.querySelector("input"); inp.autocapitalize = "off"; inp.style.textTransform = "none";
    }
    const code = await pr;
    PK = null; dbxPrep().catch(() => {});
    if (code) await dbxToken({ code: code.trim(), grant_type: "authorization_code", code_verifier: ver });
  }
  async function dbxToken(params) {
    const r = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", body: new URLSearchParams({ client_id: DBX_KEY, ...params }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) { lcd("lcdPad", "NUAGE", "connexion refusée (" + (j.error_description || j.error || r.status) + ")"); return false; }
    DBX = { refresh: j.refresh_token || (DBX && DBX.refresh), access: j.access_token, exp: Date.now() + (j.expires_in || 14400) * 1000 - 60000 };
    store.set("dbx", DBX); drawCloud();
    if (params.grant_type === "authorization_code") lcd("lcdPad", "NUAGE", "Dropbox connecté : les projets enregistrés partent dans le nuage");
    return true;
  }
  async function dbxAccess() {
    if (!DBX || !DBX.refresh) return null;
    if (DBX.access && Date.now() < DBX.exp) return DBX.access;
    return (await dbxToken({ grant_type: "refresh_token", refresh_token: DBX.refresh })) ? DBX.access : null;
  }
  async function dbxCall(host, path, { arg, body, json } = {}) {
    const tok = await dbxAccess(); if (!tok) throw new Error("pas connecté");
    const h = { Authorization: "Bearer " + tok };
    if (arg) h["Dropbox-API-Arg"] = JSON.stringify(arg).replace(/[\u007f-￿]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
    if (json) h["Content-Type"] = "application/json"; else if (body) h["Content-Type"] = "application/octet-stream";
    const r = await fetch(`https://${host}.dropboxapi.com/2/${path}`, { method: "POST", headers: h, body: json ? JSON.stringify(json) : body });
    if (r.status === 401) { DBX.exp = 0; store.set("dbx", DBX); }
    if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(t.slice(0, 120) || String(r.status)); }
    return r;
  }
  // retour de Dropbox sur l'ordinateur : ?code=… dans l'adresse
  (async () => {
    const u = new URL(location.href), code = u.searchParams.get("code");
    if (!code || !DBX_KEY) return;
    history.replaceState(null, "", u.pathname);
    await dbxToken({ code, grant_type: "authorization_code", code_verifier: store.get("dbxVer", ""), redirect_uri: DBX_REDIRECT });
  })();
  const cloudName = p => ascii(p.name, 34) + " [" + p.id.replace(/^proj-/, "") + "].nomad";
  async function projectBlob(id) {
    const p = await DB.get("projects", id); if (!p) return null;
    const files = [], meta = packAudio(p, files);
    files.unshift({ name: "projet.json", data: JSON.stringify({ format: "nomad16", version: 1, project: meta }) });
    return { p, blob: makeZip(files) };
  }
  // envoi : en un coup jusqu'à 140 Mo, sinon par morceaux de 32 Mo
  async function cloudUpload(id, quiet) {
    if (!DBX || !id || id === "proj-auto") return;
    try {
      const x = await projectBlob(id); if (!x) return;
      const path = "/projets/" + cloudName(x.p), size = x.blob.size;
      if (!quiet) lcd("lcdPad", "NUAGE", "envoi de « " + x.p.name + " »…");
      // un ancien fichier du même projet sous un autre nom (projet renommé) est retiré
      try { const old = (await cloudList()).filter(f => f.name.endsWith("[" + id.replace(/^proj-/, "") + "].nomad") && f.path !== path); for (const f of old) await dbxCall("api", "files/delete_v2", { json: { path: f.path } }); } catch (e) {}
      if (size <= 140e6) await dbxCall("content", "files/upload", { arg: { path, mode: "overwrite", mute: true }, body: x.blob });
      else {
        const CH = 32e6; let off = 0, sid = null;
        while (off < size) {
          const part = x.blob.slice(off, Math.min(size, off + CH));
          if (!sid) sid = (await (await dbxCall("content", "files/upload_session/start", { arg: { close: false }, body: part })).json()).session_id;
          else if (off + CH < size) await dbxCall("content", "files/upload_session/append_v2", { arg: { cursor: { session_id: sid, offset: off }, close: false }, body: part });
          else await dbxCall("content", "files/upload_session/finish", { arg: { cursor: { session_id: sid, offset: off }, commit: { path, mode: "overwrite", mute: true } }, body: part });
          off += part.size;
          if (!quiet) lcd("lcdPad", "NUAGE", `envoi · ${Math.round(off / size * 100)} %`);
        }
      }
      lcd("lcdPad", "NUAGE", "« " + x.p.name + " » est dans le nuage (" + (size / 1e6).toFixed(1) + " Mo)");
      // l'aperçu à écouter part à côté (petit fichier, retrouvé par l'identifiant du projet)
      try { const w = projectPreview(x.p); if (w) await dbxCall("content", "files/upload", { arg: { path: apPath(id), mode: "overwrite", mute: true }, body: w }); } catch (e) {}
      if (!$("setSheet").hidden) drawCloudList();
    } catch (e) { lcd("lcdPad", "NUAGE", "envoi impossible : " + e.message); }
  }
  async function cloudList() {
    try {
      const r = await (await dbxCall("api", "files/list_folder", { json: { path: "/projets" } })).json();
      return r.entries.filter(e => e[".tag"] === "file" && /\.nomad$/i.test(e.name)).map(e => ({ name: e.name, path: e.path_lower, size: e.size, date: new Date(e.server_modified) }));
    } catch (e) { if (/not_found/.test(e.message)) return []; throw e; }
  }
  const apPath = id => "/apercus/" + id.replace(/^proj-/, "") + ".wav";
  const cloudId = f => { const m = f.name.match(/\[([^\]]+)\]\.nomad$/i); return m ? "proj-" + m[1] : null; };
  // aperçu d'un projet du nuage : le petit fichier s'il existe, sinon on le calcule depuis le projet (et on le range pour la prochaine fois)
  async function cloudPreview(f) {
    const id = cloudId(f);
    if (id) { try { return await (await dbxCall("content", "files/download", { arg: { path: apPath(id) } })).blob(); } catch (e) {} }
    lcd("lcdPad", "APERÇU", "premier aperçu : lecture du projet dans le nuage…");
    const files = readZip(new Uint8Array(await (await (await dbxCall("content", "files/download", { arg: { path: f.path } })).blob()).arrayBuffer()));
    const j = JSON.parse(new TextDecoder().decode(files["projet.json"])), w = projectPreview(unpackAudio(j.project, files));
    if (w && id) dbxCall("content", "files/upload", { arg: { path: apPath(id), mode: "overwrite", mute: true }, body: w }).catch(() => {});
    return w;
  }
  async function cloudOpen(f) {
    try {
      lcd("lcdPad", "NUAGE", "téléchargement de " + f.name.replace(/ \[.*$/, "") + "…");
      const blob = await (await dbxCall("content", "files/download", { arg: { path: f.path } })).blob();
      await importProjectFile(new File([blob], f.name));
    } catch (e) { lcd("lcdPad", "NUAGE", "ouverture impossible : " + e.message); }
  }
  async function drawCloudList() {
    const box = $("cloudList"); if (!box) return;
    if (!DBX) { box.innerHTML = ""; return; }
    box.innerHTML = "<p class='help'>lecture du nuage…</p>";
    let list = [];
    try { list = await cloudList(); } catch (e) { box.innerHTML = "<p class='help'>nuage injoignable : " + e.message + "</p>"; return; }
    list.sort((a, b) => b.date - a.date);
    box.innerHTML = list.length ? "" : "<p class='help'>Aucun projet dans le nuage pour l'instant : SAVE ou ENREGISTRER SOUS en envoie un.</p>";
    list.forEach(f => {
      const row = document.createElement("div"); row.className = "item-row";
      const b = document.createElement("button"); b.type = "button"; b.className = "kititem";
      b.innerHTML = `☁ ${f.name.replace(/ \[[^\]]*\]\.nomad$/i, "").replace(/\.nomad$/i, "")}<small>${f.date.toLocaleDateString()} ${f.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${(f.size / 1e6).toFixed(1)} Mo</small>`;
      b.addEventListener("click", () => cloudOpen(f));
      const del = document.createElement("button"); del.type = "button"; del.className = "mini"; del.textContent = "SUPPR.";
      del.addEventListener("click", async () => { if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "SÛR ?"; return; } if (AP.btn === ap) apStop(); try { await dbxCall("api", "files/delete_v2", { json: { path: f.path } }); lcd("lcdPad", "NUAGE", "« " + f.name.replace(/ \[.*$/, "") + " » supprimé du nuage"); } catch (e) { lcd("lcdPad", "NUAGE", "suppression impossible : " + e.message); }
        const id = cloudId(f); if (id) dbxCall("api", "files/delete_v2", { json: { path: apPath(id) } }).catch(() => {});
        drawCloudList(); });
      const ap = apButton(() => cloudPreview(f));
      row.appendChild(b); row.appendChild(ap); row.appendChild(del); box.appendChild(row);
    });
  }
  function drawCloud() {
    const st = $("cloudState"), bt = $("cloudBtn"); if (!st) return;
    st.textContent = !DBX_KEY ? "Pas encore disponible : la clé Dropbox de NOMAD reste à installer." : DBX ? (cloudAuto() ? "Connecté à Dropbox : chaque SAVE enregistre dans l'appareil ET envoie le projet dans le nuage." : "Connecté à Dropbox : SAVE enregistre seulement dans l'appareil ; le bouton ☁ d'un projet l'envoie dans le nuage.") + " Touchez un projet ☁ pour l'ouvrir ici, ▶ pour en écouter un extrait." : "Pas connecté. Un compte Dropbox gratuit suffit (2 Go, sans carte bancaire).";
    const au = $("cloudAuto"); if (au) { au.hidden = !DBX; au.textContent = "ENVOI AU NUAGE À CHAQUE SAVE : " + (cloudAuto() ? "OUI" : "NON"); au.classList.toggle("on", cloudAuto()); }
    bt.textContent = DBX ? "DÉCONNECTER DROPBOX" : "SE CONNECTER À DROPBOX";
    bt.disabled = !DBX_KEY;
    drawCloudList();
  }
  $("cloudBtn").addEventListener("click", () => { if (DBX) { DBX = null; store.set("dbx", null); drawCloud(); lcd("lcdPad", "NUAGE", "Dropbox déconnecté (les projets restent dans le nuage)"); } else dbxLogin(); });
  $("cloudRefresh").addEventListener("click", drawCloudList);
  // choix : SAVE dans l'appareil seulement, ou dans l'appareil + le nuage
  function cloudAuto() { return store.get("cloudAuto", true) !== false; }
  $("cloudAuto").addEventListener("click", () => { store.set("cloudAuto", !cloudAuto()); renderProjects(); });
