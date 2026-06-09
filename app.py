"""
Le Mag Campus Nancy — site de veille étudiante (Flask)
=======================================================
Site public proposant un panorama de ressources curées (articles, vidéos,
études) par grandes thématiques, pour les étudiants des écoles Eduservices
de Nancy (Pigier, MyDigitalSchool, Win Sport School). Toutes les ressources
sont externes (sources françaises de qualité). Pas de contenu pédagogique
propre — uniquement de la veille et de l'orientation vers les sources.
"""
import json
import os
from pathlib import Path
from datetime import datetime

from flask import Flask, render_template, jsonify, send_from_directory, abort

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "content.json"

# URL de redirection externe (site du campus officiel, à régler en env)
CAMPUS_URL = os.environ.get(
    "CAMPUS_URL", "https://www.pigier.com/ecole-commerce-nancy"
)

app = Flask(__name__)
app.config["JSON_AS_ASCII"] = False
app.config["JSONIFY_PRETTYPRINT_REGULAR"] = False

with DATA_FILE.open("r", encoding="utf-8") as f:
    DATA = json.load(f)

THEMATICS = DATA.get("thematics", {})
DEFAULT_THEMATIC = DATA.get(
    "default_thematic", next(iter(THEMATICS), "culture-generale")
)

# Overlay de la veille hebdomadaire (Le Récap), fichier léger mis à jour par la tâche du dimanche.
VEILLE_FILE = BASE_DIR / "data" / "veille.json"
try:
    if VEILLE_FILE.exists():
        _vd = json.load(VEILLE_FILE.open("r", encoding="utf-8"))
        for _slug, _v in (_vd.get("themes") or {}).items():
            _t = THEMATICS.get(_slug)
            if not _t:
                continue
            _t.setdefault("veille", {})
            if _v.get("synthese") is not None:
                _t["veille"]["synthese"] = _v["synthese"]
            if _v.get("articles"):
                _t["veille"]["articles"] = _v["articles"]
            if _v.get("dossier"):
                _t["veille"]["dossier"] = _v["dossier"]
        if _vd.get("build_date"):
            DATA["build_date"] = _vd["build_date"]
except Exception:
    pass


def _counts():
    n_th = len(THEMATICS)
    n_mod = sum(len(t.get("modules", {})) for t in THEMATICS.values())
    n_fiches = sum(
        len(m.get("fiches", []))
        for t in THEMATICS.values()
        for m in t.get("modules", {}).values()
    )
    return n_th, n_mod, n_fiches


def _render_index():
    th = THEMATICS.get(DEFAULT_THEMATIC, {})
    return render_template(
        "index.html",
        build_year=datetime.now().year,
        build_date=DATA.get("build_date", ""),
        default_thematic=DEFAULT_THEMATIC,
        theme_color=th.get("color", "#3AA76D"),
        theme_secondary=th.get("color_secondary", "#0F172A"),
        shop_url=CAMPUS_URL,
    )


@app.route("/")
def index():
    return _render_index()


@app.route("/api/data")
def api_data():
    return jsonify({
        "thematics": THEMATICS,
        "default_thematic": DEFAULT_THEMATIC,
        "shop_url": CAMPUS_URL,
        "build_date": DATA.get("build_date", ""),
    })


@app.route("/api/thematics")
def api_thematics():
    return jsonify({
        slug: {
            "slug": slug,
            "title": t.get("title", slug),
            "discipline": t.get("discipline", slug),
            "tagline": t.get("tagline", ""),
            "color": t.get("color", "#3AA76D"),
            "color_secondary": t.get("color_secondary", "#0F172A"),
            "modules_count": len(t.get("modules", {})),
            "fiches_count": sum(len(m.get("fiches", [])) for m in t.get("modules", {}).values()),
        }
        for slug, t in THEMATICS.items()
    })


@app.route("/api/thematic/<slug>")
def api_thematic(slug):
    t = THEMATICS.get(slug)
    if not t:
        abort(404)
    return jsonify(t)


@app.route("/api/module/<slug>/<num>")
def api_module(slug, num):
    t = THEMATICS.get(slug)
    if not t:
        abort(404)
    mod = t.get("modules", {}).get(str(num))
    if not mod:
        abort(404)
    return jsonify(mod)


@app.route("/api/fiche/<slug>/<code>")
def api_fiche(slug, code):
    t = THEMATICS.get(slug)
    if not t:
        abort(404)
    for mod in t.get("modules", {}).values():
        for fi in mod.get("fiches", []):
            if fi.get("code") == code:
                return jsonify(fi)
    abort(404)


@app.route("/healthz")
def healthz():
    n_th, n_mod, n_fiches = _counts()
    return jsonify(status="ok", thematics=n_th, modules=n_mod, fiches=n_fiches)


@app.route("/robots.txt")
def robots():
    return send_from_directory(BASE_DIR / "static", "robots.txt", mimetype="text/plain")


@app.errorhandler(404)
def not_found(_e):
    if "/api/" in (str(_e) or 