"""Tests de NOMAD-16 dans un vrai navigateur (Chromium, sans écran).

  pip install pytest playwright && python -m playwright install chromium
  python -m pytest tests -q

Chaque test démarre la page, allume le son et vérifie un morceau du fonctionnement.
Les sons sont mesurés à la sortie (nomadProbe) ; les événements MIDI sont simulés (nomadMidi).
"""
import functools, http.server, io, math, os, socketserver, threading, zipfile
import pytest
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8799


@pytest.fixture(scope="session")
def server():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{PORT}/index.html"
    httpd.shutdown()


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        kw = {"args": ["--autoplay-policy=no-user-gesture-required", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]}
        if os.environ.get("CHROME_PATH"):
            kw["executable_path"] = os.environ["CHROME_PATH"]
        b = p.chromium.launch(**kw)
        yield b
        b.close()


@pytest.fixture
def app(browser, server):
    ctx = browser.new_context(viewport={"width": 414, "height": 896}, accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e) + " " + str(e.stack)[:600]))
    page.goto(server)
    page.wait_for_timeout(500)
    page.click("#powerBtn")
    page.wait_for_function("window.nomadState && nomadState().bufs > 0 && document.getElementById('kitName').textContent.indexOf('…') < 0", timeout=15000)
    page.wait_for_timeout(500)
    page.errors = errors
    yield page
    assert not errors, errors
    ctx.close()


def loud(page, ms=150):
    page.wait_for_timeout(ms)
    return page.evaluate("nomadProbe()")


def fake_loop(page, seconds=1.0):
    page.evaluate(f"""(() => {{ const L = nomadDbg.LP, s = nomadState();
      L.Lf = Math.round({seconds} * nomadDbg.sr); L.beats = 2; L.t0F = Math.round(s.now * nomadDbg.sr); L.playing = true; }})()""")


def test_tous_les_onglets_s_ouvrent(app):
    for t in ["play", "loops", "song", "fx", "sp", "sample", "scratch", "sons", "guitar"]:
        app.click(f"#tab-{t}")
        app.wait_for_timeout(150)
        assert app.is_visible(f"#view-{t}")


def test_un_pad_sonne(app):
    peaks = []
    for _ in range(3):
        app.evaluate("nomadMidi([0x99, 36, 120])")
        peaks.append(loud(app, 40))
    assert max(peaks) > 0.01, peaks


def test_onglet_suivant_au_pad_cc(app):
    app.evaluate("nomadMidi([0xB0, 34, 127])")
    assert app.get_attribute("#tab-loops", "aria-selected") == "true"


def test_piste_du_looper_rejouee(app):
    fake_loop(app)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0)")
    peak = max(loud(app, 120) for _ in range(10))
    assert peak > 0.01
    assert app.evaluate("nomadDbg.LP.layers.length") == 1


def test_fx_motif_sans_erreur(app):
    app.click("#tab-fx")
    fake_loop(app)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0)")
    app.evaluate("nomadMidi([0x99, 36, 100])")
    app.wait_for_timeout(600)
    app.evaluate("nomadMidi([0x89, 36, 0])")


def test_scratch_main_sur_le_disque(app):
    app.click("#tab-scratch")
    app.wait_for_function("nomadDbg.SCR.N > 0", timeout=10000)
    box = app.query_selector("#scrCanvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    app.mouse.move(cx + 120, cy)
    app.mouse.down()
    peaks = []
    for i in range(24):
        a = i * 0.12
        app.mouse.move(cx + 120 * math.cos(a), cy + 120 * math.sin(a))
        app.wait_for_timeout(16)
        if i % 6 == 5:
            peaks.append(app.evaluate("nomadProbe()"))
    app.mouse.up()
    assert max(peaks) > 0.01


def test_scratch_pads_avant_phrase_et_cue(app):
    app.click("#tab-scratch")
    app.wait_for_function("nomadDbg.SCR.N > 0", timeout=10000)
    p0 = app.evaluate("nomadDbg.SCR.rep.pos")
    app.evaluate("nomadMidi([0x99, 37, 30])")           # pad 2 : avant (vitesse constante, frappe douce)
    app.wait_for_timeout(200)
    app.evaluate("nomadMidi([0x89, 37, 0])")
    app.wait_for_timeout(100)
    assert app.evaluate("nomadDbg.SCR.rep.pos") > p0
    app.evaluate("nomadMidi([0x99, 40, 100]); nomadMidi([0x89, 40, 0])")   # pad 5 : CUE 1
    assert app.evaluate("nomadDbg.SCR.cues[0]") is not None
    app.evaluate("nomadMidi([0x90, 49, 100])")          # do#3 : baby, tenu
    app.wait_for_timeout(500)
    assert app.evaluate("nomadDbg.SCR.ph") == 0
    app.evaluate("nomadMidi([0x80, 49, 0])")
    app.wait_for_timeout(100)
    assert app.evaluate("nomadDbg.SCR.ph") == -1
    app.evaluate("nomadMidi([0x90, 70, 100])")          # la#4 : 10e phrase
    app.wait_for_timeout(300)
    assert app.evaluate("nomadDbg.SCR.ph") == 9
    app.evaluate("nomadMidi([0x80, 70, 0])")
    # pad 3 : crossfader fermé, puis ouvert au coup suivant
    app.evaluate("nomadMidi([0x99, 38, 100]); nomadMidi([0x89, 38, 0])")
    assert app.evaluate("nomadDbg.SCR.gate") is False
    app.evaluate("nomadMidi([0x99, 38, 100]); nomadMidi([0x89, 38, 0])")
    assert app.evaluate("nomadDbg.SCR.gate") is True


def test_aide_memoire(app):
    app.click("#gearBtn")
    assert app.query_selector_all("#glossary details").__len__() == 5
    app.click("#glossary details:nth-child(4) summary")
    assert "CUE 3" in app.inner_text("#glossary")


def test_sauvegarde_auto_et_reprise(app):
    fake_loop(app)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[1], 1, 0)")
    app.evaluate("nomadDbg.autoSave(true)")
    app.wait_for_timeout(400)
    app.reload()
    app.wait_for_selector("#resumeBtn:not([hidden])", timeout=5000)
    app.click("#resumeBtn")
    app.wait_for_function("nomadDbg.LP.layers.length === 1", timeout=10000)


def test_sauvegarde_complete_aller_retour(app):
    fake_loop(app)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[1], 1, 0)")
    app.evaluate("nomadDbg.autoSave(true)")
    app.wait_for_timeout(300)
    with app.expect_download() as dl:
        app.evaluate("nomadDbg.exportBackup()")
    path = dl.value.path()
    z = zipfile.ZipFile(path)
    assert "projet.json" in z.namelist()
    app.evaluate("nomadDbg.dbClear()")
    app.wait_for_timeout(200)
    app.click("#gearBtn")
    app.set_input_files("#projFile", path)
    app.wait_for_timeout(1000)
    assert "1 projet" in app.inner_text("#lcdPad")


def test_export_mpc(app):
    fake_loop(app)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0)")
    app.evaluate("nomadMidi([0x99, 36, 100])")
    app.click("#tab-loops")
    with app.expect_download(timeout=20000) as dl:
        app.click("#expMpc")
    names = zipfile.ZipFile(dl.value.path()).namelist()
    assert any(n.endswith(".xpm") for n in names)
    assert any(n.endswith(".wav") for n in names)


def test_hors_ligne(browser, server):
    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto(server)
    page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=10000)
    page.reload()
    page.wait_for_timeout(500)
    ctx.set_offline(True)
    page.reload()
    assert page.is_visible("#powerBtn")
    ctx.close()


def test_presentation_depuis_l_accueil(browser, server):
    ctx = browser.new_context(viewport={"width": 414, "height": 896})
    page = ctx.new_page()
    page.goto(server)
    page.click("#tourBtn")
    assert page.is_visible("#tour")
    for _ in range(5):
        page.click("#tourNext")
    assert page.inner_text("#tourNext") == "TERMINER"
    page.click("#tourNext")
    assert not page.is_visible("#tour")
    ctx.close()


def test_temoin_rec_sans_erreur(app):
    app.click("#gearBtn")
    assert app.locator("#tapLedBtn").count() == 0       # témoin TAP TEMPO retiré
    app.click("#padLedBtn")
    app.evaluate("nomadMidi([0xB0, 64, 127])")   # Sustain : REC armé
    app.evaluate("nomadMidi([0x99, 36, 100])")
    app.wait_for_timeout(300)
    app.click("#padLedBtn")


def test_notes_du_looper_vers_mid(app):
    app.evaluate("nomadMidi([0xB0, 64, 127]); nomadMidi([0xB0, 64, 0])")   # REC armé
    for i, note in enumerate([36, 38, 36, 38]):
        app.evaluate(f"nomadMidi([0x99, {note}, 100])")
        app.wait_for_timeout(250)
    app.evaluate("nomadMidi([0xB0, 64, 127]); nomadMidi([0xB0, 64, 0]); nomadMidi([0x99, 36, 100])")   # fermeture sur le temps
    app.wait_for_function("nomadDbg.LP.layers.length === 1", timeout=5000)
    n = app.evaluate("nomadDbg.LP.layers[0].notes.length")
    assert n >= 3, n
    app.click("#tab-loops")
    with app.expect_download(timeout=20000) as dl:
        app.click("#expMpc")
    z = zipfile.ZipFile(dl.value.path())
    mids = [x for x in z.namelist() if x.endswith(".mid")]
    assert mids
    data = z.read(mids[0])
    assert data[:4] == b"MThd" and data.count(b"MTrk") == 2
    assert bytes([0x99, 37]) in data   # pad 1 → note 37 (A01) sur le canal 10


def test_prog_change_onglets_et_kits(app):
    app.evaluate("nomadMidi([0xC0, 4])")
    assert app.get_attribute("#tab-scratch", "aria-selected") == "true"
    app.evaluate("nomadMidi([0xC0, 0])")
    assert app.get_attribute("#tab-play", "aria-selected") == "true"
    app.evaluate("nomadMidi([0xC0, 9])")      # banque B pad 2 = RZA
    app.wait_for_function("nomadState().kit === 'rza'", timeout=8000)


def test_remplacer_le_son_d_un_pad(app):
    app.click("#edBtn")
    app.click("#edSrcBtn")
    app.wait_for_function("document.querySelectorAll('#srcList .kititem').length > 40", timeout=8000)
    item = app.locator("#srcList .kititem").nth(20)      # un son d'un kit fourni
    row_use = app.locator("#srcList .item-row").nth(20).locator(".mini")
    name = item.inner_text()
    item.click()                                         # écoute
    app.wait_for_function("!document.getElementById('srcUse').disabled", timeout=5000)
    assert app.evaluate("nomadState().names[0]") == "Kick"   # pas encore remplacé
    row_use.click()                                      # UTILISER sur la ligne
    app.wait_for_function("document.getElementById('srcSheet').hidden", timeout=5000)
    assert app.evaluate("nomadState().names[0]") == name
    app.click("#undoBtn")
    assert app.evaluate("nomadState().names[0]") == "Kick"


def test_ecran_retourne(app):
    app.click("#gearBtn")
    app.click("#flipBtn")
    app.click("#setClose")
    assert app.evaluate("document.documentElement.classList.contains('flipped')")
    # un pad touché à l'écran (retourné) joue bien ce pad
    app.click("#tab-play")
    pad = app.locator("#pads .pad").nth(5)
    num = pad.locator(".n").inner_text()[:2]
    pad.click()
    assert num in app.inner_text("#lcdPad")
    # le fader de SCRATCH suit le doigt du bon côté
    app.click("#tab-scratch")
    app.wait_for_function("nomadDbg.SCR.N > 0", timeout=10000)
    app.locator("#scrFader").scroll_into_view_if_needed()
    box = app.locator("#scrFader").bounding_box()
    # visuellement retourné : le côté gauche du fader est à droite de l'écran
    app.mouse.click(box["x"] + box["width"] - 20, box["y"] + box["height"] / 2)
    assert app.evaluate("nomadDbg.SCR.fader") < 0.1
    app.click("#gearBtn")
    app.click("#flipBtn")
    assert not app.evaluate("document.documentElement.classList.contains('flipped')")


def test_looper_pads_coupent_les_pistes(app):
    fake_loop(app)
    for i in range(4):
        app.evaluate(f"nomadDbg.addLayer(nomadDbg.buffers[{i}], 1, 0)")
    app.click("#tab-loops")
    app.evaluate("nomadMidi([0x99, 40, 100])")   # pad 5 → piste 1 (rangée du haut = pistes 1 à 3)
    assert app.evaluate("nomadDbg.LP.layers[0].muted") is True
    app.evaluate("nomadMidi([0x99, 40, 100])")
    assert app.evaluate("nomadDbg.LP.layers[0].muted") is False
    app.evaluate("nomadMidi([0x99, 36, 100])")   # pad 1 → piste 4
    assert app.evaluate("nomadDbg.LP.layers[3].muted") is True


def test_sons_accords_ranges_comme_les_pads(app):
    app.click("#tab-sons")
    app.click("#mChords")
    cells = app.locator("#chords .chord span").all_inner_texts()
    assert "pad 5" in cells[0] and "pad 1" in cells[4]
    app.click("#mFull")
    assert "on" in app.get_attribute("#mFull", "class")


def test_looper_tout_couper_solo_tape_stop_lecture(app):
    fake_loop(app)
    for i in range(3):
        app.evaluate(f"nomadDbg.addLayer(nomadDbg.buffers[{i}], 1, 0)")
    app.click("#tab-loops")
    mutes = lambda: app.evaluate("nomadDbg.LP.layers.map(l => l.muted)")
    app.evaluate("nomadMidi([0x99, 39, 100])")       # pad 4 : tout couper
    assert mutes() == [True, True, True]
    app.evaluate("nomadMidi([0x99, 43, 100])")       # pad 8 : tout rétablir
    assert mutes() == [False, False, False]
    app.evaluate("nomadMidi([0x99, 49, 100])")       # pad 14 : solo piste 2
    assert mutes() == [True, False, True]
    app.evaluate("nomadMidi([0x99, 49, 100])")       # fin du solo
    assert mutes() == [False, False, False]
    app.evaluate("nomadMidi([0x99, 47, 100])")       # pad 12 : tape stop
    app.wait_for_timeout(1300)
    assert app.evaluate("nomadDbg.LP.playing") is False
    app.evaluate("nomadMidi([0x99, 51, 100])")       # pad 16 : lecture
    assert app.evaluate("nomadDbg.LP.playing") is True
    assert max(loud(app, 100) for _ in range(6)) > 0.01


def test_sons_strum(app):
    app.click("#tab-sons")
    app.click("#mChords")
    app.evaluate("nomadMidi([0xB0, 77, 0]); nomadMidi([0xB0, 77, 100])")      # potard 8 : strum (reprise douce depuis 0)
    assert "ms" in app.inner_text("#lcdPad")
    app.evaluate("nomadMidi([0x99, 36, 100])")      # pad 1 : accord
    app.wait_for_timeout(600)
    app.evaluate("nomadMidi([0x89, 36, 0])")


def test_scratch_reprise_immediate_moteur(app):
    app.click("#tab-scratch")
    app.wait_for_function("nomadDbg.SCR.N > 0", timeout=10000)
    app.evaluate("nomadMidi([0x99, 39, 100]); nomadMidi([0x89, 39, 0])")   # pad 4 : play
    app.wait_for_timeout(400)
    assert app.evaluate("nomadDbg.SCR.motor") is True
    app.evaluate("nomadMidi([0x99, 36, 100])")          # pad 1 : arrière
    app.wait_for_timeout(200)
    app.evaluate("nomadMidi([0x89, 36, 0])")
    app.wait_for_timeout(120)
    assert app.evaluate("nomadDbg.SCR.rep.vel") > 0.5    # déjà reparti en avant
    app.evaluate("nomadMidi([0x99, 43, 100]); nomadMidi([0x89, 43, 0])")   # pad 8 : CUE 4
    assert app.evaluate("nomadDbg.SCR.cues[3] !== null")
    app.evaluate("nomadMidi([0x99, 44, 100])")          # pad 9 (banque B) = pad 1 : arrière
    app.wait_for_timeout(150)
    assert app.evaluate("nomadDbg.SCR.rep.vel") < 0
    app.evaluate("nomadMidi([0x89, 44, 0])")
    # potards : écho, delay, reverb existent et réagissent
    app.evaluate("for (const cc of [72, 73, 74]) for (let v = 0; v <= 127; v += 8) nomadMidi([0xB0, cc, Math.min(127, v)])")
    app.wait_for_timeout(200)
    assert app.evaluate("nomadDbg.SCR.fx.es.gain.value > 0.3 && nomadDbg.SCR.fx.ds.gain.value > 0.3 && nomadDbg.SCR.fx.rs.gain.value > 0.3")
    app.evaluate("nomadMidi([0x99, 39, 100]); nomadMidi([0x89, 39, 0])")   # pad 4 : stop
    assert app.evaluate("nomadDbg.SCR.motor") is False


def test_longueur_des_pistes(app):
    fake_loop(app)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0)")
    app.click("#tab-loops")
    n = app.evaluate("nomadDbg.LP.layers[0].buf.length")
    app.click("#lenDouble")
    assert app.evaluate("[nomadDbg.LP.layers[0].k, nomadDbg.LP.layers[0].buf.length]") == [2, 2 * n]
    app.click("#lenHalf")
    assert app.evaluate("nomadDbg.LP.layers[0].k") == 1
    app.click("#lenHalf")    # k = 1 : demi-boucle répétée, même longueur
    assert app.evaluate("[nomadDbg.LP.layers[0].k, nomadDbg.LP.layers[0].buf.length]") == [1, n]
    app.click("#undoBtn")
    app.click("#lenNext")
    assert "×2" in app.inner_text("#lenNext")
    app.evaluate("nomadMidi([0xB0, 77, 0])")      # potard 8 du LOOPER : ÷2
    assert "÷2" in app.inner_text("#lenNext")
    # bouton de l'écran au-dessus du cercle : ÷2 → ×1 → ×2 → ×4
    seq = []
    for _ in range(3):
        app.click("#lcdLen"); seq.append(app.inner_text("#lcdLen"))
    assert seq == ["×1", "×2", "×4"], seq
    assert "×4" in app.inner_text("#lenNext")


def test_prochaine_piste_demi_boucle(app):
    app.evaluate("nomadMidi([0xB0, 64, 127]); nomadMidi([0xB0, 64, 0])")
    for note in [36, 38, 36, 38]:
        app.evaluate(f"nomadMidi([0x99, {note}, 100])")
        app.wait_for_timeout(250)
    app.evaluate("nomadMidi([0xB0, 64, 127]); nomadMidi([0xB0, 64, 0]); nomadMidi([0x99, 36, 100])")
    app.wait_for_function("nomadDbg.LP.layers.length === 1", timeout=5000)
    app.click("#tab-loops")
    app.click("#lenNext"); app.click("#lenNext"); app.click("#lenNext")   # ×1 → ×2 → ×4 → ÷2
    assert "÷2" in app.inner_text("#lenNext")
    app.evaluate("nomadMidi([0xB0, 64, 127]); nomadMidi([0xB0, 64, 0])")
    app.wait_for_function("nomadDbg.LP.layers.length === 2", timeout=8000)
    assert app.evaluate("nomadDbg.LP.layers[1].buf.length === nomadDbg.LP.Lf && nomadDbg.LP.layers[1].k === 1")


def test_sons_effets(app):
    app.click("#tab-sons")
    app.wait_for_function("document.querySelectorAll('#sonsFx .fxpre').length >= 14", timeout=5000)
    for i in range(1, 15):
        app.locator("#sonsFx .fxpre").nth(i).click()
        app.evaluate("nomadMidi([0x90, 60, 100])")
        app.wait_for_timeout(80)
        app.evaluate("nomadMidi([0x80, 60, 0])")
    app.locator("#sonsFx .fxpre").nth(1).click()
    assert "DREAMY" in app.inner_text("#lcdPad")
    app.evaluate("nomadMidi([0x90, 64, 110])")
    assert max(loud(app, 80) for _ in range(5)) > 0.005


def test_sons_dose_attaque_sidechain(app):
    app.click("#tab-sons")
    labels = app.evaluate("[...document.querySelectorAll('#knobs .knob span, #knobs label')].map(e => e.textContent).join(' ')")
    assert "Effet" in labels and "Attaque" in labels
    app.locator("#sonsFx .fxpre").nth(1).click()
    app.evaluate("nomadMidi([0xB0, 75, 127]); nomadMidi([0xB0, 75, 64])")     # potard 6 : dose de l'effet
    assert "dosé" in app.inner_text("#lcdPad")
    app.evaluate("nomadMidi([0xB0, 76, 0]); nomadMidi([0xB0, 76, 90])")       # potard 7 : attaque
    assert "montée" in app.inner_text("#lcdPad")
    app.evaluate("nomadMidi([0xB0, 76, 0]); nomadMidi([0xB0, 75, 127])")
    app.click("#mDuck"); app.click("#mDuck")
    assert "FORT" in app.inner_text("#mDuck")
    app.locator("#cats .cat", has_text="20SYL").click()
    app.locator("#insts .inst").nth(4).click()        # nappe tenue
    assert app.evaluate("!!nomadDbg.duck")
    # une note tenue, des kicks sur les pads : la sortie de SONS se creuse puis remonte
    app.evaluate("""() => { const d = nomadDbg.duck, c = d.context, an = c.createAnalyser(); an.fftSize = 512; d.connect(an);
      window._duckLv = []; const buf = new Float32Array(512);
      window._duckT = setInterval(() => { an.getFloatTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v)); _duckLv.push(m); }, 10); }""")
    app.evaluate("nomadMidi([0x90, 60, 120])")
    app.wait_for_timeout(500)
    for _ in range(3):
        app.evaluate("nomadMidi([0x99, 36, 127])"); app.wait_for_timeout(60); app.evaluate("nomadMidi([0x89, 36, 0])"); app.wait_for_timeout(500)
    lv = app.evaluate("clearInterval(_duckT), _duckLv")
    app.evaluate("nomadMidi([0x80, 60, 0])")
    steady = sorted(lv[20:])[len(lv[20:]) * 3 // 4]
    assert steady > 0.01 and min(lv[45:]) < steady * 0.5, (steady, min(lv[45:]))
    app.click("#mDuck")
    assert "LÉGER" not in app.inner_text("#mDuck") and "FORT" not in app.inner_text("#mDuck")


def test_fx_clavier_et_prog_change(app):
    app.click("#tab-fx")
    app.evaluate("nomadMidi([0x90, 52, 100]); nomadMidi([0x80, 52, 0])")     # MI = P1
    assert app.get_attribute(".fxt[data-t='1']", "class").endswith("on")
    app.evaluate("nomadMidi([0x99, 36, 100]); nomadMidi([0x89, 36, 0])")     # pad (canal 10) : le clavier est reconnu
    app.evaluate("nomadMidi([0x90, 48, 100]); nomadMidi([0x80, 48, 0])")     # DO = TOUT
    assert "on" in app.get_attribute(".fxt[data-t='all']", "class")
    app.evaluate("nomadMidi([0xC0, 2])")            # PROG CHANGE pad 3 = SONS
    assert app.get_attribute("#tab-sons", "aria-selected") == "true"
    assert app.get_attribute("#tab-song", "data-pc") is None
    assert app.get_attribute("#tab-sons", "data-pc") == "3"


def test_sp_station_effets(app):
    app.click("#tab-sp")
    assert app.locator("#spFxGrid .spfx").count() == 16
    app.evaluate("nomadMidi([0x99, 36, 100]); nomadMidi([0x89, 36, 0])")     # pad 1 : SP COMP, appui court = allumé
    assert "on" in app.get_attribute("#spFxGrid .spfx >> nth=12", "class")
    assert "SP COMP" in app.inner_text("#spSeg") + app.inner_text("#spSegSub")
    app.evaluate("nomadMidi([0x99, 44, 100])")       # pad 9 : LOOPER DJ tenu
    app.wait_for_timeout(500)
    app.evaluate("nomadMidi([0x89, 44, 0])")         # appui long : s'éteint au relâché
    assert "on" not in app.get_attribute("#spFxGrid .spfx >> nth=4", "class").split()
    labels = app.evaluate("[...document.querySelectorAll('#knobs label')].map(e => e.textContent)")
    assert labels[0] == "Longueur" and labels[2] == "Dosage"
    for n in range(36, 52):                          # tous les effets ensemble : la sortie reste propre
        app.evaluate(f"nomadMidi([0x99, {n}, 100]); nomadMidi([0x89, {n}, 0])")
    app.evaluate("nomadMidi([0xB0, 64, 0])")
    app.click("#tab-play"); app.evaluate("nomadMidi([0x99, 36, 110])"); app.click("#tab-sp")
    lv = max(loud(app, 80) for _ in range(6))
    assert 0.0005 < lv < 2.5, lv
    app.click("#spAllOff")
    assert app.locator("#spFxGrid .spfx.on").count() == 0
    # potard 8 : à gauche tout coupe, à droite tout revient
    app.evaluate("nomadMidi([0x99, 36, 100]); nomadMidi([0x89, 36, 0]); nomadMidi([0x99, 47, 100]); nomadMidi([0x89, 47, 0])")
    assert app.locator("#spFxGrid .spfx.on").count() == 2
    app.evaluate("nomadMidi([0xB0, 77, 127]); nomadMidi([0xB0, 77, 0])")
    assert app.locator("#spFxGrid .spfx.on").count() == 0
    app.evaluate("nomadMidi([0xB0, 77, 127])")
    assert app.locator("#spFxGrid .spfx.on").count() == 2
    # potard 7 : découpe en swing, le slicer suit sans erreur
    app.evaluate("nomadMidi([0xB0, 76, 0]); nomadMidi([0xB0, 76, 110])")
    assert "swing" in app.inner_text("#lcdPad").lower()


def test_sp_imprime_sur_une_piste(app):
    fake_loop(app, 0.6)
    app.evaluate("""() => { const c = nomadDbg.sp.in.context, n = nomadDbg.LP.Lf, b = c.createBuffer(2, n, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.3; }
      nomadDbg.addLayer(b, 1, 0); }""")
    rms = "(() => { const d = nomadDbg.LP.layers[0].buf.getChannelData(0); let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); })()"
    before = app.evaluate(rms)
    app.click("#tab-sp")
    app.evaluate("nomadMidi([0x99, 49, 100]); nomadMidi([0x89, 49, 0])")     # pad 14 : KILL AIGUS
    app.evaluate("nomadMidi([0x90, 50, 100]); nomadMidi([0x80, 50, 0])")     # RÉ = P1
    assert "on" in app.get_attribute(".spt[data-t='1']", "class")
    app.evaluate("nomadMidi([0xB0, 64, 127]); nomadMidi([0xB0, 64, 0])")     # Sustain : imprimer
    assert "ARRÊTER" in app.inner_text("#spPrint")
    app.wait_for_function("!document.getElementById('spPrint').classList.contains('on')", timeout=6000)
    after = app.evaluate(rms)
    assert after < before * 0.6, (before, after)
    assert app.locator("#spFxGrid .spfx.on").count() == 0       # effets remis à zéro
    app.click("#undoBtn")
    assert abs(app.evaluate(rms) - before) < 1e-6


def test_sp_impression_bien_calee(app):
    # sans effet, l'impression rend la même piste, au même endroit de la boucle
    fake_loop(app, 0.5)
    app.evaluate("""() => { const c = nomadDbg.sp.in.context, n = nomadDbg.LP.Lf, b = c.createBuffer(2, n, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = Math.sin(i / 7) * 0.2 + ((i % 4000) < 30 ? 0.5 : 0); }
      nomadDbg.addLayer(b, 1, 0); window._orig = b.getChannelData(0).slice(); }""")
    app.click("#tab-sp")
    app.click(".spt[data-t='1']")
    app.click("#spPrint")
    app.wait_for_function("!document.getElementById('spPrint').classList.contains('on')", timeout=6000)
    err = app.evaluate("(() => { const d = nomadDbg.LP.layers[0].buf.getChannelData(0); let e = 0, s = 0; for (let i = 0; i < d.length; i++) { e += (d[i] - _orig[i]) ** 2; s += _orig[i] ** 2; } return Math.sqrt(e / s); })()")
    info = app.evaluate("(() => { const d = nomadDbg.LP.layers[0].buf.getChannelData(0), n = d.length; let best = [1e9, 0]; for (let lag = -300; lag <= 300; lag++) { let e = 0; for (let i = 0; i < n; i += 3) { const j = (i + lag + n) % n; e += (d[j] - _orig[i]) ** 2; } if (e < best[0]) best = [e, lag]; } let r = 0, o = 0; for (let i = 0; i < n; i++) { r += d[i] * d[i]; o += _orig[i] * _orig[i]; } return [best[1], Math.sqrt(r / o)]; })()")
    assert abs(info[0]) <= 2 and abs(info[1] - 1) < 0.03, (err, info)   # calé à 2 échantillons près, même niveau


def test_fx_imprime_et_clavier_joue_sons(app):
    fake_loop(app, 0.6)
    app.evaluate("""() => { const c = nomadDbg.sp.in.context, n = nomadDbg.LP.Lf, b = c.createBuffer(2, n, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.3; }
      nomadDbg.addLayer(b, 1, 0); }""")
    rms = "(() => { const d = nomadDbg.LP.layers[0].buf.getChannelData(0); let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); })()"
    before = app.evaluate(rms)
    app.click("#tab-fx")
    app.evaluate("nomadMidi([0x99, 36, 100]); nomadMidi([0x89, 36, 0])")     # une note de pad (canal 10) pour que le clavier soit reconnu
    app.evaluate("nomadMidi([0x90, 52, 100]); nomadMidi([0x80, 52, 0])")     # MI = P1
    assert "on" in app.get_attribute(".fxt[data-t='1']", "class")
    assert "PISTE 1" in app.inner_text("#fxPrint")
    app.evaluate("nomadMidi([0xB0, 70, 64]); nomadMidi([0xB0, 70, 4])")      # filtre fermé
    app.evaluate("nomadMidi([0xB0, 64, 127]); nomadMidi([0xB0, 64, 0])")     # Sustain : imprimer
    app.wait_for_function("!document.getElementById('fxPrint').classList.contains('on')", timeout=6000)
    after = app.evaluate(rms)
    assert after < before * 0.5, (before, after)
    app.click("#undoBtn")
    assert abs(app.evaluate(rms) - before) < 1e-6
    # hors des 8 touches blanches du bas, le clavier joue SONS dans FX
    app.evaluate("nomadMidi([0x90, 64, 110])")
    assert max(loud(app, 80) for _ in range(5)) > 0.003
    app.evaluate("nomadMidi([0x80, 64, 0])")


def test_digging_zoom_cretes_nettoyage(app):
    app.click("#tab-sample")
    app.evaluate("""() => { const c = nomadDbg.sp.in.context, sr = c.sampleRate, n = sr * 4, b = c.createBuffer(2, n, sr);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.02; for (let k = 0; k < 6; k++) { const s0 = Math.floor((0.3 + k * 0.6) * sr); for (let i = 0; i < sr * 0.25; i++) d[s0 + i] += Math.sin(i / 9) * 0.4 * Math.exp(-i / (sr * 0.08)); } for (let k = 0; k < 20; k++) d[Math.floor(sr * (0.15 + k * 0.19))] += 0.6; }
      nomadDbg.setClip(b, "test"); }""")
    app.click("#chCrest")
    n = app.evaluate("nomadDbg.chops.length")
    assert 4 <= n <= 16, n
    app.click("#chClear")
    assert app.evaluate("nomadDbg.chops.length") == 1
    app.click("#wzIn"); app.click("#wzIn")
    assert app.inner_text("#wzVal") == "×4"
    app.fill("#wStart", "500")
    assert app.inner_text("#wStartVal").startswith("0:02")
    quiet = "(() => { const d = nomadDbg.clip.buf.getChannelData(0), sr = nomadDbg.sr; let s = 0; for (let i = Math.floor(sr * 3.95); i < sr * 4 - 10; i++) s += d[i] * d[i]; return Math.sqrt(s / (sr * 0.05)); })()"
    q0 = app.evaluate(quiet)
    app.click("#clClick"); app.wait_for_function("document.getElementById('digLoad').hidden", timeout=8000)
    assert "craquements enlevés" in app.inner_text("#lcdPad")
    app.click("#clHiss"); app.wait_for_function("document.getElementById('digLoad').hidden && /souffle/.test(document.getElementById('lcdPad').textContent)", timeout=15000)
    assert app.evaluate(quiet) < q0 * 0.6
    app.click("#clNorm")
    app.wait_for_function("/normalisé/.test(document.getElementById('lcdPad').textContent)", timeout=5000)
    pk = app.evaluate("(() => { let m = 0; for (const v of nomadDbg.clip.buf.getChannelData(0)) m = Math.max(m, Math.abs(v)); return m; })()")
    assert 0.9 < pk <= 0.95
    app.click("#clOrig")
    assert app.evaluate("nomadDbg.clip.buf === nomadDbg.clip.orig")


def test_fx_sur_piste_apres_sp(app):
    # une piste choisie dans SP puis dans FX : FX la reprend et ses effets s'entendent
    fake_loop(app, 0.6)
    app.evaluate("""() => { const c = nomadDbg.sp.in.context, n = nomadDbg.LP.Lf, b = c.createBuffer(2, n, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.3; }
      nomadDbg.addLayer(b, 1, 0);
      const o = nomadDbg.sp.out, an = c.createAnalyser(); an.fftSize = 2048; o.connect(an); window._b2 = new Float32Array(2048);
      window._lv2 = () => { an.getFloatTimeDomainData(_b2); let s = 0; for (const v of _b2) s += v * v; return Math.sqrt(s / 2048); }; }""")
    app.click("#tab-sp"); app.click(".spt[data-t='1']")
    app.click("#tab-fx"); app.click(".fxt[data-t='1']")
    assert "on" not in app.get_attribute(".spt[data-t='1']", "class").split()
    def lv():
        v = []
        for _ in range(6):
            app.wait_for_timeout(60); v.append(app.evaluate("_lv2()"))
        return sum(v) / len(v)
    open_ = lv()
    app.evaluate("nomadMidi([0xB0, 70, 64]); nomadMidi([0xB0, 70, 3])")
    assert lv() < open_ * 0.5


def test_kit_de_chops_garde_et_nomme(app):
    app.click("#tab-sample")
    app.evaluate("""() => { const c = nomadDbg.sp.in.context, sr = c.sampleRate, n = sr * 2, b = c.createBuffer(2, n, sr);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let k = 0; k < 4; k++) { const s0 = Math.floor((0.1 + k * 0.45) * sr); for (let i = 0; i < sr * 0.2; i++) d[s0 + i] = Math.sin(i / 9) * 0.5 * Math.exp(-i / (sr * 0.05)); } }
      nomadDbg.setClip(b, "Black and white · extrait 2"); }""")
    app.click("#chEq8"); app.click("#toPads")
    app.wait_for_function("/CHOPS · BLACK AND WHITE 2/.test(document.getElementById('kitName').textContent)", timeout=8000)
    app.evaluate("nomadMidi([0xC0, 13])")      # PROG CHANGE : un autre kit
    app.wait_for_function("!/CHOPS/.test(document.getElementById('kitName').textContent)", timeout=8000)
    assert app.evaluate("nomadState().bufs") > 0
    ids = app.evaluate("(async () => (await new Promise(r => { const q = indexedDB.open('nomad16'); q.onsuccess = () => { const t = q.result.transaction('kits').objectStore('kits').getAll(); t.onsuccess = () => r(t.result.map(k => k.name)); }; })))()")
    assert "CHOPS · BLACK AND WHITE 2" in ids, ids
    # on y revient : les chops sont bien là
    app.evaluate("nomadDbg.loadKit(nomadDbg.kitIndex.find(k => /BLACK AND WHITE/.test(k.name)).id)")
    app.wait_for_function("/CHOPS · BLACK AND WHITE 2/.test(document.getElementById('kitName').textContent) && nomadDbg.buffers[0]", timeout=8000)
    assert app.evaluate("Math.max(...nomadDbg.buffers[0].getChannelData(0))") > 0.3


def test_tonalite_et_piano(app):
    fake_loop(app, 2.0)
    app.evaluate("""() => { const c = nomadDbg.sp.in.context, n = nomadDbg.LP.Lf, sr = c.sampleRate, b = c.createBuffer(2, n, sr);
      const f = m => 440 * Math.pow(2, (m - 69) / 12), notes = [[48, 1], [60, .8], [64, .7], [67, .7], [72, .4], [55, .5]];
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) { let v = 0; notes.forEach(([m, a]) => v += Math.sin(2 * Math.PI * f(m) * i / sr) * a); d[i] = v * 0.08; } }
      nomadDbg.addLayer(b, 1, 0); }""")
    app.wait_for_function("/· C( |$)/.test(document.getElementById('lcdTr').textContent)", timeout=6000)
    app.click("#tab-sons")
    app.click("#mChords")
    assert "C" in app.inner_text("#keyFromLoop")
    app.click("#keyUp"); app.click("#keyFromLoop")
    assert app.inner_text("#keyVal") in ("C", "Am")
    app.click("#mNotes")
    app.click("#pianoBtn")
    assert app.is_visible("#pKeys")
    box = app.locator(".pk.w >> nth=2").bounding_box()
    app.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] - 10)
    app.mouse.down()
    assert app.locator(".pk.on").count() == 1
    assert max(loud(app, 60) for _ in range(5)) > 0.003
    app.mouse.up()
    assert app.locator(".pk.on").count() == 0
    app.click("#pClose")
    assert not app.is_visible("#pKeys")


def test_save_du_projet_en_cours(app):
    fake_loop(app, 0.5)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0)")
    app.click("#saveBtn")
    app.wait_for_function("/enregistré/.test(document.getElementById('lcdPad').textContent)", timeout=8000)
    n1 = app.evaluate("new Promise(r => { const q = indexedDB.open('nomad16'); q.onsuccess = () => { const t = q.result.transaction('projects').objectStore('projects').getAll(); t.onsuccess = () => r(t.result.filter(p => p.id !== 'proj-auto').length); }; })")
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[1], 1, 0)")
    app.keyboard.press("Control+s")
    app.wait_for_timeout(1500)
    projs = app.evaluate("new Promise(r => { const q = indexedDB.open('nomad16'); q.onsuccess = () => { const t = q.result.transaction('projects').objectStore('projects').getAll(); t.onsuccess = () => r(t.result.filter(p => p.id !== 'proj-auto').map(p => p.loop.seqs[0].length)); }; })")
    assert len(projs) == n1 and max(projs) == 2, projs     # même projet, mis à jour (2 pistes), pas un nouveau


def test_fx_32_motifs(app):
    fake_loop(app, 1.0)
    app.evaluate("""() => { const c = nomadDbg.sp.in.context, n = nomadDbg.LP.Lf, sr = c.sampleRate, b = c.createBuffer(2, n, sr);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = Math.sin(i / 20) * 0.3 * Math.exp(-(i % (sr / 4)) / (sr * 0.1)); }
      nomadDbg.addLayer(b, 1, 0);
      const o = nomadDbg.sp.out, an = c.createAnalyser(); an.fftSize = 2048; o.connect(an); window._b3 = new Float32Array(2048);
      window._pk3 = () => { an.getFloatTimeDomainData(_b3); let m = 0, bad = 0; for (const v of _b3) { if (!isFinite(v)) bad++; m = Math.max(m, Math.abs(v)); } return [m, bad]; }; }""")
    app.click("#tab-fx")
    app.evaluate("nomadMidi([0x99, 36, 100]); nomadMidi([0x89, 36, 0])")
    app.evaluate("nomadMidi([0x90, 49, 100]); nomadMidi([0x80, 49, 0])")     # DO# : page 17 à 32
    assert "17" in app.inner_text("#fxSet")
    assert app.locator("#fxgrid svg").count() == 16
    for i in range(16):
        app.evaluate(f"nomadMidi([0x99, {36 + i}, 100])")
        worst = [0, 0]
        for _ in range(4):
            app.wait_for_timeout(70); m, bad = app.evaluate("_pk3()"); worst = [max(worst[0], m), worst[1] + bad]
        app.evaluate(f"nomadMidi([0x89, {36 + i}, 0])")
        assert worst[1] == 0 and worst[0] < 1.5, (i + 17, worst)
    app.click("#fxSet")
    assert "1–16" in app.inner_text("#fxSet")


def test_doubler_aligne_les_autres_pistes(app):
    fake_loop(app, 0.5)
    for i in range(2):
        app.evaluate(f"nomadDbg.addLayer(nomadDbg.buffers[{i}].length >= nomadDbg.LP.Lf ? nomadDbg.buffers[{i}] : (() => {{ const b = nomadDbg.sp.in.context.createBuffer(2, nomadDbg.LP.Lf, nomadDbg.sr); b.copyToChannel(nomadDbg.buffers[{i}].getChannelData(0), 0); return b; }})(), 1, 0)")
    app.click("#tab-loops")
    n0 = app.evaluate("nomadDbg.LP.layers[1].buf.length")
    app.click("#lenSel")      # piste choisie : la dernière, puis on boucle sur la 1
    app.evaluate("nomadDbg.LP.sel = 0")
    app.click("#lenDouble")
    assert app.evaluate("nomadDbg.LP.layers.map(l => l.k)") == [2, 2]
    assert app.evaluate("nomadDbg.LP.layers[1].buf.length") == n0 * 2
    app.click("#undoBtn")
    assert app.evaluate("nomadDbg.LP.layers.map(l => l.k)") == [1, 1]


def test_prise_du_looper_vers_song(app):
    fake_loop(app, 0.4)
    for i in range(3):
        app.evaluate(f"nomadDbg.addLayer(nomadDbg.buffers[{i}], 1, 0)")
    app.click("#tab-loops")
    app.click("#btnPlay")                            # stop
    assert app.evaluate("nomadDbg.LP.playing") is False
    app.evaluate("nomadMidi([0x99, 37, 100])")       # pad 2 : piste 5 inexistante, sans effet ; pad 6 : piste 2 coupée au départ
    app.evaluate("nomadMidi([0x99, 41, 100])")
    app.click("#perfRec")
    assert "ARMÉE" in app.inner_text("#perfRec")
    app.click("#btnPlay")                            # PLAY lance la prise
    assert "FIN DE PRISE" in app.inner_text("#perfRec")
    app.wait_for_timeout(700)
    app.evaluate("nomadMidi([0x99, 40, 100])")       # pad 5 : piste 1 coupée
    app.wait_for_timeout(700)
    app.evaluate("nomadMidi([0x99, 41, 100])")       # piste 2 revient
    app.wait_for_timeout(500)
    app.click("#btnPlay")                            # STOP termine la prise
    st = app.evaluate("nomadDbg.song.steps[nomadDbg.song.steps.length - 1]")
    ev = st["take"]["ev"]                            # état de départ des 3 banks, puis 2 gestes sur la bank A
    assert ev[0]["mask"][:2] == [False, True] and [e["seq"] for e in ev] == [0, 1, 2, 0, 0], st
    assert st["take"]["len"] % app.evaluate("nomadDbg.LP.Lf") == 0
    app.click("#tab-song")
    assert "PRISE" in app.inner_text("#songList")
    # rejouer la prise depuis SONG : la piste 2 part coupée, puis la piste 1 se coupe au bon moment
    app.locator(".songrow.take button[data-a='go']").click()
    app.wait_for_timeout(150)
    assert app.evaluate("nomadDbg.LP.layers.map(l => l.muted)")[:2] == [False, True]
    app.wait_for_timeout(900)
    assert app.evaluate("nomadDbg.LP.layers[0].muted") is True
    app.click("#songPlay")
    with app.expect_download() as dl:
        app.click("#songWav")
    assert dl.value.suggested_filename.startswith("nomad16-morceau")


def test_collections_fkj_dub_lofi(app):
    app.click("#tab-sons")
    assert app.locator("#cats .cat").all_inner_texts()[:4] == ["20SYL", "FKJ", "DUB", "LO-FI"]
    app.locator("#cats .cat", has_text="DUB").first.click()
    app.locator("#insts .inst", has_text="MÉLODICA").click()
    app.evaluate("nomadMidi([0x90, 64, 100])")
    assert max(loud(app, 60) for _ in range(5)) > 0.003
    app.evaluate("nomadMidi([0x80, 64, 0])")


def test_basse_octave_et_table(app):
    # OCT −1 : une note de 220 Hz ressort à 110 Hz
    f = app.evaluate("""() => new Promise(res => { const c = nomadDbg.sp.in.context, o = c.createOscillator(), w = new AudioWorkletNode(c, "nomad-oct", { outputChannelCount: [1] }), an = c.createAnalyser(), z = c.createGain();
      an.fftSize = 16384; z.gain.value = 0; o.frequency.value = 220; o.connect(w); w.connect(an); an.connect(z); z.connect(c.destination); o.start();
      setTimeout(() => { const d = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(d); let bi = 0; for (let i = 5; i < d.length; i++) if (d[i] > d[bi]) bi = i; o.stop(); res(bi * c.sampleRate / an.fftSize); }, 700); })""")
    assert 100 < f < 120, f
    app.click("#tab-guitar")
    assert app.locator("#presets .preset", has_text="BASSE DUB").count() == 1
    app.locator("#presets .preset", has_text="BASSE DUB").click()
    assert "on" in app.get_attribute("#pd-oct", "class")
    # table de mixage : pistes du looper, AUTO règle panoramique et niveaux
    fake_loop(app, 0.5)
    for i in range(3):
        app.evaluate(f"nomadDbg.addLayer(nomadDbg.buffers[{i}], 1, 0)")
    app.click("#mixBtn")
    assert app.locator(".mixrow.lps .mch:not(.empty)").count() == 3
    app.click("[data-mixp=wide]")
    pans = app.evaluate("nomadDbg.LP.layers.map(l => l.pan)")
    assert pans[0] < 0 < pans[1], pans
    app.click("[data-mixp=flat]")
    assert app.evaluate("nomadDbg.LP.layers.every(l => !l.pan && !l.hp)")
    app.click("#mixClose")


def test_famille_20syl(app):
    app.click("#tab-sons")
    app.locator("#cats .cat", has_text="20SYL").click()
    insts = app.locator("#insts .inst")
    assert insts.count() == 12
    for i in range(12):
        insts.nth(i).click()
        app.evaluate("nomadMidi([0x90, 48, 110])")
        peak = max(loud(app, 40) for _ in range(4))
        app.evaluate("nomadMidi([0x80, 60, 0])")
        assert peak > 0.003, (i, peak)


def test_mastering_export(app):
    import struct
    fake_loop(app, 2.0)
    for i in range(3):
        app.evaluate(f"nomadDbg.addLayer(nomadDbg.buffers[{i}], 1, 0)")
    app.click("#tab-song")
    assert "NATUREL" in app.inner_text("#mChar")
    app.click("#mChar")                       # CHAUD
    app.click("#tab-loops")
    with app.expect_download(timeout=30000) as dl:
        app.click("#expLoop")
    data = open(dl.value.path(), "rb").read()
    assert b"WAVE" in data[:12]
    samples = struct.unpack("<%dh" % ((len(data) - 44) // 2), data[44:])
    peak = max(abs(x) for x in samples) / 32768
    assert 0.5 < peak <= 0.9, peak            # poussé vers le volume cible, plafond -1 dBFS
    assert "master-chaud" in dl.value.suggested_filename


def test_ordinateur_paysage_et_touches_f(browser, server):
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e) + " " + str(e.stack)[:600]))
    page.goto(server)
    page.wait_for_timeout(400)
    assert page.evaluate("document.documentElement.classList.contains('desk')")
    page.click("#powerBtn")
    page.wait_for_function("window.nomadState && nomadState().bufs > 0", timeout=15000)
    page.keyboard.press("F3")
    assert page.get_attribute("#tab-sons", "aria-selected") == "true"
    page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'è' }))")
    assert page.get_attribute("#tab-fx", "aria-selected") == "true"
    page.keyboard.press("F9")
    assert page.get_attribute("#tab-song", "aria-selected") == "true"
    # la grille suit l'ordre jouer / matière / finition
    xs = page.evaluate("['play','loops','sons','sample','scratch','guitar','fx','sp','song'].map(t => { const r = document.getElementById('tab-' + t).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.left)]; })")
    assert xs == sorted(xs), xs
    # Espace = play / stop
    page.evaluate("""(() => { const L = nomadDbg.LP, s = nomadState(); L.Lf = Math.round(0.5 * nomadDbg.sr); L.beats = 2; L.t0F = Math.round(s.now * nomadDbg.sr); L.playing = true; nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0); })()""")
    page.keyboard.press("Space")
    assert page.evaluate("nomadDbg.LP.playing") is False
    page.keyboard.press("Space")
    assert page.evaluate("nomadDbg.LP.playing") is True
    # FX : les 16 pads s'affichent d'un coup sur ordinateur
    page.keyboard.press("F7")
    assert page.evaluate("[...document.querySelectorAll('.fxpad')].filter(e => e.offsetParent).length") == 16
    page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '&' }))")
    assert page.get_attribute("#tab-play", "aria-selected") == "true"
    page.keyboard.press("F2")
    assert page.get_attribute("#tab-loops", "aria-selected") == "true"
    # la grille de pads est à droite de l'écran
    page.keyboard.press("F1")
    assert page.locator("#pads").bounding_box()["x"] > 500
    assert not errors, errors
    ctx.close()


def test_telephone_reste_en_portrait(app):
    assert not app.evaluate("document.documentElement.classList.contains('desk')")


def test_banks_jouent_ensemble(app):
    fake_loop(app, 2.0)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0)")
    app.click("#tab-loops")
    app.evaluate("nomadMidi([0x99, 51, 100])")      # un pad sur le canal 10 (pad 16 = lecture) : le clavier est sur le canal 1
    app.evaluate("nomadMidi([0x90, 50, 100])")      # ré (2e touche blanche) : bank B, sans arrêter la lecture
    assert app.evaluate("nomadDbg.SQ.cur") == 1 and app.evaluate("nomadDbg.LP.playing") is True
    assert app.evaluate("nomadDbg.LP.layers.length") == 0
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[1], 1, 0)")
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[2], 1, 0)")
    # les pistes des deux banks jouent en même temps
    assert app.evaluate("nomadDbg.SQ.list.map(x => x.filter(l => l.src).length)") == [1, 2, 0]
    assert "1/1" in app.inner_text("#sq0") and "2/2" in app.inner_text("#sq1")
    # tout couper (pad 4) n'agit que sur la bank affichée
    app.evaluate("nomadMidi([0x99, 39, 100])")
    assert app.evaluate("nomadDbg.SQ.list.map(x => x.map(l => l.muted))") == [[False], [True, True], []]
    # une prise retient les gestes sur plusieurs banks
    app.click("#btnPlay")                            # stop
    app.evaluate("nomadDbg.perfArm()")
    app.click("#btnPlay")                            # PLAY lance la prise
    app.wait_for_timeout(300)
    app.evaluate("nomadMidi([0x99, 40, 100])")       # pad 5 : piste 1 de B rétablie
    app.evaluate("nomadMidi([0x90, 48, 100])")       # do : bank A
    assert app.evaluate("nomadDbg.SQ.cur") == 0
    app.evaluate("nomadMidi([0x99, 40, 100])")       # piste 1 de A coupée
    app.wait_for_timeout(300)
    app.evaluate("nomadDbg.perfArm()")               # fin de prise
    ev = app.evaluate("nomadDbg.song.steps[nomadDbg.song.steps.length - 1].take.ev")
    assert [e["seq"] for e in ev] == [0, 1, 2, 1, 0] and ev[3]["mask"][:2] == [False, True] and ev[4]["mask"][0] is True
    # rejouer : on repart de l'état de départ des deux banks
    app.evaluate("nomadDbg.songPlay(0)")
    app.wait_for_timeout(100)
    assert app.evaluate("nomadDbg.SQ.list.map(x => x.map(l => l.muted))")[:2] == [[False], [True, True]]
    app.evaluate("nomadDbg.songStop()")
    # stop / play agit sur les 3 banks
    app.click("#btnPlay")
    assert app.evaluate("nomadDbg.SQ.list.flat().every(l => !l.src)")
    app.click("#btnPlay")
    assert app.evaluate("nomadDbg.SQ.list.flat().every(l => l.src)")


def test_fx_suit_la_bank_affichee(app):
    fake_loop(app, 0.4)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0)")
    app.evaluate("nomadDbg.selectSeq(1)")
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[1], 1, 0)")
    app.click("#tab-fx")
    app.evaluate("nomadMidi([0x99, 36, 1]); nomadMidi([0x89, 36, 0])")
    app.evaluate("nomadMidi([0x90, 52, 100])")       # mi : FX sur P1 = piste 1 de la bank B
    app.evaluate("nomadDbg.selectSeq(0)")
    app.evaluate("nomadDbg.selectSeq(1)")
    assert app.evaluate("nomadDbg.SQ.cur") == 1 and app.evaluate("nomadDbg.SQ.list.flat().every(l => l.src)")


def test_ancien_projet_converti_en_banks(app):
    fake_loop(app, 0.4)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0)")
    # ancien morceau : séquence A ×2, puis une prise qui passait de A à D
    steps = app.evaluate("""nomadDbg.songMigrate([{ s: 0, r: 2 }, { s: 0, r: 1, take: { n: 1, len: 1000, ev: [{ t: 0, seq: 0, mask: [false] }, { t: 500, seq: 3, mask: [false] }] } }], { 0: 0, 3: 1 })""")
    assert steps[0]["take"]["label"] == "PARTIE A ×2" and steps[0]["take"]["len"] == 2 * app.evaluate("nomadDbg.LP.Lf")
    ev = steps[1]["take"]["ev"]
    assert [(e["t"], e["seq"]) for e in ev] == [(0, 0), (0, 1), (0, 2), (500, 0), (500, 1)] and ev[3]["mask"][0] is True


def test_renommer_piste_et_projet(app):
    fake_loop(app, 0.4)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0)")
    app.click("#tab-loops")
    app.wait_for_timeout(200)
    box = app.locator("#loopCanvas").bounding_box()
    app.mouse.click(box["x"] + box["width"] / 6, box["y"] + box["height"] / 4)   # centre du cercle 1 = son numéro
    app.wait_for_selector(".namedlg input")
    app.fill(".namedlg input", "basse dub")
    app.click(".namedlg button[type=submit]")
    assert app.evaluate("nomadDbg.LP.layers[0].name") == "BASSE DUB"
    assert app.evaluate("nomadDbg.LP.layers[0].muted") is False        # renommer ne coupe pas
    assert app.evaluate("document.querySelector('.fxt[data-t=\"1\"]').textContent").startswith("BASSE")
    # projet : enregistrer puis renommer depuis RÉGLAGES
    app.evaluate("document.getElementById('projName').value = 'essai'")
    app.click("#gearBtn"); app.click("#projSave")
    app.wait_for_selector("#projList .item-row")
    app.click("#projList .item-row >> text=NOM")
    app.fill(".namedlg input", "mon morceau")
    app.click(".namedlg button[type=submit]")
    app.wait_for_function("document.getElementById('projList').innerText.includes('MON MORCEAU')")
    # le nom de la piste revient avec le projet
    app.evaluate("nomadDbg.LP.layers[0].name = ''")
    app.click("#projList .kititem")
    app.wait_for_function("nomadDbg.LP.layers[0] && nomadDbg.LP.layers[0].name === 'BASSE DUB'")


def test_imprimer_fx_sur_une_ligne_de_song(app):
    fake_loop(app, 0.5)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0)")
    app.evaluate("nomadDbg.song.steps.push({ s: 0, r: 1, take: { n: 1, len: nomadDbg.LP.Lf, ev: [{ t: 0, seq: 0, mask: [false] }] } })")
    app.click("#tab-fx")
    app.click('.fxt[data-t="song"]')
    assert "LIGNE 1 DE SONG" in app.inner_text("#fxPrint")
    app.click("#fxPrint")                                    # lance la ligne 1 et enregistre
    assert app.evaluate("!!nomadDbg.song.print")
    app.wait_for_function("!nomadDbg.song.print", timeout=8000)
    pid = app.evaluate("nomadDbg.song.steps[0].take.pid")
    assert pid and app.evaluate(f"nomadDbg.song.prints.get('{pid}').length") == app.evaluate("nomadDbg.LP.Lf")
    # le son imprimé n'est pas vide
    assert app.evaluate(f"Math.max(...nomadDbg.song.prints.get('{pid}').getChannelData(0).slice(0, 20000).map(Math.abs))") > 0.01
    app.click("#tab-song")
    assert "IMPRIMÉE" in app.inner_text("#songList")
    # la ligne imprimée joue le son figé et ferme la porte des boucles
    app.evaluate("nomadDbg.songPlay(0)")
    app.wait_for_timeout(150)
    assert app.evaluate("!!nomadDbg.song.player") and app.evaluate("nomadDbg.song.gate.gain.value") < 0.1
    app.evaluate("nomadDbg.songStop()")
    # annuler : la ligne retrouve ses boucles
    app.click("#undoBtn")
    assert not app.evaluate("nomadDbg.song.steps[0].take.pid")


def test_imprimer_sp_par_dessus_une_ligne_imprimee(app):
    fake_loop(app, 0.5)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0)")
    app.evaluate("nomadDbg.song.steps.push({ s: 0, r: 1, take: { n: 1, len: nomadDbg.LP.Lf, ev: [{ t: 0, seq: 0, mask: [false] }] } })")
    app.evaluate("nomadDbg.setFxTarget('song'); nomadDbg.songPrint(0)")
    app.wait_for_function("!nomadDbg.song.print && nomadDbg.song.steps[0].take.pid", timeout=8000)
    first = app.evaluate("nomadDbg.song.steps[0].take.pid")
    app.click("#tab-sp")
    app.click('.spt[data-t="song"]')                         # SP reprend la cible SONG à FX
    assert app.evaluate("nomadDbg.SQ && document.querySelector('.fxt.on').dataset.t") == "all"
    app.click("#spPrint")
    assert app.evaluate("nomadDbg.song.print.srcs.length") == 1          # SP sur SONG : on enregistre la sortie de SP
    app.wait_for_function("!nomadDbg.song.print", timeout=8000)
    second = app.evaluate("nomadDbg.song.steps[0].take.pid")
    assert second and second != first
    # le son déjà imprimé est passé dans SP : la nouvelle impression n'est pas vide
    assert app.evaluate(f"Math.max(...nomadDbg.song.prints.get('{second}').getChannelData(0).slice(0, 20000).map(Math.abs))") > 0.01



def test_imprimer_une_ligne_en_changeant_de_boucle(app):
    fake_loop(app, 1.5)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0)")
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[1], 1, 0)")
    app.evaluate("nomadDbg.selectSeq(1)")
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[2], 1, 0)")
    app.evaluate("nomadDbg.selectSeq(0)")
    app.evaluate("nomadDbg.song.steps.push({ s: 0, r: 1, take: { n: 1, len: nomadDbg.LP.Lf, ev: [0, 1, 2].map(b => ({ t: 0, seq: b, mask: [false, false] })) } })")
    app.click("#tab-fx")
    app.evaluate("nomadDbg.songPrint(0)")
    assert app.evaluate("nomadDbg.song.print.srcs.length") == 1          # FX sur TOUT : les boucles passent dans FX
    app.click('.fxt[data-t="1"]')                                        # pendant l'impression : FX sur P1 (drums)
    assert app.evaluate("document.querySelector('.fxt.on').dataset.t") == "1"
    assert app.evaluate("nomadDbg.song.print.srcs.length") == 2          # boucles sans effet + sortie de FX
    app.click("#tab-sp"); app.click('.spt[data-t="2"]')                 # SP sur P2 en même temps
    assert app.evaluate("nomadDbg.song.print.srcs.length") == 3
    app.click('.tbanks button[data-bank="1"] >> visible=true')           # bank B : P1 = sa piste 1, sans arrêter
    assert app.evaluate("nomadDbg.SQ.cur") == 1 and app.evaluate("!!nomadDbg.song.print")
    assert "LIGNE 1" in app.inner_text("#spPrint")
    app.wait_for_function("!nomadDbg.song.print", timeout=8000)
    pid = app.evaluate("nomadDbg.song.steps[0].take.pid")
    assert pid and app.evaluate(f"Math.max(...nomadDbg.song.prints.get('{pid}').getChannelData(0).slice(0, 40000).map(Math.abs))") > 0.01
    # une piste dans FX ne passe pas à côté de la porte : la ligne imprimée joue seule
    app.evaluate("nomadDbg.setFxTarget('1'); nomadDbg.songPlay(0)")
    app.wait_for_timeout(150)
    assert app.evaluate("nomadDbg.song.gate.gain.value") < 0.1
    app.evaluate("nomadDbg.songStop()")


def test_preset_de_mix_allume(app):
    fake_loop(app, 0.4)
    app.evaluate("nomadDbg.addLayer(nomadDbg.buffers[0], 1, 0)")
    app.click("#mixBtn")
    lit = lambda: app.evaluate("[...document.querySelectorAll('[data-mixp].rec')].map(b => b.dataset.mixp)")
    assert lit() == []
    app.click('[data-mixp="wide"]')
    assert lit() == ["wide"]
    app.click('[data-mixp="auto"]')
    assert lit() == ["auto"]
    app.evaluate("nomadDbg.selectSeq(1)")              # autre bank : aucun preset appliqué
    assert lit() == []
    app.evaluate("nomadDbg.selectSeq(0)")
    assert lit() == ["auto"]


def test_scratch_menu_disque_entier_et_phrases_ici(app):
    app.click("#tab-scratch")
    app.wait_for_function("nomadDbg.SCR.N > 0", timeout=10000)
    n = app.evaluate("document.querySelectorAll('#scrSel option').length")
    assert n > 5
    app.select_option("#scrSel", "3")
    app.wait_for_function("nomadDbg.SCR.idx === 3 && nomadDbg.SCR.name.length > 0")
    # catégorie PAD : le menu se remplit avec les pads du kit
    app.click('#scrSrc [data-s="pad"]')
    app.wait_for_function("document.querySelector('#scrSel option').textContent.includes('PAD 1')")
    # une boucle de 30 s se pose en entier sur la platine
    app.evaluate("(() => { const b = new AudioBuffer({ length: 30 * nomadDbg.sr, sampleRate: nomadDbg.sr }); b.getChannelData(0).fill(0.2); nomadDbg.scrLoad(b, 'LONGUE'); })()")
    assert app.evaluate("nomadDbg.SCR.N") == 30 * app.evaluate("nomadDbg.sr")
    assert app.evaluate("nomadDbg.SCR.phMode") == "here"
    # ordinateur : « sur le disque » sous les onglets
    if app.evaluate("document.documentElement.classList.contains('desk')"):
        assert app.evaluate("document.getElementById('scrDisk').parentNode.id") == "deskSide"



def test_nouveau_kit_micro_et_bibliotheque(app):
    app.click("#newKitBtn")
    app.fill(".namedlg input", "mes prises")
    app.click(".namedlg button[type=submit]")
    app.wait_for_function("document.getElementById('kitName').textContent === 'MES PRISES'")
    assert app.evaluate("nomadDbg.buffers.every(b => !b)")
    assert not app.is_hidden("#micPad")
    # prise au micro (micro factice de Chrome) sur le pad 3
    app.locator("#pads .pad", has_text="PAD 3").first.click()
    app.click("#micRec")
    app.wait_for_function("nomadDbg.MIC.rec && nomadDbg.MIC.rec.n > nomadDbg.sr * 0.6", timeout=8000)
    app.click("#micRec")
    assert app.evaluate("!!nomadDbg.buffers[2]") and app.evaluate("nomadDbg.names[2]").startswith("MICRO")
    # bibliothèque : les sons de SCRATCH sont proposés
    app.click("#micLib")
    app.wait_for_function("document.getElementById('srcList').innerText.includes('SCRATCH · BANQUE')")
    app.click("#srcClose")
    # le kit perso garde le son tout seul
    app.wait_for_timeout(1200)
    app.evaluate("nomadDbg.loadKit('synth')")
    app.wait_for_function("document.getElementById('kitName').textContent !== 'MES PRISES'")
    kid = app.evaluate("nomadDbg.kitIndex.find(k => k.name === 'MES PRISES').id")
    app.evaluate(f"nomadDbg.loadKit('{kid}')")
    app.wait_for_function("nomadDbg.buffers[2] && nomadDbg.buffers[2].length > 0 && !nomadDbg.buffers[0]")
