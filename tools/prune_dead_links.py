#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Filtre les ressources mortes de data/content.json.

Règles (prudentes — on ne supprime que ce qui est PROUVÉ mort) :
  - YouTube : vérification via l'API oEmbed officielle.
      200 → vidéo disponible ; 400/404 → supprimée/privée → RETIRER ;
      401/403 → embed désactivé mais regardable → garder.
  - Autres URLs : GET avec UA navigateur.
      404 / 410 → RETIRER ;
      403 / 429 / timeout / erreur réseau → GARDER (anti-bot probable, pas une preuve).

Usage:
    python tools/prune_dead_links.py [--dry-run]
"""
import concurrent.futures as cf
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data" / "content.json"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")


def status_of(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept-Language": "fr,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read(2048)
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return None  # réseau/SSL/timeout → indéterminé


def is_dead(url):
    low = url.lower()
    if "youtube.com" in low or "youtu.be" in low:
        oe = ("https://www.youtube.com/oembed?format=json&url="
              + urllib.parse.quote(url, safe=""))
        st = status_of(oe)
        return st in (400, 404)  # supprimée ou privée
    st = status_of(url)
    return st in (404, 410)


def walk_lists(node, out):
    """Repère chaque (liste, index) de ressource url+title pour suppression in place."""
    if isinstance(node, dict):
        for v in node.values():
            walk_lists(v, out)
    elif isinstance(node, list):
        for it in node:
            if isinstance(it, dict) and it.get("url") and it.get("title"):
                out.append((node, it))
            else:
                walk_lists(it, out)


def main():
    dry = "--dry-run" in sys.argv
    d = json.loads(DATA.read_text(encoding="utf-8"))
    pairs = []
    walk_lists(d.get("thematics", {}), pairs)
    urls = sorted({it["url"] for _, it in pairs})
    print("%d ressources, %d URLs uniques a verifier" % (len(pairs), len(urls)), flush=True)

    dead = set()
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(is_dead, u): u for u in urls}
        done = 0
        for f in cf.as_completed(futs):
            u = futs[f]
            done += 1
            if f.result():
                dead.add(u)
                print("  MORT  %s" % u, flush=True)
            if done % 80 == 0:
                print("  ... %d/%d verifiees, %d mortes" % (done, len(urls), len(dead)), flush=True)

    removed = 0
    for lst, it in pairs:
        if it["url"] in dead and it in lst:
            lst.remove(it)
            removed += 1
    print("RESULTAT : %d ressources retirees (%d URLs mortes)" % (removed, len(dead)), flush=True)

    if dry:
        print("(dry-run : pas d'ecriture)")
        return
    if removed:
        DATA.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        json.loads(DATA.read_text(encoding="utf-8"))
        print("content.json reecrit et revalide.")
    else:
        print("Rien a retirer, fichier inchange.")


if __name__ == "__main__":
    main()
