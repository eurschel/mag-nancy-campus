#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Enrichit data/content.json avec les images OpenGraph des ressources curées.

Pour chaque ressource (dict avec "url" + "title") sans champ "image" :
  1. télécharge la page, extrait og:image / twitter:image ;
  2. vérifie que l'URL d'image répond avec un Content-Type image/* ;
  3. ajoute "image": <url> — le front la proxifie via wsrv.nl avec fallback onerror.

Les URLs YouTube sont ignorées (thumbnail gérée côté JS via i.ytimg.com).

Usage:
    python tools/enrich_og_images.py [--dry-run]
"""
import concurrent.futures as cf
import html
import json
import re
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urljoin

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data" / "content.json"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")

OG_A = re.compile(rb'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)(?::src)?["\'][^>]*?content=["\']([^"\']+)["\']', re.I)
OG_B = re.compile(rb'<meta[^>]+content=["\']([^"\']+)["\'][^>]*?(?:property|name)=["\'](?:og:image|twitter:image)', re.I)


def fetch(url, limit=400_000):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept-Language": "fr,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,image/*,*/*;q=0.8",
    })
    with urllib.request.urlopen(req, timeout=12) as r:
        return (r.headers.get("Content-Type") or "").lower(), r.read(limit)


def og_image(url):
    low = url.lower()
    if "youtube.com" in low or "youtu.be" in low or low.endswith(".pdf"):
        return None
    try:
        ct, body = fetch(url)
        if "html" not in ct:
            return None
        m = OG_A.search(body) or OG_B.search(body)
        if not m:
            return None
        img = html.unescape(m.group(1).decode("utf-8", "replace").strip())
        if img.startswith("//"):
            img = "https:" + img
        elif not img.startswith("http"):
            img = urljoin(url, img)
        if img.lower().split("?")[0].endswith(".svg"):
            return None
        ict, _ = fetch(img, limit=2048)
        if "image" not in ict:
            return None
        return img
    except Exception:
        return None


def collect(node, out):
    """Récupère récursivement les dicts ressource (url + title, pas encore d'image)."""
    if isinstance(node, dict):
        if node.get("url") and node.get("title") and not node.get("image"):
            out.append(node)
        for v in node.values():
            collect(v, out)
    elif isinstance(node, list):
        for v in node:
            collect(v, out)


def main():
    dry = "--dry-run" in sys.argv
    d = json.loads(DATA.read_text(encoding="utf-8"))
    items = []
    collect(d.get("thematics", {}), items)
    # dédoublonne les fetches par URL (une même source peut apparaître plusieurs fois)
    urls = sorted({it["url"] for it in items})
    print("%d ressources, %d URLs uniques à inspecter" % (len(items), len(urls)))

    found = {}
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(og_image, u): u for u in urls}
        done = 0
        for f in cf.as_completed(futs):
            u = futs[f]
            img = f.result()
            done += 1
            if img:
                found[u] = img
            if done % 50 == 0:
                print("  ... %d/%d inspectées, %d images trouvées" % (done, len(urls), len(found)))

    n = 0
    for it in items:
        img = found.get(it["url"])
        if img:
            it["image"] = img
            n += 1
    print("RESULTAT : %d/%d ressources enrichies (og:image vérifiée)" % (n, len(items)))

    if dry:
        print("(dry-run : pas d'écriture)")
        return
    DATA.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # contrôle : relecture
    json.loads(DATA.read_text(encoding="utf-8"))
    print("content.json réécrit et revalidé.")


if __name__ == "__main__":
    main()
