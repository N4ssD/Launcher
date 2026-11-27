#!/usr/bin/env python3
"""Génère modpack/manifest.json : la liste des fichiers (mods, configs…) que le launcher doit synchroniser.

Lancé automatiquement par GitHub Actions à chaque modification du dossier modpack/.
"""
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent / "modpack"
IGNORED = {"pack.json", "manifest.json", "README.md", ".gitkeep", ".DS_Store", "Thumbs.db", "desktop.ini"}


def sha1(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    repo = os.environ.get("GITHUB_REPOSITORY", "N4ssD/Launcher")
    branch = os.environ.get("GITHUB_REF_NAME", "main")
    base = f"https://raw.githubusercontent.com/{repo}/{branch}/modpack/"

    files = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file() or p.name in IGNORED:
            continue
        rel = p.relative_to(ROOT).as_posix()
        if rel.split("/")[0] not in {"mods", "config", "resourcepacks", "shaderpacks", "defaultconfigs", "kubejs"}:
            continue
        files.append({"path": rel, "sha1": sha1(p), "size": p.stat().st_size, "url": base + quote(rel)})

    version = hashlib.sha1("".join(f["path"] + f["sha1"] for f in files).encode()).hexdigest()[:10]
    out = {"version": version, "files": files}
    (ROOT / "manifest.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(files)} fichier(s) dans le manifeste (version {version})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
