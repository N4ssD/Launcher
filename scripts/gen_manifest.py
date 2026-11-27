#!/usr/bin/env python3
"""Génère modpack/manifest.json : la liste des fichiers (mods, configs…) que le launcher doit synchroniser,
avec les infos de chaque mod (nom, version, description, icône) lues directement dans les .jar.

Lancé automatiquement par GitHub Actions à chaque modification du dossier modpack/.
"""
import hashlib
import io
import json
import os
import re
import sys
import zipfile
from pathlib import Path
from urllib.parse import quote

try:
    import tomllib
except ImportError:  # Python < 3.11
    tomllib = None

ROOT = Path(__file__).resolve().parent.parent / "modpack"
ICONS = ROOT / "meta" / "icons"
IGNORED = {"pack.json", "manifest.json", "README.md", ".gitkeep", ".DS_Store", "Thumbs.db", "desktop.ini"}
SYNCED_DIRS = {"mods", "config", "resourcepacks", "shaderpacks", "defaultconfigs", "kubejs"}


def sha1(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def jar_version(z: zipfile.ZipFile) -> str:
    try:
        mf = z.read("META-INF/MANIFEST.MF").decode("utf-8", "replace")
        m = re.search(r"^Implementation-Version:\s*(.+)$", mf, re.M)
        return m.group(1).strip() if m else ""
    except KeyError:
        return ""


def save_icon(z: zipfile.ZipFile, logo: str, mod_id: str):
    try:
        data = z.read(logo.lstrip("/"))
    except KeyError:
        return None
    ICONS.mkdir(parents=True, exist_ok=True)
    out = ICONS / f"{re.sub(r'[^a-z0-9_.-]', '_', mod_id.lower())}.png"
    try:
        from PIL import Image  # facultatif : réduit les grosses icônes
        im = Image.open(io.BytesIO(data)).convert("RGBA")
        im.thumbnail((96, 96), Image.NEAREST if max(im.size) <= 32 else Image.LANCZOS)
        im.save(out, optimize=True)
    except Exception:
        out.write_bytes(data)
    return out


def mod_info(path: Path, base: str):
    """Lit META-INF/neoforge.mods.toml (ou mods.toml / fabric.mod.json) dans un .jar."""
    try:
        z = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        return None
    with z:
        names = set(z.namelist())
        info = None
        for toml_name in ("META-INF/neoforge.mods.toml", "META-INF/mods.toml"):
            if toml_name in names and tomllib:
                try:
                    data = tomllib.loads(z.read(toml_name).decode("utf-8", "replace"))
                except Exception:
                    continue
                mods = data.get("mods") or [{}]
                m = mods[0]
                version = str(m.get("version", ""))
                if "${" in version or not version:
                    version = jar_version(z)
                info = {
                    "id": m.get("modId", ""),
                    "name": m.get("displayName") or m.get("modId") or path.stem,
                    "version": version,
                    "description": " ".join(str(m.get("description", "")).split())[:240],
                    "authors": str(m.get("authors", "") or data.get("authors", ""))[:80],
                    "logo": m.get("logoFile") or data.get("logoFile") or "",
                }
                break
        if info is None and "fabric.mod.json" in names:
            try:
                d = json.loads(z.read("fabric.mod.json").decode("utf-8", "replace"))
                info = {"id": d.get("id", ""), "name": d.get("name", path.stem), "version": d.get("version", ""),
                        "description": " ".join(str(d.get("description", "")).split())[:240], "authors": "",
                        "logo": d.get("icon", "") if isinstance(d.get("icon"), str) else ""}
            except Exception:
                pass
        if info is None:
            info = {"id": "", "name": path.stem, "version": "", "description": "", "authors": "", "logo": ""}
        logo = info.pop("logo", "")
        icon = save_icon(z, logo, info["id"] or path.stem) if logo else None
        if icon:
            info["icon"] = base + quote(icon.relative_to(ROOT).as_posix())
        return info


def main() -> int:
    repo = os.environ.get("GITHUB_REPOSITORY", "N4ssD/Launcher")
    branch = os.environ.get("GITHUB_REF_NAME", "main")
    base = f"https://raw.githubusercontent.com/{repo}/{branch}/modpack/"

    old = {}
    try:
        prev = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
        old = {f.get("mod", {}).get("id") or f["path"]: f for f in prev.get("files", [])}
    except Exception:
        prev = {}

    files = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file() or p.name in IGNORED:
            continue
        rel = p.relative_to(ROOT).as_posix()
        if rel.split("/")[0] not in SYNCED_DIRS:
            continue
        entry = {"path": rel, "sha1": sha1(p), "size": p.stat().st_size, "url": base + quote(rel)}
        if rel.startswith("mods/") and p.suffix.lower() == ".jar":
            entry["mod"] = mod_info(p, base)
        files.append(entry)

    version = hashlib.sha1("".join(f["path"] + f["sha1"] for f in files).encode()).hexdigest()[:10]

    # Badges « Nouveau » / « Mis à jour » : recalculés seulement quand le contenu change.
    if version != prev.get("version"):
        for f in files:
            if "mod" not in f:
                continue
            key = f["mod"].get("id") or f["path"]
            before = old.get(key)
            if not old:
                f["mod"]["status"] = ""
            elif before is None:
                f["mod"]["status"] = "new"
            elif before["sha1"] != f["sha1"]:
                f["mod"]["status"] = "updated"
            else:
                f["mod"]["status"] = ""
    else:
        for f in files:
            if "mod" in f:
                key = f["mod"].get("id") or f["path"]
                f["mod"]["status"] = old.get(key, {}).get("mod", {}).get("status", "")

    out = {"version": version, "files": files}
    (ROOT / "manifest.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(files)} fichier(s) dans le manifeste (version {version}), dont {sum('mod' in f for f in files)} mod(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
