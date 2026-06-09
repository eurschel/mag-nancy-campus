#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Publie un fichier sur GitHub via l'API Contents (sans Git local).
Lit le token dans .secrets/github_token_mag_nancy.txt (jamais commite).

Usage:
    python tools/publish_github.py <fichier_local> <chemin_dans_le_repo> "message de commit"
"""
import sys, json, base64, urllib.request, urllib.error, urllib.parse
from pathlib import Path

REPO = "eurschel/mag-nancy-campus"
BASE = Path(__file__).resolve().parent.parent
TOKEN = (BASE / ".secrets" / "github_token_mag_nancy.txt").read_text(encoding="utf-8").strip()
API = "https://api.github.com"


def _req(method, path, body=None):
    req = urllib.request.Request(
        API + path, method=method,
        headers={
            "Authorization": "Bearer " + TOKEN,
            "Accept": "application/vnd.github+json",
            "User-Agent": "mag-nancy-bot",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    if body is not None:
        req.data = json.dumps(body).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def publish(local_path, repo_path, message):
    raw = (BASE / local_path).read_bytes()
    size_kb = round(len(raw) / 1024, 1)
    enc = urllib.parse.quote(repo_path, safe="/")
    sha = None
    code, info = _req("GET", "/repos/%s/contents/%s" % (REPO, enc))
    if code == 200 and isinstance(info, dict):
        sha = info.get("sha")
    body = {"message": message, "content": base64.b64encode(raw).decode("ascii")}
    if sha:
        body["sha"] = sha
    code, resp = _req("PUT", "/repos/%s/contents/%s" % (REPO, enc), body)
    if code in (200, 201):
        commit = (resp.get("commit") or {}).get("sha", "")[:7]
        print("OK  %-30s %6s KB  commit %s" % (repo_path, size_kb, commit))
        return True
    print("ECHEC %s (HTTP %s) : %s" % (repo_path, code, resp.get("message")))
    return False


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    ok = publish(sys.argv[1], sys.argv[2], sys.argv[3])
    sys.exit(0 if ok else 1)
