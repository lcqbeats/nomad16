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
    assert labels[0] == "Longueur" and labels[2] == "Dose effet"
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
    # le bac en ligne peut écrire sur l'écran en arrière-plan : on attend le message du nettoyage
    app.click("#clClick"); app.wait_for_function("document.getElementById('digLoad').hidden && /craquements enlevés/.test(document.getElementById('lcdPad').textContent)", timeout=8000)
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
    app.evaluate("nomadMidi([0x90, 49, 100]); nomadMidi([0x80, 49, 0])")     # DO# : page 17 à 32 (rythmiques 1)
    assert "RYTHMIQUES 1" in app.inner_text("#fxSet")
    assert app.locator("#fxgrid svg").count() == 16
    for i in range(16):
        app.evaluate(f"nomadMidi([0x99, {36 + i}, 100])")
        worst = [0, 0]
        for _ in range(4):
            app.wait_for_timeout(70); m, bad = app.evaluate("_pk3()"); worst = [max(worst[0], m), worst[1] + bad]
        app.evaluate(f"nomadMidi([0x89, {36 + i}, 0])")
        assert worst[1] == 0 and worst[0] < 1.5, (i + 17, worst)
    # pages 3 (variations de batterie), 4 (mélodique) et 5 (glitch-hop) : mêmes garanties
    for page in (2, 3, 4):
        app.click("#fxSet")
        for i in range(16):
            app.evaluate(f"nomadMidi([0x99, {36 + i}, 100])")
            worst = [0, 0]
            for _ in range(4):
                app.wait_for_timeout(70); m, bad = app.evaluate("_pk3()"); worst = [max(worst[0], m), worst[1] + bad]
            app.evaluate(f"nomadMidi([0x89, {36 + i}, 0])")
            assert worst[1] == 0 and worst[0] < 1.5, (page * 16 + i + 1, worst)
    app.click("#fxSet")
    assert "GLITCH-HOP" in app.inner_text("#fxSet")


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
    # un toucher : muet tout de suite, sans fenêtre de nom
    app.mouse.click(box["x"] + box["width"] / 6, box["y"] + box["height"] / 4)
    app.wait_for_timeout(450)
    assert app.evaluate("nomadDbg.LP.layers[0].muted") is True and app.locator(".namedlg").count() == 0
    app.mouse.click(box["x"] + box["width"] / 6, box["y"] + box["height"] / 4)   # rejoue
    app.wait_for_timeout(450)
    # deux touchers rapprochés : renommer
    app.mouse.click(box["x"] + box["width"] / 6, box["y"] + box["height"] / 4)
    app.wait_for_timeout(120)
    app.mouse.click(box["x"] + box["width"] / 6, box["y"] + box["height"] / 4)
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


def test_sons_batterie_patterns(app):
    app.click("#tab-sons")
    app.wait_for_timeout(300)
    app.click('#cats .cat:text-is("BATTERIE")')
    app.click('#insts .inst:has-text("BOOM BAP")')
    assert not app.is_hidden("#drumPanel") and app.is_hidden("#chordPanel")
    assert app.evaluate("document.querySelectorAll('#drPats .drpat').length") == 8
    app.evaluate("nomadMidi([0x99, 36, 100])")            # pad 1 : pattern 1
    app.wait_for_timeout(600)
    assert app.evaluate("nomadDbg.DR.cur") == 0 and app.evaluate("nomadDbg.DR.step") > 2
    app.evaluate("nomadMidi([0x99, 37, 100])")            # pad 2 : pattern suivant, en fin de mesure
    assert app.evaluate("nomadDbg.DR.next") == 1
    app.wait_for_function("nomadDbg.DR.cur === 1", timeout=5000)
    app.click("#drStop")
    assert app.evaluate("nomadDbg.DR.cur") == -1
    # sons de NOMAD si on ne veut pas ceux du kit
    app.click("#drKit")
    assert "NOMAD" in app.inner_text("#drKit")
    app.click('#insts .inst:has-text("DUB")')
    app.evaluate("nomadDbg.drPlay(2)")
    app.wait_for_timeout(400)
    assert app.evaluate("nomadDbg.DR.genre.id") == "dub"
    app.evaluate("nomadDbg.drStop()")
    assert app.evaluate("nomadDbg.DR.cur") == -1


def test_collections_sober_et_all_things(app):
    app.click("#tab-sons")
    app.wait_for_timeout(300)
    for cat, n in [("SOBER", 11), ("ALL THINGS", 11)]:
        app.click(f'#cats .cat:text-is("{cat}")')
        assert app.evaluate("document.querySelectorAll('#insts .inst').length") == n   # 10 sons + la batterie
    app.click('#insts .inst:has-text("BATTERIE ALL THINGS")')
    assert app.evaluate("document.querySelectorAll('#drPats .drpat').length") == 4
    app.evaluate("nomadDbg.drPlay(0)")
    app.wait_for_timeout(500)
    assert app.evaluate("nomadDbg.DR.genre.id") == "allthings" and app.evaluate("nomadDbg.DR.step") > 1
    app.evaluate("nomadDbg.drStop()")
    app.click('#insts .inst:has-text("CONTREBASSE")')
    app.evaluate("nomadProbe()")
    app.evaluate("nomadMidi([0x90, 62, 100])")
    app.wait_for_function("nomadProbe() > 0.02", timeout=3000)
    app.evaluate("nomadMidi([0x80, 62, 0])")


def test_ambiance_de_collection(app):
    app.click("#tab-sons")
    app.wait_for_timeout(300)
    app.click('#cats .cat:text-is("ALL THINGS")')
    app.click('#insts .inst:has-text("CORDES CINÉ")')
    app.wait_for_function("nomadDbg.AMB.cur === 'ALL THINGS'")
    assert "GRANDE SALLE" in app.inner_text("#ambBtn")
    assert app.evaluate("nomadDbg.AMB.n.send.gain.value") > 0.1 or app.wait_for_function("nomadDbg.AMB.n.send.gain.value > 0.1")
    app.click("#ambBtn")                                  # libre
    assert app.evaluate("nomadDbg.AMB.cur") is None and "LIBRE" in app.inner_text("#ambBtn")
    app.click("#ambBtn")
    app.click('#cats .cat:text-is("FKJ")')
    app.click('#insts .inst >> nth=0')
    assert app.is_hidden("#ambBtn") and app.evaluate("nomadDbg.AMB.cur") is None


def test_fx_quatre_pages_et_motifs_valides(app):
    assert app.evaluate("nomadDbg.FXS.length") == 80
    # aucun motif ne lit l'avenir ni trop loin dans le passé (tampon de 12 s ≈ 64 double-croches à 80 BPM)
    bad = app.evaluate("""nomadDbg.FXS.flatMap((f, n) => (f.steps || []).map((st, j) => {
        if (st.s < 0) return null;
        const r = Math.max(st.r0 ?? 1, st.r1 ?? st.r0 ?? 1), d = st.d || 1;
        const late = st.s + r / d - (j + 16 + 1 / d), back = j + 16 - st.s;
        return late > 1e-6 || back > 60 ? `${n + 1} ${f.name} pas ${j}` : null; })).filter(Boolean)""")
    assert bad == [], bad
    app.click("#tab-fx")
    app.evaluate("nomadMidi([0x99, 36, 1]); nomadMidi([0x89, 36, 0])")
    for k in range(5):
        app.evaluate("nomadMidi([0x90, 49, 100]); nomadMidi([0x80, 49, 0])")     # do# : page suivante
    # la page glitch-hop vient en premier, puis les motifs rythmiques, puis le reste
    assert "GLITCH-HOP" in app.inner_text("#fxSet") and "RATCHET" in app.inner_text("#fxgrid") and "MACHINE QUI DÉRAILLE" in app.inner_text("#fxgrid")
    app.evaluate("nomadMidi([0x90, 49, 100]); nomadMidi([0x80, 49, 0])")
    assert "RYTHMIQUES 1" in app.inner_text("#fxSet") and "BUILD-UP" in app.inner_text("#fxgrid")
    app.evaluate("nomadMidi([0x90, 49, 100]); nomadMidi([0x80, 49, 0])"); app.evaluate("nomadMidi([0x90, 49, 100]); nomadMidi([0x80, 49, 0])")
    assert "VARIATIONS DRUMS" in app.inner_text("#fxSet") and "GHOST NOTES" in app.inner_text("#fxgrid")
    app.evaluate("nomadDbg.setFxBank(4)")
    assert "ÉCHO PING-PONG" in app.inner_text("#fxgrid")


def test_sp_bank_b_et_dosage_par_effet(app):
    app.click("#tab-sp")
    app.wait_for_timeout(300)
    assert app.evaluate("nomadDbg.SP_FX.length") == 32
    app.evaluate("nomadMidi([0x99, 36, 1]); nomadMidi([0x89, 36, 0])")
    app.evaluate("nomadMidi([0x90, 49, 100]); nomadMidi([0x80, 49, 0])")          # do# : bank B
    assert app.evaluate("nomadDbg.SPX.bank") == 1 and "CHALEUR" in app.inner_text("#spFxGrid")
    app.evaluate("nomadDbg.spPad(0, true); nomadDbg.spPad(0, false)")            # pad 1 en bank B = effet 17
    assert app.evaluate("nomadDbg.SP_FX[16].on") is True and app.evaluate("nomadDbg.SPX.cur") == 16
    # potard 3 : dosage de CET effet seulement
    app.evaluate("for (let v = 127; v >= 40; v -= 8) nomadMidi([0xB0, 72, v])")
    assert 0.3 < app.evaluate("nomadDbg.SP_FX[16].m") < 0.4 and app.evaluate("nomadDbg.SP_FX[0].m") == 1
    app.evaluate("nomadDbg.spPad(0, true); nomadDbg.spPad(0, false)")
    # chaque effet de la bank B, seul, laisse passer un son propre (ni silence ni NaN)
    app.evaluate("nomadProbeOut()")
    out = app.evaluate("""(async () => { const r = []; await nomadDbg.sonsT.selectInst('fkjrhodes');
        for (let i = 16; i < 32; i++) { nomadDbg.SP_FX.forEach(f => f.on = false); nomadDbg.spPad(i - 16, true); nomadDbg.spPad(i - 16, false);
          nomadDbg.sonsT.keyOn(48 + (i % 12), 0.8);
          let m = 0; for (let k = 0; k < 8; k++) { await new Promise(z => setTimeout(z, 50)); m = Math.max(m, nomadProbeOut()); }
          nomadDbg.sonsT.releaseKey();
          r.push([nomadDbg.SP_FX[i].id, m]); nomadDbg.spPad(i - 16, true); nomadDbg.spPad(i - 16, false); }
        return r; })()""")
    bad = [x for x in out if not (x[1] > 0.005 and x[1] < 4)]
    assert bad == [], out
    # au repos, la sortie est silencieuse (aucun oscillateur d'effet ne fuit)
    app.evaluate("nomadDbg.SP_FX.forEach((f, i) => { if (f.on) { nomadDbg.SPX.bank = Math.floor(i / 16); nomadDbg.spPad(i % 16, true); nomadDbg.spPad(i % 16, false); } })")
    app.wait_for_timeout(2500)
    assert app.evaluate("nomadProbeOut()") < 0.02


def test_batterie_tempo_swing_et_pads(app):
    app.click("#tab-sons")
    app.wait_for_timeout(300)
    app.click('#cats .cat:text-is("BATTERIE")')
    app.click('#insts .inst:has-text("BOOM BAP")')
    app.click("#drBpmSet")
    assert "90 BPM" in app.inner_text("#drBpm")
    app.click("#drBpmUp"); app.click("#drBpmUp")
    assert "92 BPM" in app.inner_text("#drBpm")
    app.fill("#drSwing", "45")
    app.dispatch_event("#drSwing", "input")
    assert app.evaluate("nomadDbg.drSwPct(nomadDbg.DR_GENRES[0])") == 45
    # grosse caisse sur le pad 9 au lieu de celle trouvée automatiquement
    sel = app.locator("#drRoles select").first
    sel.select_option("8")
    assert app.evaluate("nomadDbg.drMap().k") == 8
    sel.select_option("-1")
    assert "k" not in app.evaluate("nomadDbg.drMap()")
    sel.select_option("auto")
    app.click("#drSwingReset")
    assert app.evaluate("nomadDbg.drSwPct(nomadDbg.DR_GENRES[0])") == 20


def test_batterie_rec_boucle_et_anneau(app):
    app.click("#tab-sons")
    app.wait_for_timeout(300)
    app.click('#cats .cat:text-is("BATTERIE")')
    app.click('#insts .inst:has-text("BREAKBEAT")')
    app.click("#drBpmSet")                                 # 96 BPM
    app.click("#drRec")                                    # lance le pattern 1 et la prise
    assert app.evaluate("nomadDbg.DR.cur") == 0
    app.wait_for_timeout(2900)                             # une mesure à 96 BPM = 2,5 s : on est dans la 2e
    app.evaluate("nomadDbg.drPlay(7)")                     # le break à la fin
    app.click("#drRec")                                    # fin à la fin de la 2e mesure
    app.wait_for_function("nomadDbg.LP.t0F !== null && nomadDbg.LP.layers.length === 1", timeout=8000)
    assert app.evaluate("nomadDbg.LP.beats") == 8
    assert abs(app.evaluate("60 * nomadDbg.LP.beats / (nomadDbg.LP.Lf / nomadDbg.sr)") - 96) < 0.2
    # l'anneau du pattern qui joue tourne
    p1 = app.evaluate("+document.querySelector('#drPats .drpat.on .drring').style.getPropertyValue('--p')")
    app.wait_for_timeout(500)
    p2 = app.evaluate("+document.querySelector('#drPats .drpat.on .drring').style.getPropertyValue('--p')")
    assert p1 != p2
    # avec une boucle : une nouvelle piste, ici d'un tour
    app.click("#drRec")
    app.wait_for_function("nomadDbg.DR.rec && nomadDbg.ctx.currentTime * nomadDbg.sr > nomadDbg.DR.rec.sF + 0.3 * nomadDbg.sr", timeout=8000)
    app.click("#drRec")
    app.wait_for_function("nomadDbg.LP.layers.length === 2", timeout=12000)
    assert app.evaluate("nomadDbg.LP.layers[1].k") == 1
    app.evaluate("nomadDbg.drStop()")


def test_guitare_session_native_et_compresseur_sans_retard(app):
    assert app.evaluate("window.nomadDbg && typeof nomadDbg.ctx === 'object'")
    # l'app iPhone reçoit « record » puis renvoie l'entrée et la latence, affichées dans GUITARE
    app.evaluate("""window.__msgs = []; window.webkit = { messageHandlers: { nomadAudio: { postMessage: m => { __msgs.push(m.type);
        setTimeout(() => window.__nomadAudio({ input: 'iRig HD X · USBAudio', output: 'Haut-parleur · Speaker', inLat: 2.1, outLat: 6.3, buf: 2.9, sr: 48000, inputs: [] }), 0); } } } };""")
    app.click("#tab-guitar")
    app.click("#inBtn")
    app.wait_for_function("__msgs.includes('route')", timeout=8000)
    assert app.evaluate("__msgs[0]") == "record"
    app.wait_for_function("document.getElementById('latInfo').textContent.includes('iRig HD X')")
    assert "latence ≈ 14 ms" in app.evaluate("document.getElementById('latInfo').textContent")
    app.click("#inBtn")
    assert app.evaluate("__msgs[__msgs.length - 1]") == "playback"


def test_garde_oreilles_plafond_et_larsen(app):
    app.click("#tab-guitar")
    app.wait_for_function("nomadDbg.gn && nomadDbg.gn.guard")
    # 1) un son très fort ne dépasse jamais le plafond ; une note de guitare qui retombe passe sans coupure
    r = app.evaluate("""(async () => {
      const ctx = nomadDbg.ctx, g = nomadDbg.gn.guard, an = ctx.createAnalyser(); an.fftSize = 2048; g.connect(an);
      const peak = async ms => { let m = 0; const d = new Float32Array(2048); const t0 = performance.now();
        while (performance.now() - t0 < ms) { an.getFloatTimeDomainData(d); for (const v of d) m = Math.max(m, Math.abs(v)); await new Promise(r => setTimeout(r, 20)); } return m; };
      const note = ctx.createOscillator(), ng = ctx.createGain(); note.type = 'sawtooth'; note.frequency.value = 196; note.connect(ng); ng.connect(g);
      const t = ctx.currentTime; ng.gain.setValueAtTime(3, t); ng.gain.setTargetAtTime(0.0, t + 0.01, 0.25); note.start();
      const pNote = await peak(600); note.stop(); note.disconnect();
      const cutAfterNote = nomadDbg.G.larsen || 0;
      // 2) larsen : son pur qui monte tout seul -> coupé
      const fb = ctx.createOscillator(), fg = ctx.createGain(); fb.frequency.value = 2400; fb.connect(fg); fg.connect(g);
      const t2 = ctx.currentTime; fg.gain.setValueAtTime(0.05, t2); fg.gain.exponentialRampToValueAtTime(2, t2 + 1.2); fb.start();
      await new Promise(r => setTimeout(r, 1500)); const pAfter = await peak(200); fb.stop();
      return { pNote, cutAfterNote, cuts: nomadDbg.G.larsen || 0, pAfter }; })()""")
    assert r["pNote"] <= 0.36, r
    assert r["cutAfterNote"] == 0, r
    assert r["cuts"] >= 1 and r["pAfter"] < 0.02, r


def test_anti_larsen_ecouteurs_annule_la_fuite(app):
    # simulation de l'iRig : 20 % du son de sortie revient dans l'entrée guitare 150 ms plus tard (micro de la page iPhone) ; avec COMP + FUZZ ça s'emballe
    app.click("#tab-guitar")
    app.wait_for_function("nomadDbg.gn && nomadDbg.gn.aec")
    app.click("#pd-comp"); app.click("#pd-fuzz")
    r = app.evaluate("""(async () => {
      const ctx = nomadDbg.ctx, gn = nomadDbg.gn, wait = ms => new Promise(r => setTimeout(r, ms));
      const leak = ctx.createDelay(0.5); leak.delayTime.value = 0.15; const lg = ctx.createGain(); lg.gain.value = 0.2;
      nomadDbg.gn.aecRef.context; // même contexte
      const out = gn.aecRef; // la sortie générale passe déjà par ici ; on prend la même source pour la fuite
      const mix = ctx.createGain(); out.connect(mix); mix.connect(leak); leak.connect(lg); lg.connect(gn.aec, 0, 0);
      const an = ctx.createAnalyser(); an.fftSize = 2048; gn.input.connect(an); const buf = new Float32Array(2048);
      const lvl = () => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); };
      const pluck = () => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 110; o.connect(g); g.connect(gn.aec, 0, 0);
        const t = ctx.currentTime; g.gain.setValueAtTime(0.25, t); g.gain.setTargetAtTime(0, t + 0.02, 0.12); o.start(t); o.stop(t + 1.2); };
      nomadDbg.gtrOn(); await wait(300);
      const before = nomadDbg.G.larsen || 0; pluck(); await wait(2500);
      const sansAec = { cut: (nomadDbg.G.larsen || 0) - before, lvl: lvl() };
      nomadDbg.gn.guard.port.postMessage({ type: 'reset' }); nomadDbg.gtrOn();
      const ok = await nomadDbg.aecCalibrate(); nomadDbg.gtrOn(); await wait(300);
      const b2 = nomadDbg.G.larsen || 0; pluck(); await wait(60); const joue = lvl(); await wait(2440);
      return { sansAec, ok, avecAec: { cut: (nomadDbg.G.larsen || 0) - b2, lvl: lvl(), joue }, lcd: document.getElementById('lcdPad') ? document.getElementById('lcdPad').innerText : '' }; })()""")
    print(r)
    assert r["sansAec"]["cut"] >= 1 or r["sansAec"]["lvl"] > 0.05, r
    assert r["ok"], r
    assert r["avecAec"]["cut"] == 0 and r["avecAec"]["lvl"] < 0.01, r
    assert r["avecAec"]["joue"] > 0.05, r  # la guitare elle-même n'est pas retirée


def test_accordeur_suit_la_note_qui_sonne(app):
    app.click("#tab-guitar")
    app.click("#tunBtn")
    app.wait_for_function("nomadDbg.G.on")
    r = app.evaluate("""(async () => {
      const ctx = nomadDbg.ctx, gn = nomadDbg.gn, wait = ms => new Promise(r => setTimeout(r, ms));
      gn.input.gain.cancelScheduledValues(0); gn.input.gain.value = 0; await wait(200);
      // corde de LA un peu basse (108 Hz), pincée une seule fois, qui retombe de 40 dB en 3 s
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 108; o.connect(g); g.connect(gn.analyser);
      const t = ctx.currentTime; g.gain.setValueAtTime(0.3, t); g.gain.setTargetAtTime(0.003, t, 0.65); o.start(t);
      const seen = [];
      for (let i = 0; i < 6; i++) { await wait(500); seen.push([document.getElementById('tunNote').textContent, document.getElementById('tunDir').textContent]); }
      o.frequency.setValueAtTime(110.1, ctx.currentTime); g.gain.setValueAtTime(0.2, ctx.currentTime); await wait(900);
      const juste = document.getElementById('tunDir').textContent; o.stop();
      return { seen, juste }; })()""")
    print(r)
    assert all(s[0].startswith("LA") and "TROP BAS" in s[1] for s in r["seen"]), r
    assert "JUSTE" in r["juste"], r


def test_digging_solos_du_monde_et_freesound(app):
    app.click("#tab-sample")
    app.wait_for_function("document.querySelectorAll('#crates .crate').length > 10")
    names = app.evaluate("[...document.querySelectorAll('#crates .crate')].map(b => b.textContent)")
    for n in ["SOLOS AFRIQUE", "SOLOS ORIENT", "SOLOS INDE", "SOLOS ASIE", "FREESOUND ⌕"]:
        assert n in names, names
    app.locator("#crates .crate", has_text="SOLOS INDE").click()
    app.wait_for_function("/SOLOS INDE · 1\\//.test(document.getElementById('digCount').textContent)")
    assert "CC0" in app.inner_text("#digCount")
    assert app.inner_text("#digLink") == "fiche sur Freesound"
    assert app.get_attribute("#digLink", "href").startswith("https://freesound.org/s/")
    # sans clé : message clair, pas de recherche
    app.locator("#crates .crate", has_text="FREESOUND").click()
    app.wait_for_function("/clé Freesound/.test(document.getElementById('digTitle').textContent)")
    # avec clé : la recherche demande un mot, puis interroge l'API (réponse simulée ici)
    app.evaluate("""() => { localStorage.setItem('nomad16.fsKey', JSON.stringify('k')); const f = window.fetch; window.fetch = (u, o) => String(u).includes('apiv2/search') ?
      Promise.resolve(new Response(JSON.stringify({ count: 1, results: [{ id: 42, name: 'oud_taqsim.wav', username: 'x', duration: 9, url: 'https://freesound.org/s/42/', previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/previews/0/42_1-hq.mp3' } }] }))) : f(u, o); }""")
    app.locator("#crates .crate", has_text="FREESOUND").click()
    app.fill(".namedlg input", "oud")
    app.click(".namedlg button[type=submit]")
    app.wait_for_function("document.getElementById('digTitle').textContent === 'oud taqsim'")
    assert "CC0" in app.inner_text("#digCount") and app.inner_text("#digLink") == "fiche sur Freesound"


def test_reglages_des_pads_gardes_par_kit_et_chops(app):
    # kit de chops depuis DIGGING : on règle un pad, on change de kit, on revient : le réglage est toujours là
    app.click("#tab-sample")
    app.evaluate("""() => { const c = nomadDbg.sp.in.context, sr = c.sampleRate, n = sr * 3, b = c.createBuffer(2, n, sr);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = Math.sin(i / 20) * (i % (sr / 2) < 2000 ? 0.8 : 0.1); }
      nomadDbg.setClip(b, "essai chops"); }""")
    app.click("#toPads")
    app.wait_for_function("document.getElementById('kitName').textContent.startsWith('CHOPS')", timeout=8000)
    chop = app.inner_text("#kitName")
    app.evaluate("nomadDbg.padParams[0].level = 0.37; nomadDbg.padParams[0].pan = -0.5")
    app.evaluate("nomadDbg.loadKit('synth')")
    app.wait_for_function("document.getElementById('kitName').textContent !== %r" % chop)
    app.evaluate("nomadDbg.padParams[2].level = 0.5")
    app.wait_for_timeout(300)
    app.evaluate("""() => { const k = nomadDbg.kitIndex.find(k => k.name === %r); nomadDbg.loadKit(k.id); }""" % chop)
    app.wait_for_function("document.getElementById('kitName').textContent === %r" % chop)
    assert abs(app.evaluate("nomadDbg.padParams[0].level") - 0.37) < 1e-6
    assert app.evaluate("nomadDbg.padParams[0].pan") == -0.5
    # et le kit fourni aussi
    app.evaluate("nomadDbg.loadKit('synth')")
    app.wait_for_function("nomadDbg.padParams[2].level === 0.5", timeout=5000)


def test_digging_bibliotheque_du_congres_en_kits_de_16(app):
    app.click("#tab-sample")
    app.wait_for_function("document.querySelectorAll('#crates .crate').length > 10")
    names = app.evaluate("[...document.querySelectorAll('#crates .crate')].map(b => b.textContent)")
    assert "VOIX SCRATCH" not in names
    app.locator("#crates .crate", has_text="JAZZ").last.click()
    app.wait_for_function("/^JAZZ · 1\\/22/.test(document.getElementById('digCount').textContent)")
    assert app.inner_text("#digTitle").startswith("KIT 1 ·")
    # extraits simulés (le serveur de la Bibliothèque n'est pas joignable ici) : 16 sons courts
    app.evaluate("""() => { const wav = n => { const b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 22050, true); v.setUint32(28, 44100, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 5) * 12000 * Math.exp(-i / 4000), true); return b; };
      const f = window.fetch; window.fetch = (u, o) => /\.wav$/.test(String(u)) ? Promise.resolve(new Response(wav(22050))) : f(u, o); }""")
    app.click("#digPull")
    app.wait_for_function("nomadDbg.clip && nomadDbg.chops.length === 16", timeout=10000)
    app.click("#toPads")
    app.wait_for_function("document.getElementById('kitName').textContent.startsWith('CHOPS')", timeout=8000)
    assert app.evaluate("nomadDbg.buffers.filter(Boolean).length") == 16

def test_sons_univers_accords_simples_et_nouveaux_effets(app):
    app.click("#tab-sons")
    app.wait_for_function("document.querySelectorAll('#sonsFx .fxpre').length >= 22", timeout=5000)
    app.click("#mChords")
    styles = app.evaluate("[...document.querySelectorAll('#styles .stylebtn')].map(b => b.textContent)")
    for s in ["BASIQUES MAJEUR", "BASIQUES MINEUR", "AFROBEAT", "ANDALOU", "ORIENT HIJAZ", "BOSSA NOVA", "ROOTS REGGAE", "AMBIENT"]:
        assert s in styles, styles
    app.locator("#styles .stylebtn", has_text="BOSSA NOVA").click()
    assert "maj7" in app.inner_text("#chords")
    app.click("#mSimple")
    txt = app.inner_text("#chords")
    assert "maj7" not in txt and "13" not in txt
    app.evaluate("nomadMidi([0x99, 36, 100])")       # pad 1 : premier accord, triade
    assert len(app.inner_text("#lcdPad").split("·")[1].split()) == 3
    app.evaluate("nomadMidi([0x89, 36, 0])")
    app.click("#mSimple")
    # niveau des nouveaux effets : pas de saut de volume par rapport à AUCUN (−8 à +4 dB)
    app.click("#mNotes")
    def lvl(name):
        app.locator("#sonsFx .fxpre", has_text=name).first.click()
        app.wait_for_timeout(150)
        app.evaluate("nomadMidi([0x90, 60, 100]); nomadMidi([0x90, 64, 100]); nomadMidi([0x90, 67, 100])")
        v = max(loud(app, 60) for _ in range(8))
        app.evaluate("nomadMidi([0x80, 60, 0]); nomadMidi([0x80, 64, 0]); nomadMidi([0x80, 67, 0])")
        app.wait_for_timeout(700)
        return v
    import math
    ref = lvl("AUCUN")
    assert ref > 0.003
    for n in ["LESLIE", "ÉCHO À BANDE", "SP-1200", "RESSORT", "PHASER", "PETITE SALLE", "AUTO-WAH", "CHORUS 80s"]:
        db = 20 * math.log10(lvl(n) / ref)
        assert -8 < db < 4, (n, db)


def test_scratch_onde_facon_serato(app):
    app.click("#tab-scratch")
    app.locator("#scrCanvas").click()
    app.wait_for_function("nomadDbg.ctx && document.getElementById('scrWave').width > 0", timeout=5000)
    app.evaluate("""() => { const c = nomadDbg.ctx, sr = c.sampleRate, n = sr * 8, b = c.createBuffer(2, n, sr);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) { const bt = (i / sr) % 0.5; d[i] = Math.sin(2 * Math.PI * 55 * bt) * Math.exp(-bt * 12) * 0.7; } }
      nomadDbg.scrLoad(b, "TEST ONDE"); }""")
    app.wait_for_timeout(300)
    # l'onde est dessinée (des pixels colorés au centre)
    lit = app.evaluate("""(() => { const c = document.getElementById('scrWave'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 200) n++; return n; })()""")
    assert lit > 200, lit
    # vue d'ensemble : toucher à 3/4 envoie le disque aux 3/4
    box = app.locator("#scrOver").bounding_box()
    app.mouse.click(box["x"] + box["width"] * 0.75, box["y"] + box["height"] / 2)
    app.wait_for_timeout(150)
    N = app.evaluate("nomadDbg.SCRN")
    p = app.evaluate("nomadDbg.scrPos()")
    assert abs((p % N) / N - 0.75) < 0.05, (p, N)
    # glisser l'onde vers la droite fait reculer le disque
    box = app.locator("#scrWave").bounding_box()
    p0 = app.evaluate("nomadDbg.scrPos()")
    app.mouse.move(box["x"] + box["width"] * 0.6, box["y"] + 30); app.mouse.down()
    app.mouse.move(box["x"] + box["width"] * 0.8, box["y"] + 30, steps=6)
    p1 = app.evaluate("nomadDbg.scrPos()")
    app.mouse.up()
    assert p1 < p0, (p0, p1)


def test_barre_transport_au_dessus_des_pads_et_accords(app):
    bar = app.locator("#view-play .minitr")
    assert bar.locator("button").count() == 5
    assert app.inner_text("#view-play .minitr .mkit") == app.inner_text("#kitName")
    k0 = app.inner_text("#kitName")
    bar.locator(".mkn").click()
    app.wait_for_function("document.getElementById('kitName').textContent !== %r && !document.getElementById('kitName').textContent.endsWith('…')" % k0, timeout=8000)
    bar.locator(".mrec").dispatch_event("pointerdown")
    assert app.evaluate("!!nomadDbg.LP.pending")
    app.wait_for_function("document.querySelector('#view-play .minitr .mrec').classList.contains('armed')")
    bar.locator(".mundo").click()
    assert app.evaluate("!nomadDbg.LP.pending")
    app.click("#tab-sons"); app.click("#mChords")
    assert app.locator("#view-sons .minitr").is_visible()


def test_importer_un_pack_zip_en_kits(app):
    import os
    app.click("#kitBtn") if app.locator("#kitBtn").count() else None
    app.evaluate("document.getElementById('kitSheet').hidden = false")
    app.set_input_files("#packFile", os.path.join(os.path.dirname(__file__), "pack-essai.zip"))
    app.wait_for_selector(".namedlg input")
    assert "25 sons → 3 kits" in app.inner_text(".namedlg")
    app.click(".namedlg button[type=submit]")
    app.wait_for_function("/kits créés/.test(document.getElementById('lcdPad').textContent)", timeout=20000)
    names = app.evaluate("nomadDbg.kitIndex.filter(k => k.user).map(k => k.name)")
    assert any("DRUM LOOPS · 174BPM" in n for n in names), names
    assert any("ONE SHOTS · KICKS 2" in n for n in names), names
    assert app.evaluate("nomadDbg.buffers.filter(Boolean).length") in (5, 16, 4)
    assert "DNB KICK" in app.inner_text("#pads") or "LOOP" in app.inner_text("#pads")
