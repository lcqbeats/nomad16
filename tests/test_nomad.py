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
        kw = {"args": ["--autoplay-policy=no-user-gesture-required"]}
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
    page.on("pageerror", lambda e: errors.append(str(e)))
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
    app.evaluate("nomadMidi([0x99, 40, 110])")          # pad 5 : avant
    app.wait_for_timeout(200)
    app.evaluate("nomadMidi([0x89, 40, 0])")
    app.wait_for_timeout(100)
    assert app.evaluate("nomadDbg.SCR.rep.pos") > p0
    app.evaluate("nomadMidi([0x99, 41, 100]); nomadMidi([0x89, 41, 0])")   # pad 6 : CUE 1
    assert app.evaluate("nomadDbg.SCR.cues[0]") is not None
    app.evaluate("nomadMidi([0x99, 44, 100])")          # pad 9 : baby, tenu
    app.wait_for_timeout(500)
    assert app.evaluate("nomadDbg.SCR.ph") == 0
    app.evaluate("nomadMidi([0x89, 44, 0])")
    app.wait_for_timeout(100)
    assert app.evaluate("nomadDbg.SCR.ph") == -1


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
    app.click("#tapLedBtn")
    assert "OUI" in app.inner_text("#tapLedBtn")
    app.evaluate("nomadMidi([0xB0, 64, 127])")   # Sustain : REC armé
    app.evaluate("nomadMidi([0x99, 36, 100])")
    app.wait_for_timeout(300)
    app.click("#tapLedBtn")


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
    app.evaluate("nomadMidi([0xC0, 9])")      # banque B pad 2 = premier kit
    app.wait_for_timeout(500)
    assert app.evaluate("nomadState().kit") == "synth"


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
    app.evaluate("nomadMidi([0x99, 40, 100])")   # pad 5 → piste 4
    assert app.evaluate("nomadDbg.LP.layers[3].muted") is True
    app.evaluate("nomadMidi([0x99, 40, 100])")
    assert app.evaluate("nomadDbg.LP.layers[3].muted") is False


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
    app.evaluate("nomadMidi([0x99, 45, 100])")       # pad 10 : solo piste 2
    assert mutes() == [True, False, True]
    app.evaluate("nomadMidi([0x99, 45, 100])")       # fin du solo
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
    app.evaluate("nomadMidi([0x99, 39, 100])")          # pad 4 : start
    app.wait_for_timeout(400)
    assert app.evaluate("nomadDbg.SCR.motor") is True
    app.evaluate("nomadMidi([0x99, 36, 100])")          # pad 1 : arrière
    app.wait_for_timeout(200)
    app.evaluate("nomadMidi([0x89, 36, 0])")
    app.wait_for_timeout(120)
    assert app.evaluate("nomadDbg.SCR.rep.vel") > 0.5    # déjà reparti en avant
    app.evaluate("nomadMidi([0x99, 41, 100]); nomadMidi([0x89, 41, 0])")   # CUE 1
    app.evaluate("nomadMidi([0x99, 42, 100]); nomadMidi([0x89, 42, 0])")   # CUE 2
    app.evaluate("nomadMidi([0x99, 47, 100])")          # pad 12 : repère précédent
    assert app.evaluate("nomadDbg.SCR.cueIdx") == 0
    app.evaluate("nomadMidi([0x99, 51, 100])")          # pad 16 : repère suivant
    assert app.evaluate("nomadDbg.SCR.cueIdx") == 1


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
    app.evaluate("nomadMidi([0x90, 72, 100]); nomadMidi([0x80, 72, 0])")     # DO aigu = TOUT
    assert "on" in app.get_attribute(".fxt[data-t='all']", "class")
    app.evaluate("nomadMidi([0xC0, 2])")            # PROG CHANGE pad 3 = SONS
    assert app.get_attribute("#tab-sons", "aria-selected") == "true"
    app.evaluate("nomadMidi([0xC0, 8])")            # banque B pad 1 = SONG
    assert app.get_attribute("#tab-song", "aria-selected") == "true"
    assert app.get_attribute("#tab-sons", "data-pc") == "3"


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
    page.on("pageerror", lambda e: errors.append(str(e)))
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
