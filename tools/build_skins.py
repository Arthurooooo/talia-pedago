#!/usr/bin/env python3
"""Add per-skinSet (Science=1, Math=2, History=3) variants of the room surface
symbols to the manifest + assets. Symbols that use mc.gotoAndStop(skinSet) in
Manager.hx's Class build; skin-invariant ones (Mur2, SolCouloir, BureauProf,
ChaiseEleve, TableEleve) are left as the existing single entries.

For each (symbol, skin->frame): read native geometry from the frame SVG and copy
the zoom-4 PNG to room/<out>_s<skin>.png ; merge into roomManifest.json.
"""
import os, re, json, shutil

SVG_DIR = "/tmp/swf_skins/svg"
PNG4_DIR = "/tmp/swf_skins/png4"
OUT_DIR = "/Users/arthur/talia-pedago/src/lib/assets/ts/room"
MANIFEST = "/Users/arthur/talia-pedago/src/lib/roomManifest.json"

# (charId, className, outBase, {skin: frame})
SURFACES = [
    (1645, "Ground",      "ground",      {1: 1, 2: 2, 3: 3}),
    (608,  "Ground2",     "ground2",     {1: 1, 2: 2, 3: 3}),
    (1672, "MurCouloir",  "murcouloir",  {1: 1, 2: 2, 3: 3}),
    (1750, "Secretariat", "secretariat", {1: 1, 2: 2, 3: 3}),
    (951,  "Estrade",     "estrade",     {1: 1, 2: 2, 3: 3}),
    (1146, "Wall",        "wall",        {1: 1, 2: 2, 3: 3}),
    (99,   "Street",      "street",      {1: 1, 2: 2, 3: 3}),
    (755,  "Abri",        "abri",        {1: 1, 2: 2, 3: 3}),
]
# MurSolo: frame = (skin-1)*10 + variant ; abime=1 for skin 1 (no damaged wall)
MURSOLO = {
    "normal":       {1: 1, 2: 11, 3: 21},
    "fenetre":      {1: 2, 2: 12, 3: 22},
    "interrupteur": {1: 3, 2: 13, 3: 23},
    "abime":        {1: 1, 2: 14, 3: 24},
    "porte":        {1: 6, 2: 16, 3: 26},
    "coin":         {1: 7, 2: 17, 3: 27},
}

def parse_svg(path):
    with open(path) as f:
        head = f.read(2000)
    w = float(re.search(r'width="([0-9.]+)px"', head).group(1))
    h = float(re.search(r'height="([0-9.]+)px"', head).group(1))
    m = re.search(r'<g transform="matrix\(([^)]+)\)"', head)
    nums = [float(x) for x in m.group(1).split(",")]
    return w, h, nums[4], nums[5]

def sdir(base, cid, cls):
    return os.path.join(base, f"DefineSprite_{cid}_lib.{cls}")

manifest = json.load(open(MANIFEST))
added, missing = [], []

def emit(cid, cls, frame, out):
    svg = os.path.join(sdir(SVG_DIR, cid, cls), f"{frame}.svg")
    png = os.path.join(sdir(PNG4_DIR, cid, cls), f"{frame}.png")
    if not os.path.isfile(svg) or not os.path.isfile(png):
        missing.append(f"{cls} f{frame}"); return
    w, h, tx, ty = parse_svg(svg)
    shutil.copy(png, os.path.join(OUT_DIR, f"{out}.png"))
    manifest[out] = {"w": round(w, 2), "h": round(h, 2), "ox": round(tx, 2), "oy": round(ty, 2)}
    added.append(out)

for cid, cls, outbase, frames in SURFACES:
    for skin, frame in frames.items():
        emit(cid, cls, frame, f"{outbase}_s{skin}")

for variant, frames in MURSOLO.items():
    for skin, frame in frames.items():
        emit(752, "MurSolo", frame, f"mursolo_{variant}_s{skin}")

json.dump(manifest, open(MANIFEST, "w"), indent=2)
print(f"added {len(added)} skin variants; manifest now {len(manifest)} entries")
if missing:
    print("MISSING:", missing)
