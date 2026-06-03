#!/usr/bin/env python3
"""Build the room asset manifest from extracted Teacher Story symbols.

For each needed (charId, class, frame): read native geometry from the zoom-1 SVG
(canvas W/H + origin offset = first <g transform> translate), copy the zoom-4 PNG
into the app assets, and emit a manifest entry with NATIVE w,h,ox,oy (zoom 1).
"""
import os, re, json, shutil

SVG_DIR = "/tmp/swfexport/svg"
PNG4_DIR = "/tmp/swfexport/png4"
OUT_DIR = "/Users/arthur/talia-pedago/src/lib/assets/ts/room"
MANIFEST = "/Users/arthur/talia-pedago/src/lib/roomManifest.json"
ZOOM = 4  # png4 export zoom

# (charId, className, frame, outName)
NEEDED = [
    (1770, "SolCouloir", 1, "solcouloir"),
    (1672, "MurCouloir", 3, "murcouloir"),
    (1750, "Secretariat", 3, "secretariat"),
    (1645, "Ground", 3, "ground"),
    (608,  "Ground2", 3, "ground2"),
    (1651, "Mur2", 1, "mur2"),
    (951,  "Estrade", 3, "estrade"),
    (1146, "Wall", 3, "wall"),
    (99,   "Street", 1, "street"),   # passage piéton (frame 1) — droit, devant la classe
    (755,  "Abri", 3, "abri"),
    (1740, "BureauProf", 1, "bureauprof"),
    (83,   "Corbeille", 1, "corbeille"),
    (694,  "Case", 1, "case"),
    (731,  "Porte", 1, "porte"),
    (1139, "Portemask", 1, "portemask"),
    (352,  "Coffre", 1, "coffre"),
    (357,  "Armoire", 1, "armoire"),
    (26,   "Armoire2", 1, "armoire2"),
    (1133, "BureauOrdi", 1, "bureauordi"),
    (23,   "Worldmap", 1, "worldmap"),
    (1637, "Coucou", 1, "coucou"),
    (382,  "TableGlobe", 1, "tableglobe"),
    (550,  "Dessins", 1, "dessins"),
    (1577, "James", 1, "james"),       # face à la classe
    (1577, "James", 2, "james_back"),  # de dos (tourné vers le tableau)
    (650,  "CartableG", 1, "cartableg"),
    (638,  "CartableF", 1, "cartablef"),
    (658,  "TrousseG", 1, "trousseg"),
    (645,  "TrousseF", 1, "troussef"),
    (567,  "TableEleve", 3, "tableeleve"),
    (560,  "ChaiseEleve", 1, "chaiseeleve"),
    (349,  "Bonaparte", 1, "bonaparte"),
    (670,  "Sun", 3, "sun"),     # rayon de soleil DÉLIMITÉ par la fenêtre (frame 3 = faisceau net)
    (61,   "Bus", 1, "bus"),      # bus (passe dans la rue, périodiquement)
    # MurSolo variants: frame = 20 + variant
    (752, "MurSolo", 21, "mursolo_normal"),
    (752, "MurSolo", 22, "mursolo_fenetre"),
    (752, "MurSolo", 23, "mursolo_interrupteur"),
    (752, "MurSolo", 24, "mursolo_abime"),
    (752, "MurSolo", 26, "mursolo_porte"),
    (752, "MurSolo", 27, "mursolo_coin"),
]

def parse_svg(path):
    with open(path) as f:
        head = f.read(2000)
    w = float(re.search(r'width="([0-9.]+)px"', head).group(1))
    h = float(re.search(r'height="([0-9.]+)px"', head).group(1))
    # first <g transform="matrix(a, b, c, d, tx, ty)"> after the <svg> tag
    m = re.search(r'<g transform="matrix\(([^)]+)\)"', head)
    nums = [float(x) for x in m.group(1).split(",")]
    tx, ty = nums[4], nums[5]
    return w, h, tx, ty

def find_dir(base, cid, cls):
    name = f"DefineSprite_{cid}_lib.{cls}"
    p = os.path.join(base, name)
    return p if os.path.isdir(p) else None

os.makedirs(OUT_DIR, exist_ok=True)
manifest = {}
missing = []
for cid, cls, frame, out in NEEDED:
    svg_dir = find_dir(SVG_DIR, cid, cls)
    png_dir = find_dir(PNG4_DIR, cid, cls)
    if not svg_dir or not png_dir:
        missing.append(f"{cls} (dir)"); continue
    svg = os.path.join(svg_dir, f"{frame}.svg")
    png = os.path.join(png_dir, f"{frame}.png")
    if not os.path.isfile(svg) or not os.path.isfile(png):
        missing.append(f"{cls} frame {frame}"); continue
    w, h, tx, ty = parse_svg(svg)
    shutil.copy(png, os.path.join(OUT_DIR, f"{out}.png"))
    manifest[out] = {
        "w": round(w, 2), "h": round(h, 2),     # native (zoom-1) size in px
        "ox": round(tx, 2), "oy": round(ty, 2), # symbol origin position within the png (native px)
    }
    print(f"{out:22s} {w:6.1f}x{h:6.1f}  origin=({tx:.1f},{ty:.1f})")

with open(MANIFEST, "w") as f:
    json.dump(manifest, f, indent=2)
print("\nWritten", MANIFEST, "with", len(manifest), "entries")
if missing:
    print("MISSING:", missing)
