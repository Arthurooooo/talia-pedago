#!/usr/bin/env python3
"""Additive extraction of the per-subject Science/Maths furniture sprites that were
missing from the room (Manager.hx:2150-2305). Reads native geometry from the zoom-1
SVG, copies the zoom-4 PNG into the app assets, and MERGES into roomManifest.json
WITHOUT touching the existing entries (surfaces, skins, students' kit, etc.).

Export beforehand (10 ids) to /tmp/newfurn :
  IDS=665,553,1130,366,77,1041,1044,337,1634,20
  ffdec -zoom 4 -ignorebackground -format sprite:png -selectid $IDS -export sprite /tmp/newfurn/png4 _gfx.swf
  ffdec               -format sprite:svg -selectid $IDS -export sprite /tmp/newfurn/svg  _gfx.swf
"""
import os, re, json, shutil

SVG_DIR = "/tmp/newfurn/svg"
PNG4_DIR = "/tmp/newfurn/png4"
OUT_DIR = "/Users/arthur/talia-pedago/src/lib/assets/ts/room"
MANIFEST = "/Users/arthur/talia-pedago/src/lib/roomManifest.json"

# (charId, className, frame, outName)
NEEDED = [
    (665,  "Skully",     1, "skully"),       # mascotte Sciences (iso.Skully)
    (553,  "Potions",    1, "potions"),      # fioles de chimie
    (1130, "Ordi",       1, "ordi"),         # poste informatique
    (366,  "Projo",      8, "projo"),        # vidéoprojecteur, label "off" = frame 8
    (77,   "TableM",     1, "tablem"),       # table prof (Maths)
    (1041, "Paper",      1, "paper"),        # feuilles au sol
    (1044, "Paper2",     1, "paper2"),       # feuilles 2
    (337,  "MathsCadre", 1, "mathscadre"),   # cadre portrait mathématicien (frame 1)
    (337,  "MathsCadre", 2, "mathscadre2"),  # cadre portrait (frame 2)
    (1634, "Hamster",    1, "hamster"),      # hamster (repos = frame 1, mc.stop())
    (20,   "Aquarium",   1, "aquarium"),     # aquarium Bubulle
]

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
before = len(manifest)
missing = []
for cid, cls, frame, out in NEEDED:
    svg = os.path.join(sdir(SVG_DIR, cid, cls), f"{frame}.svg")
    png = os.path.join(sdir(PNG4_DIR, cid, cls), f"{frame}.png")
    if not os.path.isfile(svg) or not os.path.isfile(png):
        missing.append(f"{cls} f{frame}"); continue
    w, h, tx, ty = parse_svg(svg)
    shutil.copy(png, os.path.join(OUT_DIR, f"{out}.png"))
    manifest[out] = {"w": round(w, 2), "h": round(h, 2), "ox": round(tx, 2), "oy": round(ty, 2)}
    print(f"{out:14s} {w:6.1f}x{h:6.1f}  origin=({tx:.1f},{ty:.1f})")

json.dump(manifest, open(MANIFEST, "w"), indent=2)
print(f"\nmanifest {before} -> {len(manifest)} entries")
if missing:
    print("MISSING:", missing)
