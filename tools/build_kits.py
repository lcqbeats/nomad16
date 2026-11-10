"""Construit les kits NOMAD-16 à partir de Virtuosity Drums (CC0) et de sons synthétisés.
Sortie : WAV mono 16 bits 44,1 kHz dans <repo>/kits/<id>/, plus kit.json et index.json."""
import json, os, sys, shutil
import numpy as np
import soundfile as sf
from scipy import signal

SR = 44100
SRC = "/tmp/src/sfzinstruments_virtuosity_drums/"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/repo-nomad16/kits"
PICK = json.load(open("/tmp/src/pick.json"))
rng = np.random.default_rng(7)

# ---------- utilitaires ----------
def load(path):
    x, sr = sf.read(SRC + path, always_2d=True)
    x = x.mean(axis=1)
    if sr != SR:
        g = np.gcd(sr, SR)
        x = signal.resample_poly(x, SR // g, sr // g)
    return x.astype(np.float64)

def mic(m, art):
    return load(PICK["pick"][f"{m}/{art}"])

def perc(inst, contains=None):
    fs = PICK["perc"][inst]
    if contains:
        fs = [f for f in fs if contains in f] or fs
    return load(fs[-1])

def mix(*parts):
    n = max(len(p[0]) for p in parts)
    y = np.zeros(n)
    for x, g in parts:
        y[:len(x)] += x * g
    return y

def trim(x, thr=0.004, maxlen=None, fade=0.03):
    a = np.abs(x)
    pk = a.max() or 1
    idx = np.argmax(a > 0.03 * pk)
    x = x[max(0, idx - 24):]
    # coupe la queue sous le seuil
    env = np.maximum.accumulate(a[::-1][: len(a)])[::-1] if False else None
    above = np.where(np.abs(x) > thr * pk * 0.5)[0]
    end = above[-1] + 1 if len(above) else len(x)
    x = x[:end]
    if maxlen:
        x = x[: int(maxlen * SR)]
    nf = min(int(fade * SR), len(x) // 3)
    if nf > 0:
        x[-nf:] *= np.linspace(1, 0, nf) ** 2
    return x

def norm(x, peak=0.89):
    m = np.abs(x).max()
    return x * (peak / m) if m > 0 else x

def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR * 0.49) / (SR / 2), "low")
    return signal.lfilter(b, a, x)

def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), "high")
    return signal.lfilter(b, a, x)

def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR * 0.49) / (SR / 2)], "band")
    return signal.lfilter(b, a, x)

def peak(x, f0, gain_db, q=1.0):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / SR; al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return signal.lfilter(b, a, x)

def shelf_low(x, f0, gain_db):
    return x + (10 ** (gain_db / 20) - 1) * lp(x, f0, 1)

def sat(x, drive=2.0):
    x = norm(x, 1.0)
    return np.tanh(x * drive) / np.tanh(drive)

def comp(x, thr=0.3, ratio=4, att=0.002, rel=0.08):
    x = norm(x, 1.0)
    a1 = np.exp(-1 / (att * SR)); r1 = np.exp(-1 / (rel * SR))
    env = 0.0; g = np.ones_like(x); ax = np.abs(x)
    for i in range(len(x)):
        c = a1 if ax[i] > env else r1
        env = c * env + (1 - c) * ax[i]
        if env > thr:
            g[i] = (thr + (env - thr) / ratio) / env
    return x * g

def sp1200(x, bits=12, rate=26040):
    """Rééchantillonnage sans filtre anti-repliement + 12 bits, comme les vieux samplers."""
    n = int(len(x) * rate / SR)
    idx = (np.arange(n) * SR / rate).astype(int)
    y = x[idx]
    q = 2 ** (bits - 1)
    y = np.round(norm(y, 0.95) * q) / q
    back = np.repeat(y, int(np.ceil(SR / rate)))[: len(x)]
    # interpolation à pas fixe pour revenir à 44,1 kHz
    t = np.arange(len(x)) * rate / SR
    back = y[np.minimum(t.astype(int), len(y) - 1)]
    return lp(back, 12500, 4)

def tape(x, wow=0.0015, cut=8000, drive=1.6):
    n = len(x); t = np.arange(n) / SR
    d = wow * SR * (1 + np.sin(2 * np.pi * 0.7 * t)) / 2
    i = np.arange(n) - d
    i0 = np.clip(np.floor(i).astype(int), 0, n - 1); fr = i - np.floor(i)
    y = x[i0] * (1 - fr) + x[np.minimum(i0 + 1, n - 1)] * fr
    return lp(sat(y, drive), cut, 2)

def pitch(x, ratio):
    n = int(len(x) / ratio)
    return np.interp(np.arange(n) * ratio, np.arange(len(x)), x)

def crackle(sec, density=25, amp=0.25):
    n = int(sec * SR); y = rng.normal(0, 0.004, n)
    k = rng.poisson(density * sec)
    for p in rng.integers(0, n - 200, k):
        L = rng.integers(20, 120); y[p:p + L] += rng.normal(0, amp * rng.random(), L) * np.exp(-np.arange(L) / (L / 4))
    return bp(y, 300, 9000)

def reverb(x, t60=1.2, mix_=0.25, pre=0.01, bright=6000):
    n = int(t60 * SR)
    ir = rng.normal(0, 1, n) * np.exp(-6.9 * np.arange(n) / n)
    ir = lp(ir, bright, 1); ir[: int(pre * SR)] = 0
    wet = np.pad(signal.fftconvolve(x, ir), (0, 1))[: len(x) + n]
    wet = norm(wet, 1.0) * np.abs(x).max()
    y = np.concatenate([x, np.zeros(n)])
    return y * (1 - mix_) + wet * mix_

def spring(x, mix_=0.4, sec=2.2):
    """Réverbe à ressort : impulsion dispersée par une cascade de passe-tout, répétée et amortie."""
    n = int(sec * SR); imp = np.zeros(n); imp[0] = 1
    y = imp
    for _ in range(80):
        y = signal.lfilter([-0.62, 1], [1, -0.62], y)
    ir = np.zeros(n)
    d = int(0.037 * SR)
    for k in range(0, n // d):
        seg = y[: n - k * d] * (0.72 ** k)
        ir[k * d:] += seg[: n - k * d]
    ir = bp(ir, 180, 4200) * np.exp(-4.5 * np.arange(n) / n)
    wet = np.pad(signal.fftconvolve(x, ir), (0, 1))[: len(x) + n]
    wet = norm(wet, 1.0) * np.abs(x).max()
    return np.concatenate([x, np.zeros(n)]) * (1 - mix_) + wet * mix_

def echo(x, t=0.375, fb=0.55, n=6, cut=3500):
    d = int(t * SR); y = np.zeros(len(x) + d * n); y[: len(x)] += x; r = x.copy()
    for k in range(1, n + 1):
        r = lp(r, cut, 1) * fb
        y[k * d: k * d + len(r)] += r
    return y

# ---------- synthèse (kit électro et accessoires) ----------
def env(n, dec):
    return np.exp(-np.arange(n) / (dec * SR))

def osc_sweep(f0, f1, sweep, dur, dec):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / sweep)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, dec)

def noise(dur, dec):
    n = int(dur * SR); return rng.normal(0, 1, n) * env(n, dec)

def metal(dur, dec, lo=7000, hi=12000):
    n = int(dur * SR); t = np.arange(n) / SR
    fs = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]
    s = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in fs)
    return bp(s, lo, hi, 2) * env(n, dec)

def s_kick808(dur=1.4, dec=0.45, f=48):
    x = osc_sweep(140, f, 0.025, dur, dec)
    x[: int(0.004 * SR)] += np.linspace(0.6, 0, int(0.004 * SR))
    return sat(x, 1.4)

def s_snare808():
    a = osc_sweep(240, 185, 0.02, 0.35, 0.05); b = osc_sweep(400, 330, 0.02, 0.35, 0.04)
    return mix((a, 0.6), (b, 0.3), (hp(noise(0.35, 0.09), 1500), 0.8))

def s_clap():
    n = int(0.45 * SR); y = np.zeros(n); t = np.arange(n) / SR
    for o in (0, 0.012, 0.024):
        s = int(o * SR); L = int(0.008 * SR); y[s:s + L] += rng.normal(0, 1, L)
    s = int(0.034 * SR); y[s:] += rng.normal(0, 1, n - s) * env(n - s, 0.11)
    return bp(y, 800, 2600)

def s_snap():
    x = mix((bp(noise(0.12, 0.012), 1800, 5000), 1), (osc_sweep(1900, 1500, 0.004, 0.05, 0.01), 0.6))
    return reverb(x, 0.35, 0.18)

def s_cowbell():
    n = int(0.6 * SR); t = np.arange(n) / SR
    s = np.sign(np.sin(2 * np.pi * 540 * t)) + np.sign(np.sin(2 * np.pi * 800 * t))
    return bp(s, 500, 2600) * (0.6 * env(n, 0.012) + 0.4 * env(n, 0.18))

def s_clave():
    return osc_sweep(2500, 2450, 0.01, 0.12, 0.022)

def s_rim808():
    return bp(mix((osc_sweep(1700, 1650, 0.01, 0.08, 0.01), 1), (noise(0.03, 0.004), 0.5)), 600, 6000)

def s_tom808(f):
    return osc_sweep(f * 1.35, f, 0.05, 0.9, 0.25)

def s_conga808(f):
    return osc_sweep(f * 1.15, f, 0.01, 0.4, 0.09)

def s_sub(note=36, dur=1.6):
    f = 440 * 2 ** ((note - 69) / 12); x = osc_sweep(f * 1.6, f, 0.012, dur, 0.6)
    return sat(x, 2.0)

def s_zap():
    return osc_sweep(3200, 120, 0.035, 0.35, 0.12)

def s_syndrum(f=220):
    return osc_sweep(f * 2.2, f * 0.6, 0.18, 1.0, 0.3)

def s_siren():
    n = int(1.6 * SR); t = np.arange(n) / SR
    f = 600 + 500 * np.sin(2 * np.pi * 3.0 * t) * np.minimum(1, t * 2)
    x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.minimum(1, (1.6 - t) * 3)
    return echo(lp(x, 3000) * 0.5, 0.33, 0.5, 4)

def s_orchhit():
    n = int(0.9 * SR); t = np.arange(n) / SR
    fs = [130.8, 196, 261.6, 311.1, 392, 523.3]
    s = sum(sum(np.sin(2 * np.pi * f * h * t) / h for h in range(1, 7)) for f in fs)
    return lp(s, 4000) * env(n, 0.22)

def s_vinylhit():
    return mix((crackle(1.2, 40, 0.5), 1.0), (bp(noise(0.08, 0.02), 1500, 4000), 0.3))

# ---------- kits ----------
def boombap():
    sp = lambda x: comp(sp1200(x), 0.35, 3)
    k = sp(sat(mix((mic("mid", "kick_snon"), 0.7), (mic("kickmic", "kick_snon"), 0.6)), 1.8))
    s = sp(mix((mic("mid", "snare_center"), 0.8), (mic("room", "snare_center"), 0.5)))
    return [
        ("Kick", lp(k, 9000), 1.0), ("Snare", s, 0.95), ("Hat", sp(mic("mid", "hh_closed")), 0.6), ("Open hat", sp(mic("mid", "hh_open")), 0.55),
        ("Rim", sp(mic("snaremic", "snare_crossstick")), 0.8), ("Snare 2", sp(mic("mid", "snare_rimshot")), 0.9), ("Tamb", sp(perc("tambourine")), 0.6), ("Kick 2", sp(sat(mic("kickmic", "kick_snoff"), 2.5)), 1.0),
        ("Tom bas", sp(mic("mid", "ltom_center")), 0.8), ("Tom haut", sp(mic("mid", "htom_center")), 0.8), ("Ride", sp(mic("mid", "ride_ride")), 0.5), ("Crash", sp(mic("room", "crash_crash")), 0.5),
        ("Shaker", sp(perc("shaker")), 0.5), ("Conga", sp(perc("conga", "HitN_101")), 0.7), ("Cloche", sp(perc("cowbell")), 0.55), ("Vinyle", s_vinylhit(), 0.5),
    ]

def lofi():
    lf = lambda x: tape(pitch(x, 0.93), 0.002, 6500, 1.8)
    def dust(x):
        c = crackle(len(x) / SR + 0.1, 18, 0.15)[: len(x)]
        return x + c * np.abs(x).max() * 0.25
    return [
        ("Kick", dust(lf(mic("lofi", "kick_snon"))), 1.0), ("Snare", dust(lf(mic("lofi", "snare_center"))), 0.9), ("Hat", lf(mic("lofi", "hh_closed")), 0.55), ("Open hat", lf(mic("lofi", "hh_half")), 0.5),
        ("Rim", lf(mic("lofi", "snare_crossstick")), 0.75), ("Snare doux", lf(mic("lofi", "snare_muted")), 0.8), ("Shaker", lf(perc("shaker")), 0.45), ("Kick 2", lf(mic("lofi", "kick_snoff")), 1.0),
        ("Tom bas", lf(mic("lofi", "ltom_center")), 0.8), ("Tom haut", lf(mic("lofi", "htom_center")), 0.8), ("Ride", lf(mic("lofi", "ride_ride")), 0.45), ("Buzz", lf(mic("lofi", "snare_buzz")), 0.7),
        ("Triangle", lf(perc("triangle")), 0.4), ("Bongo", lf(perc("bongoh")), 0.65), ("Cloche", lf(perc("agogo", "Low")), 0.5), ("Vinyle", tape(s_vinylhit(), 0, 7000, 1.2), 0.55),
    ]

def electro():
    return [
        ("Kick 808", s_kick808(), 1.0), ("Snare", s_snare808(), 0.85), ("Hat", metal(0.12, 0.018), 0.55), ("Open hat", metal(0.7, 0.18), 0.5),
        ("Clap", s_clap(), 0.85), ("Rim", s_rim808(), 0.7), ("Clave", s_clave(), 0.55), ("Kick court", s_kick808(0.5, 0.12, 55), 1.0),
        ("Tom bas", s_tom808(90), 0.85), ("Tom haut", s_tom808(150), 0.85), ("Cloche", s_cowbell(), 0.55), ("Cymbale", metal(1.6, 0.5, 4500, 11000), 0.4),
        ("Conga", s_conga808(320), 0.7), ("Sub", s_sub(36), 0.95), ("Zap", s_zap(), 0.6), ("Hit", s_orchhit(), 0.55),
    ]

def dub():
    snr = mix((mic("mid", "snare_rimshot"), 0.8), (mic("snaremic", "snare_rimshot"), 0.5))
    kick = lp(sat(mic("kickmic", "kick_snoff"), 1.5), 2500, 2)
    kick = shelf_low(kick, 120, 6)
    return [
        ("Kick", kick, 1.0), ("Snare", hp(snr, 180), 0.9), ("Hat", mic("mid", "hh_closed"), 0.55), ("Open hat", mic("mid", "hh_half"), 0.5),
        ("Rim", mic("snaremic", "snare_crossstick"), 0.8), ("Snare ressort", spring(hp(snr, 200), 0.45), 0.85), ("Guiro", perc("guiro"), 0.5), ("Steppers", comp(kick, 0.4, 3), 1.0),
        ("Tom bas", spring(mic("mid", "ltom_center"), 0.3, 1.5), 0.8), ("Tom haut", spring(mic("mid", "htom_center"), 0.3, 1.5), 0.8), ("Ride", mic("mid", "ride_bell"), 0.45), ("Écho", echo(hp(snr, 250), 0.375, 0.6, 7), 0.75),
        ("Syndrum", s_syndrum(180), 0.6), ("Sirène", s_siren(), 0.45), ("Claves", perc("claves"), 0.5), ("Cloche", perc("cowbell"), 0.5),
    ]

def acoustic():
    m = lambda a, r=0.45: mix((mic("mid", a), 1.0), (mic("room", a), r))
    return [
        ("Kick", mix((mic("mid", "kick_snon"), 0.8), (mic("kickmic", "kick_snon"), 0.5), (mic("room", "kick_snon"), 0.3)), 1.0), ("Snare", m("snare_center"), 0.9), ("Hat", m("hh_closed", 0.3), 0.55), ("Open hat", m("hh_open", 0.3), 0.5),
        ("Rim", m("snare_crossstick", 0.3), 0.75), ("Rimshot", m("snare_rimshot"), 0.85), ("Pédale HH", m("hh_pedal", 0.3), 0.5), ("Kick 2", m("kick_snoff"), 1.0),
        ("Tom bas", m("ltom_center"), 0.8), ("Tom haut", m("htom_center"), 0.8), ("Ride", m("ride_ride", 0.3), 0.45), ("Cloche ride", m("ride_bell", 0.3), 0.45),
        ("Crash", m("crash_crash", 0.3), 0.45), ("Tamb", perc("tambourine"), 0.5), ("Shaker", perc("shaker"), 0.45), ("Roulement", m("snare_buzz"), 0.75),
    ]

def neosoul():
    warm = lambda x: lp(shelf_low(comp(x, 0.35, 3, 0.004, 0.12), 150, 3), 9000, 2)
    kick = warm(mix((mic("kickmic", "kick_snoff"), 0.9), (mic("mid", "kick_snoff"), 0.4)))
    return [
        ("Kick", kick, 1.0), ("Snare", warm(mix((mic("snaremic", "snare_offcenter"), 0.8), (mic("room", "snare_offcenter"), 0.25))), 0.85), ("Hat", warm(mic("mid", "hh_34")), 0.5), ("Open hat", warm(mic("mid", "hh_half")), 0.45),
        ("Rim", warm(mic("snaremic", "snare_crossstick")), 0.8), ("Snare mat", warm(mic("snaremic", "snare_muted")), 0.8), ("Snap", s_snap(), 0.6), ("Kick 2", warm(mic("kickmic", "kick_snon")), 1.0),
        ("Clap", reverb(s_clap(), 0.5, 0.2), 0.7), ("Shaker", perc("shaker"), 0.45), ("Tamb", perc("tambourine"), 0.45), ("Ride", warm(mic("mid", "flatride_ride")), 0.45),
        ("Conga", perc("conga", "HitN_101"), 0.65), ("Bongo", perc("bongol"), 0.65), ("Triangle", perc("triangle"), 0.35), ("Tom", warm(mic("mid", "ltom_muted") if "mid/ltom_muted" in PICK["pick"] else mic("mid", "ltom_center")), 0.75),
    ]

def percus():
    return [
        ("Kick", mic("kickmic", "kick_snoff"), 1.0), ("Conga", perc("conga", "HitN_101"), 0.8), ("Conga claq", perc("conga", "HitHM1_71"), 0.75), ("Tumba", perc("tumba", "101_127"), 0.8),
        ("Bongo haut", perc("bongoh"), 0.75), ("Bongo bas", perc("bongol"), 0.75), ("Claves", perc("claves"), 0.55), ("Shaker", perc("shaker"), 0.5),
        ("Cloche", perc("cowbell"), 0.55), ("Agogo haut", perc("agogo", "High"), 0.5), ("Agogo bas", perc("agogo", "Low"), 0.5), ("Guiro", perc("guiro"), 0.5),
        ("Cabasa", perc("cabasa"), 0.5), ("Tamb", perc("tambourine"), 0.5), ("Triangle", perc("triangle"), 0.35), ("Vibraslap", perc("vibraslap", "71_127"), 0.5),
    ]

KITS = [
    ("boombap", "BOOM BAP 93", "Boom bap", "Batterie acoustique passée au 12 bits, façon sampler années 90", boombap),
    ("lofi", "LO-FI CASSETTE", "Lo-fi", "Prise lo-fi, cassette, poussière de vinyle", lofi),
    ("electro", "ÉLECTRO 808", "Hip-hop électro", "Boîte à rythmes analogique synthétisée", electro),
    ("dub", "DUB STATION", "Reggae dub", "Rimshots secs, réverbe à ressort, écho, sirène", dub),
    ("acoustic", "ACOUSTIQUE", "Acoustique", "Batterie jazz naturelle, micros d'ensemble et de pièce", acoustic),
    ("neosoul", "NÉO SOUL", "Néo soul", "Kit serré et chaud, claquements de doigts, percussions", neosoul),
    ("percus", "PERCUS", "Percussions", "Congas, bongos, cloches, shakers", percus),
]

def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    index = []
    total = 0
    for kid, name, style, desc, fn in KITS:
        d = os.path.join(OUT, kid); os.makedirs(d)
        pads = []
        for i, (pname, x, gain) in enumerate(fn()):
            x = norm(trim(np.asarray(x, dtype=np.float64), maxlen=2.5), 0.89)
            path = f"{i + 1:02d}.wav"
            sf.write(os.path.join(d, path), (x * 32767).astype(np.int16), SR, subtype="PCM_16")
            total += os.path.getsize(os.path.join(d, path))
            pads.append({"name": pname, "file": path, "gain": gain})
        json.dump({"id": kid, "name": name, "style": style, "desc": desc, "pads": pads}, open(os.path.join(d, "kit.json"), "w"), ensure_ascii=False, indent=1)
        index.append({"id": kid, "name": name, "style": style, "desc": desc})
        print(f"{name}: ok")
    json.dump({"kits": index}, open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False, indent=1)
    open(os.path.join(OUT, "CREDITS.md"), "w").write(
        "# Sons des kits\n\nLes kits acoustiques sont construits à partir de **Virtuosity Drums** "
        "(Versilian Studios et Karoryfer Samples), publié sous licence **CC0 1.0** (domaine public) : "
        "https://github.com/sfzinstruments/virtuosity_drums\n\n"
        "Les sons du kit Électro 808 et les effets (sirène, syndrum, vinyle, claquements) sont synthétisés "
        "pour NOMAD-16. Tous les traitements (12 bits, cassette, ressort, écho) sont faits pour NOMAD-16.\n")
    print("total", round(total / 1e6, 1), "Mo")

main()
