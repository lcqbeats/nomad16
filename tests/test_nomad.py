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
    app.evaluate("nomadMidi([0x99, 48, 100]); nomadMidi([0x89, 48, 0])")   # pad 13 : CUE 1
    assert app.evaluate("nomadDbg.SCR.cues[0]") is not None
    app.evaluate("nomadMidi([0x99, 39, 100])")          # pad 4 : baby, tenu
    app.wait_for_timeout(500)
    assert app.evaluate("nomadDbg.SCR.ph") == 0
    app.evaluate("nomadMidi([0x89, 39, 0])")
    app.wait_for_timeout(100)
    assert app.evaluate("nomadDbg.SCR.ph") == -1


def test_aide_memoire(app):
    app.click("#gearBtn")
    assert app.query_selector_all("#glossary details").__len__() == 5
    app.click("#glossary details:nth-child(4) summary")
    assert "CUE 4" in app.inner_text("#glossary")


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
    app.evaluate("nomadMidi([0xC0, 6])")
    assert app.get_attribute("#tab-scratch", "aria-selected") == "true"
    app.evaluate("nomadMidi([0xC0, 0])")
    assert app.get_attribute("#tab-play", "aria-selected") == "true"
    app.evaluate("nomadMidi([0xC0, 8])")
    app.wait_for_timeout(500)
    assert app.evaluate("nomadState().kit") == "synth"
