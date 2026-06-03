#!/usr/bin/env python3
"""Offline render of the Teacher Story History classroom, mirroring Manager.hx
placement exactly, to validate before porting to Svelte.

Projection (native px), sprite at isoToScreenStatic(cx-0.5+xr, cy-0.5+yr):
  sx = 185 + ax*14 - ay*14 ;  sy = 30 + ax*7 + ay*7   (ax=cx-0.5+xr, ay=cy-0.5+yr)
Placement of a symbol's registration origin:
  mode A (sprite.addChild):  origin = screen + (mcx, mcy)
  mode B (addFurnMc dx,dy):   origin = screen + (mcx + dx, mcy + 29 + dy)
PNG top-left = origin - (manifest.ox, manifest.oy)
Depth bucket: DP_BG(0) for changeDepth(DP_BG) else DP_ITEMS(5); within bucket
  key = zprio*10000 + creationIndex + 1000*int(100 + ax*7 + ay*7)
"""
import json, math
from PIL import Image

ASSET = "/Users/arthur/talia-pedago/src/lib/assets/ts/room"
MAN = json.load(open("/Users/arthur/talia-pedago/src/lib/roomManifest.json"))
Z = 4  # png export zoom (px per native unit)

RWID = RHEI = 12
EXIT = (1, 9); DESK = (5, 10); BOARD = (6, 11)
SEAT_X = [2, 4, 5, 7, 8, 10]; SEAT_Y = [2, 4, 6]
SEATS = [(x, y) for y in SEAT_Y for x in SEAT_X]  # solver order: y outer, x inner

def _hh(s):
    h = 5381
    for c in s: h = ((h << 5) + h + ord(c)) & 0xffffffff
    return h
# léger décalage déterministe par bureau (tables "pas parfaites")
def jit(x, y):
    h = _hh(f"jit{x},{y}")
    return ((h % 5) - 2, ((h >> 3) % 3) - 1)   # jx -2..2, jy -1..1 (px natifs)

def heightmap(cx, cy):
    return 3 if (3 <= cx < 9 and 9 <= cy < 12) else 0

def screen(cx, cy, xr=0.5, yr=0.5):
    ax = cx - 0.5 + xr; ay = cy - 0.5 + yr
    return (185 + ax*14 - ay*14, 30 + ax*7 + ay*7, ax, ay)

DP_BG, DP_ITEMS = 0, 5
items = []  # each: dict
_idx = [0]
def add(asset, cx, cy, mode="A", dx=0, dy=0, mcx=0, mcy=0, xr=0.5, yr=0.5,
        zprio=0, bucket=DP_ITEMS, flip=False, useHeight=True, extra_oy=0,
        blend=None, opacity=1.0):
    i = _idx[0]; _idx[0] += 1
    sx, sy, ax, ay = screen(cx, cy, xr, yr)
    if useHeight: sy -= heightmap(cx, cy)
    if mode == "A":
        ox, oy = mcx, mcy
    else:  # B addFurnMc
        ox, oy = mcx + dx, mcy + 29 + dy
    originx = sx + ox; originy = sy + oy + extra_oy
    key = zprio*10000 + i + 1000*int(100 + ax*7 + ay*7)
    items.append(dict(asset=asset, originx=originx, originy=originy,
                      bucket=bucket, key=key, flip=flip, blend=blend, opacity=opacity))

# ---- backgrounds (DP_BG) ----
add("solcouloir", 0, RHEI-5, "A", zprio=-99, bucket=DP_BG)
add("murcouloir", 0, 0,      "A", zprio=0,   bucket=DP_BG)
add("secretariat", RWID-1, -1, "B", dx=0, dy=0, zprio=-98, bucket=DP_BG)
# ---- front walls / neighbour room ----
add("mur2",   0, RHEI, "A", zprio=8)
add("ground2",0, RHEI, "A", zprio=8)
add("ground", 0, 0,    "A", zprio=0, bucket=DP_BG)
# ---- estrade ----
add("estrade", 3, RHEI-1, "B", dx=-14, dy=-7+3, zprio=0, bucket=DP_BG, useHeight=False)
# ---- teacher desk area ----
add("bureauprof", DESK[0], DESK[1]-1, "B", dx=-12, dy=-6)
add("corbeille",  DESK[0]+1, DESK[1]-1, "B", dx=0, dy=1, zprio=-0.5)
# ---- door ----
add("porte", EXIT[0], EXIT[1], "A", mcx=-16, mcy=17, zprio=-1)
# ---- window wall strip (MurSolo) ----
def mursolo_variant(y):
    if y == 0: return "mursolo_coin"
    if y == EXIT[1]: return "mursolo_porte"
    if y == EXIT[1]-1: return "mursolo_interrupteur"
    if y in (3, 5): return "mursolo_fenetre"
    if y in (1, 7): return "mursolo_abime"
    return "mursolo_normal"
for y in range(0, RHEI+1):
    add(mursolo_variant(y), 0, y, "B", dx=0, dy=0, mcx=2, mcy=-3, zprio=-1)
# ---- alley / street (front-right) ----
add("wall",   RWID+1, RHEI+1, "A", zprio=0)
add("street", RWID+1, 12,     "A", zprio=1)
add("abri",   RWID+1, 12,     "A", mcx=300, mcy=-150, zprio=1)
# ---- History furniture ----
add("bonaparte", 0, 3, "A", mcx=0, mcy=24, xr=1.2)   # Skully2; mc.y=getFeet≈+24
add("coffre",   0, 4, "B", dx=0, dy=0)
add("armoire2", 0, 6, "B", dx=0, dy=0)
add("bureauordi", 1, 11, "B", dx=0, dy=-10, flip=True)
add("worldmap", 4, 0, "B", dx=0, dy=-24)
add("coucou",   3, 0, "B", dx=0, dy=-6)
add("armoire",  11, 0, "B", dx=0, dy=0, flip=True)
add("tableglobe", 10, 10, "B", dx=0, dy=-8)
add("dessins",  9, 0, "B", dx=0, dy=2)
# ---- per-seat chairs + tables (légèrement décalés) ----
for (x, y) in SEATS:
    jx, jy = jit(x, y)
    add("tableeleve", x, y+1, "B", dx=-6+jx, dy=-8+jy)
    add("chaiseeleve", x, y,  "B", dx=-10+jx, dy=-5+jy)
# ---- students (body+arms, seated): yr=0.95, yOffset=-3 ; arms in front of desk ----
import os as _os, json as _json
SPOOL = _json.load(open("/Users/arthur/talia-pedago/src/lib/assets/ts/students/_pool.json"))
SG = SPOOL["geo"]; SN = SPOOL["count"]
def _h(s):
    h=5381
    for c in s: h=((h<<5)+h+ord(c))&0xffffffff
    return h
SMETA = SPOOL["students"]
def add_student(idx, x, y, jx=0, jy=0):
    sxp, syp, ax, ay = screen(x, y, 0.5, 0.95)      # seated in-case pos
    syp += -3                                        # yOffset
    sxp += jx; syp += jy
    base = "/Users/arthur/talia-pedago/src/lib/assets/ts/students"
    originx = sxp; originy = syp
    g = SMETA[idx]["gender"]; rest = SMETA[idx]["mouthRest"]
    # body + head + eyes(rest 0) + mouth(rest) stacked behind the desk
    for layer in [f"body{idx}", f"head{idx}", "eyes0", f"mouth_{g}{rest}"]:
        z = DP_ITEMS*10**7 + (_idx[0]) + 1000*int(100+ax*7+ay*7); _idx[0]+=1
        items.append(dict(asset="__"+f"{base}/{layer}.png", originx=originx, originy=originy,
                          bucket=DP_ITEMS, key=z % 10**7, flip=False, sg=SG))
    # overArms: layer 1 -> +5*1000, renders in front of desk
    zarms = DP_ITEMS*10**7 + (_idx[0]) + 1000*(5 + int(100+ax*7+ay*7)); _idx[0]+=1
    items.append(dict(asset="__"+f"{base}/armsfold{idx}.png", originx=originx, originy=originy,
                      bucket=DP_ITEMS, key=zarms % 10**7, flip=False, sg=SG))
NSTUD = int(_os.environ.get("NSTUD", "18"))
for n,(x,y) in enumerate(SEATS[:NSTUD]):
    idx = _h(f"seat{x},{y}") % SN
    jx, jy = jit(x, y)
    add_student(idx, x, y, jx, jy)
    # affaires sur le bureau — offsets EXACTS du jeu (trousse -9,-10 ; cartable -7,-8)
    male = SMETA[idx]["gender"] == "m"
    tColor = _hh(f"{x},{y}tr") % (4 if male else 3)
    cColor = _hh(f"{x},{y}ca") % (5 if male else 4)
    add(f"{'trousseg' if male else 'troussef'}_{tColor}", x, y+1, "B", dx=-9+jx, dy=-10+jy, zprio=1.5)
    add(f"{'cartableg' if male else 'cartablef'}_{cColor}", x, y+1, "B", dx=-7+jx, dy=-8+jy, zprio=2, opacity=0.96)

# ---- sun rays through windows (lib.Sun): Iso(RWID-1, y), addFurnMc(-4,2), OVERLAY, a=0.85 ----
for yy in [3.7, 5.2, 7.2, 8.7]:
    cy = int(yy); yr = yy - cy
    add("sun", RWID-1, cy, "B", dx=-4, dy=2, yr=yr, zprio=-10, blend="overlay", opacity=0.85)

# ---- teacher: James mc added with mc.y=22 ; tile BOARD=(6,11), yr=0.9 ----
add("james_back", BOARD[0], BOARD[1], "A", mcx=0, mcy=22, yr=0.9, flip=True)

# ---- composite ----
import os
if os.environ.get("INTERIOR"):
    skip = {"solcouloir","murcouloir","secretariat","ground2","street","abri","wall"}
    items[:] = [it for it in items if it["asset"] not in skip]
if os.environ.get("SUNDEBUG"):
    items[:] = [it for it in items if it["asset"] in ("ground","sun")]
if os.environ.get("NOTEACHER"):
    items[:] = [it for it in items if it["asset"] != "james"]
items.sort(key=lambda it: (it["bucket"], it["key"]))
# compute canvas bbox
minx = miny = 10**9; maxx = maxy = -10**9
# SKIN=1|2|3 : remappe les surfaces vers leur variante de skinSet (Science/Math/Histoire)
_SKIN = _os.environ.get("SKIN")
_SKINNED = {"murcouloir", "secretariat", "ground2", "ground", "estrade", "wall", "street", "abri"}
if _SKIN:
    for it in items:
        a = it["asset"]
        if a in _SKINNED or a.startswith("mursolo_"):
            it["asset"] = f"{a}_s{_SKIN}"

# test rapide : FADE="mur2:0.35,wall:0.3" pour repérer/valider le mur avant
_fade = {}
for kv in _os.environ.get("FADE", "").split(","):
    if ":" in kv:
        k, v = kv.split(":"); _fade[k.strip()] = float(v)
for it in items:
    if it["asset"] in _fade:
        it["opacity"] = _fade[it["asset"]]

placed = []
for it in items:
    if it["asset"].startswith("__"):       # student body/arms sprite, geo from _pool.json
        path = it["asset"][2:]
        g = it["sg"]
        m = {"ox": g["ox"], "oy": g["oy"], "w": g["w"], "h": g["h"], "_path": path}
    else:
        m = MAN[it["asset"]]; m = dict(m); m["_path"] = f"{ASSET}/{it['asset']}.png"
    tlx = (it["originx"] - m["ox"]) * Z
    tly = (it["originy"] - m["oy"]) * Z
    w = m["w"] * Z; h = m["h"] * Z
    placed.append((it, tlx, tly, w, h, m["_path"]))
    minx = min(minx, tlx); miny = min(miny, tly)
    maxx = max(maxx, tlx+w); maxy = max(maxy, tly+h)

# frame (native) matching ClassRoom.svelte FL/FT/FR/FB, cropped via overflow:hidden
import os as _os2
FL, FT, FR, FB = [float(v) for v in _os2.environ.get("FRAME", "6,-40,364,214").split(",")]
W = int((FR - FL) * Z); H = int((FB - FT) * Z)
offx = -FL * Z; offy = -FT * Z
canvas = Image.new("RGBA", (W, H), (29, 33, 41, 255))
import numpy as np
SUN_BLEND = _os2.environ.get("SUN_BLEND", "overlay")
SUN_OP = float(_os2.environ.get("SUN_OP", "0.85"))
def overlay_blend(base_canvas, top_png, x, y, opacity, mode="overlay"):
    bw, bh = base_canvas.size; tw, th = top_png.size
    x0, y0 = max(0, x), max(0, y); x1, y1 = min(bw, x+tw), min(bh, y+th)
    if x1 <= x0 or y1 <= y0: return
    region = base_canvas.crop((x0, y0, x1, y1))
    top = top_png.crop((x0-x, y0-y, x1-x, y1-y))
    b = np.asarray(region.convert("RGBA"), float) / 255.0
    t = np.asarray(top, float) / 255.0
    ta = t[..., 3:4] * opacity
    bc, tc = b[..., :3], t[..., :3]
    if mode == "screen":   bl = 1 - (1-bc)*(1-tc)
    elif mode == "lighten": bl = np.maximum(bc, tc)
    elif mode == "soft-light":
        bl = np.where(tc < 0.5, bc - (1-2*tc)*bc*(1-bc), bc + (2*tc-1)*(np.where(bc<0.25, ((16*bc-12)*bc+4)*bc, np.sqrt(bc)) - bc))
    else:                  bl = np.where(bc < 0.5, 2*bc*tc, 1 - 2*(1-bc)*(1-tc))  # overlay
    out = b.copy()
    out[..., :3] = bc*(1-ta) + bl*ta
    res = Image.fromarray((np.clip(out,0,1)*255).astype("uint8"), "RGBA")
    base_canvas.paste(res, (x0, y0))

# centre du trou (torse du prof @ BOARD, yr 0.9, mcy 22) en natif
_tsx, _tsy, _, _ = screen(BOARD[0], BOARD[1], 0.5, 0.9)
_holeN = (_tsx, _tsy - heightmap(BOARD[0], BOARD[1]) + 22 - 24)   # (x,y) natif

def erase_hole(png, tlx, tly):
    cx = _holeN[0]*Z - tlx; cy = _holeN[1]*Z - tly; r = 40*Z
    yy, xx = np.ogrid[:png.height, :png.width]
    d = np.sqrt((xx-cx)**2 + (yy-cy)**2)
    keep = np.clip((d - r*0.7) / (r*0.3), 0, 1)   # 0 au centre (trou), 1 au-delà du rayon
    a = np.asarray(png, float).copy()
    a[..., 3] *= keep
    return Image.fromarray(a.astype("uint8"), "RGBA")

for (it, tlx, tly, w, h, path) in placed:
    png = Image.open(path).convert("RGBA")
    if int(w) != png.width:   # student sprites need upscaling to match Z
        png = png.resize((int(w), int(h)), Image.NEAREST)
    if it["flip"]:
        png = png.transpose(Image.FLIP_LEFT_RIGHT)
    if it["asset"] == "mur2" and not _os.environ.get("NOHOLE"):
        png = erase_hole(png, tlx, tly)
    x = int(tlx + offx); y = int(tly + offy)
    if it.get("blend") == "overlay":
        overlay_blend(canvas, png, x, y, SUN_OP, SUN_BLEND)
    else:
        op = it.get("opacity", 1.0)
        if op < 1.0:
            a = png.getchannel("A").point(lambda v: int(v * op))
            png.putalpha(a)
        canvas.alpha_composite(png, (x, y))

# optional bus overlay (preview the pass): BUSP=0..1
busp = _os2.environ.get("BUSP")
if busp is not None:
    p = float(busp); y = -10 + p*35; cx = 15
    px = 185 + cx*14 - y*14; py = 30 + (cx+y)*7 + 29
    bm = MAN["bus"]
    bus = Image.open(f"{ASSET}/bus.png").convert("RGBA")
    bx = int((px - bm["ox"] - FL) * Z); by = int((py - bm["oy"] - FT) * Z)
    canvas.alpha_composite(bus, (bx, by))

out = "/tmp/room_render.png"
canvas.save(out)
print("saved", out, canvas.size, "items:", len(items))
