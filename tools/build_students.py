#!/usr/bin/env python3
"""Bake an ANIMATABLE pool of seated students from Teacher Story's characters.png,
mirroring iso/Student.hx initSkin() + sit(). Layers are split so the head can turn
(lookAt) and the eyes/mouth can swap frames (blink + expressions).

Per student (colorized, in 24x27 canvas at PL=1,PT=1):
  body{n}.png  = legs + torso + trousers + shirt          (static, behind desk)
  head{n}.png  = head-skin (face) + hairs                 (flips/shifts on lookAt)
  arms{n}.png  = arms_short frame 8 (folded)              (overlay, in front of desk)
Shared (NOT recolored in the game → reused by all students), same 24x27 canvas:
  eyes{f}.png       for f in NEEDED_EYES
  mouth_m{f}.png / mouth_f{f}.png  for f in NEEDED_MOUTH
Anchor (skin local 0,0 = part top-center): ox = PL+8.5 = 9.5, oy = PT = 1.

Atlas slices (Manager.hx SpriteLib): torso(0,0,17,25) legs(17,0) head[v](34+v*17,0,17,25)
  arms_short f:(f*17,64,17,25) hair_m f:(f*23,128,23,17) hair_f f:(f*23,160,23,17)
  eyes f:(f*17,192,17,25) mouth_m f:(f*17,224,17,25) mouth_f f:(f*17,256,17,25)
  shirt_m f:(f*17,288) shirt_f f:(f*17,320) trousers_m f:(f*17,352) trousers_f f:(f*17,384)
"""
import colorsys, json, glob, os
from PIL import Image

A = Image.open("/Users/arthur/talia-pedago/TeacherStory/client/gfx/characters.png").convert("RGBA")
OUT = "/Users/arthur/talia-pedago/src/lib/assets/ts/students"
W, H, PL, PT = 24, 27, 1, 1

HAIR = [0xC25323,0xB45E38,0xC9714B,0x683520,0x623C3C,0x2D3C57,0x582121,0xEACC26,0x422311,0x35152E,0xFFE75E]
TROUSERS = [0x6A72A6,0x725649,0x2E3943,0x528FA7,0x693D3D,0xA3AFC7,0x445F41]
SHIRT_M = [0x377BB3,0xAE723C,0x1B2230,0x800000,0x462F51,0xDAE3EB,0xF9E2CC,0xD0D3F4,0xE2221D,0xF4860B,0xB59515,0x2262A8,0x5E3298]
SHIRT_F = [0x8EEB12,0xDF79DF,0xEA5381,0x48D7F4,0xFFAD3E,0xA589F8,0xA80606,0x129C3F,0xF0A6F9,0x1D1B2E]
# skin targets: brighter + less saturated than the wood floor (≈hsv(22°,0.83,0.44))
SKIN_TARGETS = [0xFBD7B5, 0xF0BE97, 0xD99A6E, 0xBE7B52, 0x9C6242]

# frames needed by the chosen animations (blink + expressions), from Student.hx setAnim()
NEEDED_EYES = [0, 1, 2, 7, 10]                       # 0 rest, 1 closed, 2 mid-blink, 7 bored, 10 wide
NEEDED_MOUTH = sorted(set([0,1,2,4,7,19] + list(range(10,22))))  # expr frames + resting range
# Bouche de REPOS : le jeu tire dans 10..20/21, mais certaines de ces frames sont des bouches
# OUVERTES (m11/m13/m19/m20, f15/f16) qui, figées (rendu quasi statique), donnent une tête de
# « surpris ». On ne garde que les bouches CALMES/fermées → cohérent avec l'ambiance « blasé ».
CALM_M = [10, 12, 14, 15, 16, 17, 18]
CALM_F = [10, 11, 12, 13, 14, 17, 18, 20]

def cell(x,y,w,h): return A.crop((x,y,x+w,y+h))
def hsv(c): return colorsys.rgb_to_hsv(((c>>16)&255)/255,((c>>8)&255)/255,(c&255)/255)

def colorize_grays(img, color, mid=0.5):
    th,ts,tv = hsv(color); px=img.load()
    out=Image.new("RGBA",img.size,(0,0,0,0)); op=out.load()
    for y in range(img.height):
        for x in range(img.width):
            r,g,b,a=px[x,y]
            if a==0: continue
            gray=(0.299*r+0.587*g+0.114*b)/255
            v=min(1.0, tv*(gray/mid))
            s=min(1.0, ts*(0.85+0.25*(1-gray)))
            rr,gg,bb=colorsys.hsv_to_rgb(th,s,v)
            op[x,y]=(int(rr*255),int(gg*255),int(bb*255),a)
    return out

def canvased(c, dy=0):  # place a raw 17x25 (or 23x17 hair) cell on the shared 24x27 canvas
    im=Image.new("RGBA",(W,H),(0,0,0,0)); im.alpha_composite(c,(PL,PT+dy)); return im

class R:
    def __init__(s,seed): s.s=seed&0xffffffff
    def i(s,n):
        s.s=(1103515245*s.s+12345)&0x7fffffff
        return s.s % n
    def rng(s,a,b): return a + s.i(b-a+1)

for f in glob.glob(OUT+"/*.png"): os.remove(f)
os.makedirs(OUT, exist_ok=True)

# --- shared eyes/mouth frames (raw atlas, not recolored) ---
for f in NEEDED_EYES:
    canvased(cell(f*17,192,17,25)).save(f"{OUT}/eyes{f}.png")
for f in NEEDED_MOUTH:
    canvased(cell(f*17,224,17,25)).save(f"{OUT}/mouth_m{f}.png")
    canvased(cell(f*17,256,17,25)).save(f"{OUT}/mouth_f{f}.png")

# --- per-student layers ---
N=40
geo={"w":W,"h":H,"ox":PL+8.5,"oy":PT}
studs=[]
for n in range(N):
    rr=R(1000+n*7)
    male = rr.i(100) < 52
    suf_shirt = SHIRT_M if male else SHIRT_F
    hairY = 128 if male else 160
    shirtY = 288 if male else 320
    trouY = 352 if male else 384
    headv = rr.i(4)
    hairf = rr.rng(0,13)
    hcol = HAIR[rr.i(len(HAIR))]
    scol = suf_shirt[rr.i(len(suf_shirt))]
    tcol = TROUSERS[rr.i(len(TROUSERS))]
    skin = SKIN_TARGETS[rr.i(len(SKIN_TARGETS))]
    calm = CALM_M if male else CALM_F
    mouthRest = calm[rr.i(len(calm))]   # 1 tirage (comme rng) → corps/têtes inchangés

    body=Image.new("RGBA",(W,H),(0,0,0,0))
    body.alpha_composite(colorize_grays(cell(17,0,17,25),skin,0.65),(PL,PT))    # legs
    body.alpha_composite(colorize_grays(cell(0,0,17,25),skin,0.65),(PL,PT))     # torso
    body.alpha_composite(colorize_grays(cell(0,trouY,17,25),tcol),(PL,PT))      # trousers
    body.alpha_composite(colorize_grays(cell(0,shirtY,17,25),scol),(PL,PT))     # shirt
    body.save(f"{OUT}/body{n}.png")

    head=Image.new("RGBA",(W,H),(0,0,0,0))
    head.alpha_composite(colorize_grays(cell(34+headv*17,0,17,25),skin,0.65),(PL,PT))  # face skin
    head.alpha_composite(colorize_grays(cell(hairf*23,hairY,23,17),hcol),(PL,PT-1))    # hair (aligned)
    head.save(f"{OUT}/head{n}.png")

    arms=Image.new("RGBA",(W,H),(0,0,0,0))
    arms.alpha_composite(colorize_grays(cell(8*17,64,17,25),skin,0.65),(PL,PT))        # frame 8 (bras croisés)
    arms.save(f"{OUT}/armsfold{n}.png")

    arms11=Image.new("RGBA",(W,H),(0,0,0,0))
    arms11.alpha_composite(colorize_grays(cell(11*17,64,17,25),skin,0.65),(PL,PT))     # frame 11 (main levée)
    arms11.save(f"{OUT}/armsup{n}.png")

    # écriture : 2 frames (14 & 16) de l'anim "write" — mains sur la table avec le crayon
    for wi, wf in enumerate([14, 16]):
        aw=Image.new("RGBA",(W,H),(0,0,0,0))
        aw.alpha_composite(colorize_grays(cell(wf*17,64,17,25),skin,0.65),(PL,PT))
        aw.save(f"{OUT}/armswrite{n}_{wi}.png")

    studs.append({"gender":"m" if male else "f", "mouthRest":mouthRest})

json.dump({"geo":geo,"count":N,"students":studs,"eyes":NEEDED_EYES,"mouth":NEEDED_MOUTH},
          open(OUT+"/_pool.json","w"))
print(f"baked {N} layered students + shared faces -> {OUT}")
print(f"  eyes frames {NEEDED_EYES}  mouth frames {NEEDED_MOUTH}")
