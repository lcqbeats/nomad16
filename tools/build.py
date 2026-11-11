#!/usr/bin/env python3
"""Construit index.html à partir de src/ (une seule page, comme avant, pour GitHub Pages et l'app iPhone).

  python3 tools/build.py          construit index.html
  python3 tools/build.py --check  vérifie que index.html correspond bien à src/ (utilisé par les tests)

On modifie src/style.css, src/shell.html et src/js/*.js (dans l'ordre des numéros), jamais index.html directement.
Tous les fichiers de src/js partagent la même portée : ils sont collés bout à bout dans un seul bloc (() => { ... })().
"""
import pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

def build():
    shell = (SRC / "shell.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    js = "".join(p.read_text(encoding="utf-8") for p in sorted((SRC / "js").glob("*.js")))
    assert shell.count("/*@css*/\n") == 1 and shell.count("//@js\n") == 1
    return shell.replace("/*@css*/\n", css).replace("//@js\n", js)

if __name__ == "__main__":
    out = build()
    target = ROOT / "index.html"
    if "--check" in sys.argv:
        if target.read_text(encoding="utf-8") != out:
            sys.exit("index.html n'est pas à jour : lancez python3 tools/build.py")
        print("index.html est à jour")
    else:
        target.write_text(out, encoding="utf-8")
        print(f"index.html construit ({out.count(chr(10))} lignes)")
