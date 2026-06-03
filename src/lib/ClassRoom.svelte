<script lang="ts">
  import { onMount } from 'svelte';
  import StudentInfo from './StudentInfo.svelte';
  import LiveClass from './LiveClass.svelte';
  import type { BubbleClass, BubbleUser, ClassMember } from './types';
  import { fullName, guessGender } from './types';
  import { classMembersFor, getUsers } from './bubble';
  import manifest from './roomManifest.json';
  import poolMeta from './assets/ts/students/_pool.json';
  import musicUrl from './assets/ts/music_class.mp3';   // thème de classe du jeu (boucle)

  // Décor : symboles vectoriels réels extraits de Teacher Story (_gfx.swf), exportés ×4.
  // Placement reproduit fidèlement depuis Manager.hx (salle "Histoire", skinSet 3).
  const ROOM = import.meta.glob('./assets/ts/room/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
  const png = (name: string) => ROOM[`./assets/ts/room/${name}.png`];
  type Geo = { w: number; h: number; ox: number; oy: number };
  const geo = manifest as Record<string, Geo>;

  // Élèves : sprites assemblés EN CALQUES (iso/Student.hx) pour pouvoir les animer.
  function indexed(g: Record<string, string>): string[] {
    return Object.entries(g)
      .map(([k, v]) => [parseInt(k.match(/(\d+)\.png$/)?.[1] ?? '0', 10), v] as [number, string])
      .sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }
  function frameMap(g: Record<string, string>, re: RegExp): Record<number, string> {
    const m: Record<number, string> = {};
    for (const [k, v] of Object.entries(g)) { const f = k.match(re); if (f) m[+f[1]] = v; }
    return m;
  }
  // NB: les options de import.meta.glob doivent être un littéral inline (Vite les lit statiquement).
  const BODY = indexed(import.meta.glob('./assets/ts/students/body*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>);
  const HEAD = indexed(import.meta.glob('./assets/ts/students/head*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>);
  const ARMS_FOLD = indexed(import.meta.glob('./assets/ts/students/armsfold*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>);
  const ARMS_UP = indexed(import.meta.glob('./assets/ts/students/armsup*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>);
  // écriture : 2 frames par élève (armswrite{n}_{f}.png)
  const ARMS_WRITE: string[][] = [];
  for (const [k, v] of Object.entries(import.meta.glob('./assets/ts/students/armswrite*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)) {
    const m = k.match(/armswrite(\d+)_(\d+)\.png$/);
    if (m) { const n = +m[1], f = +m[2]; (ARMS_WRITE[n] ||= [])[f] = v; }
  }
  const eyesG = import.meta.glob('./assets/ts/students/eyes*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
  const mouthG = import.meta.glob('./assets/ts/students/mouth_*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
  const EYES = frameMap(eyesG, /eyes(\d+)\.png$/);
  const MOUTH_M = frameMap(mouthG, /mouth_m(\d+)\.png$/);
  const MOUTH_F = frameMap(mouthG, /mouth_f(\d+)\.png$/);
  type Meta = { gender: 'm' | 'f'; mouthRest: number };
  const META = poolMeta.students as Meta[];
  const SG = poolMeta.geo as Geo;
  // Index du pool regroupés par genre du sprite → on peut choisir un sprite assorti au prénom.
  const MALE_IDX = META.map((m, i) => [m, i] as const).filter(([m]) => m.gender === 'm').map(([, i]) => i);
  const FEMALE_IDX = META.map((m, i) => [m, i] as const).filter(([m]) => m.gender === 'f').map(([, i]) => i);
  const eyesSrc = (f: number) => EYES[f] ?? EYES[0];
  const mouthSrc = (g: 'm' | 'f', f: number) => (g === 'm' ? MOUTH_M : MOUTH_F)[f] ?? (g === 'm' ? MOUTH_M : MOUTH_F)[0];

  let { klass, token, teacher, onBack }:
    { klass: BubbleClass; token: string; teacher: BubbleUser | null; onBack: () => void } = $props();

  let members = $state<ClassMember[]>([]);
  let students = $state(new Map<string, BubbleUser>());
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selected = $state<{ user: BubbleUser; sprites: string[] } | null>(null);
  let hoveredSid = $state<string | null>(null);
  let audioEl = $state<HTMLAudioElement | null>(null);
  let musicOn = $state(false);
  function toggleMusic() {
    musicOn = !musicOn;
    if (audioEl) { audioEl.volume = 0.4; musicOn ? audioEl.play() : audioEl.pause(); }
  }

  function hash(s: string){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return Math.abs(h);}

  onMount(async () => {
    try {
      const ms = await classMembersFor(token, klass.id);
      members = ms;
      const ids = ms.map((m) => m.studentId).filter(Boolean) as string[];
      students = await getUsers(token, ids);
    } catch (e: any) { error = String(e); } finally { loading = false; }
  });

  // ===== Projection isométrique EXACTE du jeu (Iso.hx) =====
  const S = 2.25;   // échelle d'affichage (25% plus petit qu'avant : 3 → 2.25)
  const RWID = 12, RHEI = 12;
  const EXIT = { x: 1, y: 9 }, DESK = { x: 5, y: 10 }, BOARD = { x: 6, y: 11 };
  const SEAT_X = [2, 4, 5, 7, 8, 10], SEAT_Y = [2, 4, 6];   // 18 places (Solver.hx:230)
  const SEATS: { x: number; y: number }[] = [];
  for (const y of SEAT_Y) for (const x of SEAT_X) SEATS.push({ x, y });
  const COLS = SEAT_X.length;

  const heightMap = (cx: number, cy: number) => (cx >= 3 && cx < 9 && cy >= 9 && cy < 12 ? 3 : 0);
  const sx = (ax: number, ay: number) => 185 + ax * 14 - ay * 14;
  const sy = (ax: number, ay: number) => 30 + ax * 7 + ay * 7;

  // Cadrage natif calé sur la caméra du jeu (le décor qui déborde est rogné par overflow:hidden)
  const FL = 16, FT = 26, FR = 354, FB = 206;
  const stageW = (FR - FL) * S, stageH = (FB - FT) * S;

  const DP_BG = 0, DP_ITEMS = 5;
  const zi = (z: number) => Math.round(z + 1e7);

  type Item = {
    src: string; left: number; top: number; w: number; h: number;
    flip: boolean; z: number; zi: number; pixel: boolean; kind: 'decor' | 'teacher';
    user?: BubbleUser | null; name?: string; sid?: string; sprites?: string[];
    blend?: boolean; opacity?: number;
  };
  type Slot = {
    sid: string; seat: number; left: number; top: number; w: number; h: number; zi: number; ziArms: number;
    body: string; head: string; armsFold: string; armsUp: string; armsWrite: string[];
    gender: 'm' | 'f'; mouthRest: number; user: BubbleUser | null; name: string; sprites: string[];
  };

  let _i = 0;
  function placeSym(items: Item[], name: string, cx: number, cy: number, opts: {
    mode?: 'A' | 'B'; dx?: number; dy?: number; mcx?: number; mcy?: number;
    xr?: number; yr?: number; zprio?: number; bucket?: number; flip?: boolean; useHeight?: boolean;
    sid?: string; blend?: boolean; opacity?: number;
  } = {}) {
    const g = geo[name]; if (!g) return;
    const { mode = 'A', dx = 0, dy = 0, mcx = 0, mcy = 0, xr = 0.5, yr = 0.5,
      zprio = 0, bucket = DP_ITEMS, flip = false, useHeight = true, sid, blend = false, opacity = 1 } = opts;
    const ax = cx - 0.5 + xr, ay = cy - 0.5 + yr;
    let px = sx(ax, ay), py = sy(ax, ay);
    if (useHeight) py -= heightMap(cx, cy);
    const ox = mode === 'A' ? mcx : mcx + dx;
    const oy = mode === 'A' ? mcy : mcy + 29 + dy;
    const z = bucket * 1e7 + zprio * 10000 + (_i++) + 1000 * Math.floor(100 + ax * 7 + ay * 7);
    items.push({
      src: png(name), w: g.w * S, h: g.h * S,
      left: ((px + ox) - g.ox - FL) * S, top: ((py + oy) - g.oy - FT) * S,
      flip, z, zi: zi(z), pixel: false, kind: 'decor', sid, blend, opacity,
    });
  }

  function placeStudent(slots: Slot[], sid: string, idx: number, seat: number,
    cx: number, cy: number, user: BubbleUser | null, name: string, jx = 0, jy = 0) {
    const g = SG, xr = 0.5, yr = 0.95, yOffset = -3;
    const ax = cx - 0.5 + xr, ay = cy - 0.5 + yr;
    const px = sx(ax, ay) + jx, py = sy(ax, ay) + yOffset - heightMap(cx, cy) + jy;
    const left = (px - g.ox - FL) * S, top = (py - g.oy - FT) * S, w = g.w * S, h = g.h * S;
    const base = 100 + ax * 7 + ay * 7;
    const zBody = DP_ITEMS * 1e7 + (_i++) + 1000 * Math.floor(base);
    const zArms = DP_ITEMS * 1e7 + (_i++) + 1000 * (5 + Math.floor(base));  // overArms layer=1
    const m = META[idx];
    const sprites = [BODY[idx], HEAD[idx], eyesSrc(0), mouthSrc(m.gender, m.mouthRest), ARMS_FOLD[idx]];
    slots.push({ sid, seat, left, top, w, h, zi: zi(zBody), ziArms: zi(zArms),
      body: BODY[idx], head: HEAD[idx], armsFold: ARMS_FOLD[idx], armsUp: ARMS_UP[idx], armsWrite: ARMS_WRITE[idx] ?? [ARMS_FOLD[idx]],
      gender: m.gender, mouthRest: m.mouthRest, user, name, sprites });
  }

  type TeacherSlot = { left: number; top: number; w: number; h: number; zi: number; user: BubbleUser | null; name: string };
  function teacherSlotOf(user: BubbleUser | null, name: string): TeacherSlot | null {
    const g = geo['james']; if (!g) return null;
    const cx = BOARD.x, cy = BOARD.y, xr = 0.5, yr = 0.9, mcy = 22;
    const ax = cx - 0.5 + xr, ay = cy - 0.5 + yr;
    const px = sx(ax, ay), py = sy(ax, ay) - heightMap(cx, cy) + mcy;
    const z = DP_ITEMS * 1e7 + (_i++) + 1000 * Math.floor(100 + ax * 7 + ay * 7);
    return { left: (px - g.ox - FL) * S, top: (py - g.oy - FT) * S, w: g.w * S, h: g.h * S, zi: zi(z), user, name };
  }

  // Skin de salle déterministe par classe (Science=1 / Math=2 / Histoire=3, comme
  // les skinSets de Teacher Story). Les surfaces (sol/murs/rue/estrade…) en dépendent.
  const skinSet = ((hash(klass.id) % 3) + 1);
  const sk = (n: string) => `${n}_s${skinSet}`;   // ex: 'ground' → 'ground_s2'

  const mursoloVariant = (y: number) => {
    const v =
      y === 0 ? 'coin' :
      y === EXIT.y ? 'porte' :
      y === EXIT.y - 1 ? 'interrupteur' :
      (y === 3 || y === 5) ? 'fenetre' :
      (y === 1 || y === 7) ? 'abime' : 'normal';
    return `mursolo_${v}_s${skinSet}`;
  };

  const studentOf = (m: ClassMember) => m.studentId ? students.get(m.studentId) ?? null : null;
  // Choix du sprite : si on devine le genre du prénom, on pioche dans le sous-pool
  // correspondant (sinon pool complet). Déterministe par id → stable.
  const poolIndex = (m: ClassMember) => {
    const g = guessGender(studentOf(m)?.firstName);
    const pool = g === 'm' ? MALE_IDX : g === 'f' ? FEMALE_IDX : null;
    return pool && pool.length ? pool[hash(m.id) % pool.length] : hash(m.id) % BODY.length;
  };
  // Léger décalage déterministe par bureau → rangées "pas parfaites" (un peu de vie).
  const jitter = (sid: string) => { const h = hash(sid + 'jit'); return { jx: (h % 5) - 2, jy: ((h >> 3) % 3) - 1 }; };

  const scene = $derived.by(() => {
    _i = 0;
    const items: Item[] = [];
    const slots: Slot[] = [];
    placeSym(items, 'solcouloir', 0, RHEI - 5, { zprio: -99, bucket: DP_BG });
    placeSym(items, sk('murcouloir'), 0, 0, { bucket: DP_BG });
    placeSym(items, sk('secretariat'), RWID - 1, -1, { mode: 'B', zprio: -98, bucket: DP_BG });
    // "Mur tableau" (lib.Mur2) : le jeu lui applique enableHole() → mur avant
    // semi-transparent pour voir le prof qui se tient devant le tableau.
    placeSym(items, 'mur2', 0, RHEI, { zprio: 8, opacity: 0.4 });
    placeSym(items, sk('ground2'), 0, RHEI, { zprio: 8 });
    placeSym(items, sk('ground'), 0, 0, { bucket: DP_BG });
    placeSym(items, sk('estrade'), 3, RHEI - 1, { mode: 'B', dx: -14, dy: -4, bucket: DP_BG, useHeight: false });
    // rayons de soleil (lib.Sun frame 3 = faisceau délimité par la fenêtre) — placement et fondu
    // EXACTS du jeu : Iso(RWID-1, y), addFurnMc(-4,2), blendMode OVERLAY, alpha 0.85.
    // Volets ouverts/fermés tirés au sort PAR CLASSE (le jeu : rseed.random(2) par fenêtre)
    // → chaque classe a son ambiance lumineuse propre.
    [3.7, 5.2, 7.2, 8.7].forEach((yy, wi) => {
      if (hash(klass.id + 'win' + wi) % 2 !== 0) return;   // volet fermé → pas de rayon
      const cy = Math.floor(yy), yr = yy - cy;
      placeSym(items, 'sun', RWID - 1, cy, { mode: 'B', dx: -4, dy: 2, yr, zprio: -10, blend: true, opacity: 0.85 });
    });
    placeSym(items, 'bureauprof', DESK.x, DESK.y - 1, { mode: 'B', dx: -12, dy: -6 });
    placeSym(items, 'corbeille', DESK.x + 1, DESK.y - 1, { mode: 'B', dy: 1, zprio: -0.5 });
    placeSym(items, 'porte', EXIT.x, EXIT.y, { mcx: -16, mcy: 17, zprio: -1 });
    for (let y = 0; y <= RHEI; y++)
      placeSym(items, mursoloVariant(y), 0, y, { mode: 'B', mcx: 2, mcy: -3, zprio: -1 });
    placeSym(items, sk('wall'), RWID + 1, RHEI + 1, {});
    placeSym(items, sk('street'), RWID + 1, 12, { zprio: 1 });
    placeSym(items, sk('abri'), RWID + 1, 12, { mcx: 300, mcy: -150, zprio: 1 });
    if (skinSet === 3) placeSym(items, 'bonaparte', 0, 3, { mcy: 24, xr: 1.2 });  // buste (déco Histoire)
    placeSym(items, 'coffre', 0, 4, { mode: 'B' });
    placeSym(items, 'armoire2', 0, 6, { mode: 'B' });
    placeSym(items, 'bureauordi', 1, 11, { mode: 'B', dy: -10, flip: true });
    placeSym(items, 'worldmap', 4, 0, { mode: 'B', dy: -24 });
    placeSym(items, 'coucou', 3, 0, { mode: 'B', dy: -6 });
    placeSym(items, 'armoire', 11, 0, { mode: 'B', flip: true });
    placeSym(items, 'tableglobe', 10, 10, { mode: 'B', dy: -8 });
    placeSym(items, 'dessins', 9, 0, { mode: 'B', dy: 2 });
    members.slice(0, SEATS.length).forEach((m, n) => {
      const { x, y } = SEATS[n];
      const { jx, jy } = jitter(m.id);
      const idx = poolIndex(m);
      placeSym(items, 'tableeleve', x, y + 1, { mode: 'B', dx: -6 + jx, dy: -8 + jy });
      placeSym(items, 'chaiseeleve', x, y, { mode: 'B', dx: -10 + jx, dy: -5 + jy });
      const u = studentOf(m);
      placeStudent(slots, m.id, idx, n, x, y, u, u ? fullName(u) : '?', jx, jy);
      // Affaires sur le bureau (lib.Student.stuff) — genre assorti au sprite, COULEUR
      // aléatoire par élève (le jeu fait gotoAndStop(random(totalFrames))).
      const male = META[idx].gender === 'm';
      const tCount = male ? 4 : 3, cCount = male ? 5 : 4;
      const tColor = hash(m.id + 'tr') % tCount;
      const cColor = hash(m.id + 'ca') % cCount;
      // cartable (sac) posé un peu en retrait, puis trousse devant
      placeSym(items, `${male ? 'cartableg' : 'cartablef'}_${cColor}`, x, y + 1,
               { mode: 'B', dx: -10 + jx, dy: -9 + jy, zprio: 1.5, opacity: 0.96 });
      placeSym(items, `${male ? 'trousseg' : 'troussef'}_${tColor}`, x, y + 1,
               { mode: 'B', dx: 1 + jx, dy: -14 + jy, zprio: 2 });
    });
    const teacherSlot = teacherSlotOf(teacher, teacher ? fullName(teacher) : '');
    items.sort((a, b) => a.z - b.z);
    return { items, slots, teacherSlot };
  });

  // ===== Moteur d'animations (Student.hx) =====
  // lookAt (tête) + clignement + expressions + bavardages (Speak) + main levée (handUp).
  const EXPR = [
    { eyes: 1, mouth: 0, dur: 8 },    // bâillement
    { eyes: 0, mouth: 2, dur: 14 },   // sourire
    { eyes: 10, mouth: 1, dur: 12 },  // content
    { eyes: 0, mouth: 4, dur: 12 },   // grand sourire
    { eyes: 10, mouth: 0, dur: 9 },   // surprise
    { eyes: 7, mouth: 19, dur: 18 },  // ennui
    { eyes: 1, mouth: 0, dur: 16 },   // fatigué
    { eyes: 10, mouth: 7, dur: 9 },   // tire la langue
    { eyes: 1, mouth: 0, dur: 3 },    // éternuement (SA_Sneeze : yeux fermés + bouche, bref)
  ];
  const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

  // Cadences calées sur le jeu (30 fps, tick=100ms ⇒ ~3 frames/tick) :
  //  - look+blink ambiant : toutes les 1–3,3 s (irnd(30,100) frames du jeu) → 10–33 ticks.
  //  - expressions/bavardage/main levée : PAS ambiants dans le jeu (events de gameplay),
  //    donc rares ici : un "event" toutes les 40–100 s par élève.
  const LOOK_MIN = 20, LOOK_MAX = 55;        // clignement ambiant toutes les ~2–5,5 s
  const TURN_CHANCE = 0.3;                    // … dont ~30% tournent vraiment la tête (le reste = centré)
  const EVENT_MIN = 400, EVENT_MAX = 1000;
  type AnimSt = { dir: -1 | 0 | 1; eyes: number; mouth: number; arms: 'fold' | 'up' | 'write'; wf: number; down: boolean };
  let anim = $state<AnimSt[]>([]);
  let ctr: { wait: number; blink: number; expr: number; chat: number; hand: number; talk: number; event: number; write: number; wt: number }[] = [];
  let seatRest: number[] = [];      // bouche de repos par élève (frame 10-20, comme le jeu)

  // Fidèle au jeu (Student.hx:431) : tous les élèves ont les yeux frame 0 au repos.
  // La variété des visages vient de la TÊTE (4) + cheveux + COULEUR DE BOUCHE (frame 10-20),
  // pas d'yeux différents (setEyesColor est un no-op commenté dans le jeu).
  $effect(() => {
    const n = Math.min(members.length, SEATS.length);
    if (anim.length === n) return;
    const a: AnimSt[] = []; ctr = []; seatRest = [];
    for (let i = 0; i < n; i++) {
      const meta = META[poolIndex(members[i])];
      a.push({ dir: 0, eyes: 0, mouth: meta.mouthRest, arms: 'fold', wf: 0, down: false });
      ctr.push({ wait: rnd(LOOK_MIN, LOOK_MAX), blink: 0, expr: 0, chat: 0, hand: 0, talk: 0,
        event: rnd(100, EVENT_MAX), write: 0, wt: 0 });   // décalage initial pour désynchroniser
      seatRest.push(meta.mouthRest);
    }
    anim = a;
  });

  // bavardage : deux voisins de rang qui se tournent l'un vers l'autre et "parlent"
  function tryChat(i: number, s: AnimSt, a: AnimSt[], n: number): boolean {
    const col = i % COLS;
    const cands: number[] = [];
    if (col > 0) cands.push(i - 1);
    if (col < COLS - 1 && i + 1 < n) cands.push(i + 1);
    const free = cands.filter((j) => ctr[j].chat === 0 && ctr[j].hand === 0 && ctr[j].expr === 0);
    if (!free.length) return false;
    const j = free[rnd(0, free.length - 1)];
    const dur = rnd(20, 45);
    ctr[i].chat = dur; ctr[j].chat = dur;
    ctr[i].talk = rnd(1, 3); ctr[j].talk = rnd(1, 3);
    s.dir = j > i ? 1 : -1; s.eyes = 0; s.hand = false;       // regarde vers le voisin
    a[j] = { ...a[j], dir: j > i ? -1 : 1, eyes: 0, hand: false };
    return true;
  }

  function tick() {
    const n = anim.length; if (!n) return;
    const a = anim.slice();
    for (let i = 0; i < n; i++) {
      const c = ctr[i]; const s = { ...a[i] };
      // états temporisés en cours
      if (c.blink > 0) { c.blink--; if (c.blink === 0 && c.expr === 0 && c.chat === 0) s.eyes = 0; }
      if (c.expr > 0) { c.expr--; if (c.expr === 0) { s.eyes = 0; s.mouth = seatRest[i]; } }
      if (c.hand > 0) { c.hand--; if (c.hand === 0) s.arms = 'fold'; }
      if (c.write > 0) {                            // écriture : main qui bouge + tête baissée
        c.write--;
        if (--c.wt <= 0) { s.wf = s.wf ? 0 : 1; c.wt = rnd(3, 6); }
        if (c.write === 0) { s.arms = 'fold'; s.down = false; }
      }
      if (c.chat > 0) {
        c.chat--;
        if (--c.talk <= 0) { s.mouth = s.mouth === seatRest[i] ? 0 : seatRest[i]; c.talk = rnd(2, 4); }
        if (c.chat === 0) { s.mouth = seatRest[i]; s.dir = 0; }
      }
      const idle = c.expr === 0 && c.chat === 0 && c.hand === 0 && c.write === 0;
      // events RARES (expression/éternuement / bavardage / écriture / main levée) — pas ambiants dans le jeu
      if (idle && --c.event <= 0) {
        const r = Math.random();
        if (r < 0.34) { const e = EXPR[rnd(0, EXPR.length - 1)]; c.expr = e.dur; s.eyes = e.eyes; s.mouth = e.mouth; }
        else if (r < 0.56) { tryChat(i, s, a, n); }
        else if (r < 0.80) { c.write = rnd(30, 70); c.wt = rnd(3, 6); s.arms = 'write'; s.down = true; s.dir = 0; s.eyes = 0; s.mouth = seatRest[i]; s.wf = 0; }
        else { c.hand = rnd(15, 32); s.arms = 'up'; s.dir = 0; s.eyes = 0; s.mouth = seatRest[i]; }
        c.event = rnd(EVENT_MIN, EVENT_MAX);
      }
      // clignement ambiant (fréquent) + virage de tête OCCASIONNEL — uniquement au repos.
      else if (idle && --c.wait <= 0) {
        if (Math.random() < TURN_CHANCE) { const r = Math.random(); s.dir = (r < 0.5 ? -1 : 1) as -1 | 0 | 1; }
        else { s.dir = 0; }
        if (s.eyes === 0) { c.blink = 2; s.eyes = 1; }
        c.wait = rnd(LOOK_MIN, LOOK_MAX);
      }
      a[i] = s;
    }
    anim = a;
  }
  $effect(() => {
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  });

  // lookAt : flip de la tête autour du centre du VISAGE (≈39.6% de la largeur du canevas 24px),
  // pas du centre du canevas — sinon la tête se décale trop.
  const FACE_ORIGIN = ((1 + 8.5) / 24 * 100).toFixed(1) + '%';
  // tête : flip droite (autour du visage), petit décalage gauche, et inclinaison vers le bas (écriture)
  function headTransform(a: AnimSt | undefined): string {
    if (!a) return 'none';
    const p: string[] = [];
    if (a.down) p.push(`translate(${-0.5 * S}px, ${1 * S}px)`);   // lookAt(0,1) : tête baissée
    if (a.dir === 1) p.push('scaleX(-1)');
    else if (a.dir === -1) p.push(`translateX(${-1 * S}px)`);
    return p.length ? p.join(' ') : 'none';
  }
  const armsSrc = (st: Slot, a: AnimSt | undefined) =>
    a?.arms === 'up' ? st.armsUp :
    a?.arms === 'write' ? (st.armsWrite[a.wf] ?? st.armsWrite[0]) :
    st.armsFold;

  // ===== Prof : pose unique, face aux élèves (il enseigne) =====
  // En iso, les élèves sont en HAUT-DROITE du prof → face aux élèves = james_back retourné.
  // (On retire l'ancien va-et-vient automatique tableau↔classe : les 2 sprites ont des
  //  silhouettes de cheveux différentes, ce qui faisait "clignoter" une ligne au changement.)
  const teacherSrc = png('james_back');     // dans la salle : de dos, face à la classe
  const teacherFace = png('james');         // pour la fiche latérale (on voit son visage)

  // ===== Bus : passe dans la rue de temps en temps (lib.Bus, trajet x=RWID+3, y -10→25) =====
  const busGeo = geo['bus'];
  const BUS_ZI = zi(DP_ITEMS * 1e7 + 20 * 10000 + 1000 * Math.floor(100 + (RWID + 3) * 7 + 8 * 7));
  let busP = $state(-1);   // -1 = inactif (caché) ; 0..1 = progression du passage
  function busPos(p: number) {
    const y = -10 + p * 35, cx = RWID + 3;
    const px = sx(cx, y), py = sy(cx, y) + 29;   // mc.y += 29 (Bus.hx)
    return { left: (px - busGeo.ox - FL) * S, top: (py - busGeo.oy - FT) * S, w: busGeo.w * S, h: busGeo.h * S };
  }
  $effect(() => {
    let raf = 0, to: ReturnType<typeof setTimeout>;
    const schedule = () => { to = setTimeout(start, rnd(30, 90) * 1000); };
    const start = () => {
      const dur = 7000, t0 = performance.now();
      const step = (now: number) => {
        const p = (now - t0) / dur;
        if (p >= 1) { busP = -1; schedule(); return; }
        busP = p; raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    schedule();
    return () => { clearTimeout(to); cancelAnimationFrame(raf); };
  });
</script>

<div class="room">
  <header class="bar">
    <button class="back" onclick={onBack}>← Retour</button>
    <h2>{klass.name ?? 'Classe'}</h2>
    <span class="count">{members.length} élèves</span>
    {#if members.length > SEATS.length}<span class="warn">{members.length - SEATS.length} hors écran</span>{/if}
    <button class="music" class:on={musicOn} onclick={toggleMusic} title="Musique d'ambiance (thème de classe)">{musicOn ? '🔊' : '🔈'}</button>
  </header>
  <audio bind:this={audioEl} src={musicUrl} loop preload="none"></audio>

  <LiveClass {token} classId={klass.id} teacherFallback={teacher} />

  <div class="viewport">
    {#if loading}
      <div class="hint">Chargement de la classe…</div>
    {:else if error}
      <div class="hint err">⚠️ {error}</div>
    {:else}
      <div class="stage" style="width:{stageW}px;height:{stageH}px">
        {#each scene.items as o (o.z)}
          {#if o.kind === 'decor'}
            <img class="sym" class:pixel={o.pixel} class:flip={o.flip} class:hl={!!o.sid && o.sid === hoveredSid} src={o.src} alt=""
                 style="left:{o.left}px;top:{o.top}px;width:{o.w}px;height:{o.h}px;z-index:{o.zi}{o.opacity < 1 ? `;opacity:${o.opacity}` : ''}{o.blend ? ';mix-blend-mode:overlay' : ''}" />
          {:else}
            <button class="actor" class:flip={o.flip} class:hl={!!o.sid && o.sid === hoveredSid}
                    style="left:{o.left}px;top:{o.top}px;width:{o.w}px;height:{o.h}px;z-index:{o.zi}"
                    onclick={() => o.user && (selected = { user: o.user, sprites: o.sprites ?? [o.src] })}
                    onmouseenter={() => (hoveredSid = o.sid ?? null)} onmouseleave={() => (hoveredSid = null)}
                    disabled={!o.user} title={o.name}>
              <img src={o.src} alt="" style="width:{o.w}px;height:{o.h}px" />
            </button>
          {/if}
        {/each}
        {#each scene.slots as st (st.sid)}
          {@const a = anim[st.seat]}
          <button class="actor student" class:hl={st.sid === hoveredSid}
                  style="left:{st.left}px;top:{st.top}px;width:{st.w}px;height:{st.h}px;z-index:{st.zi}"
                  onclick={() => st.user && (selected = { user: st.user, sprites: st.sprites })}
                  onmouseenter={() => (hoveredSid = st.sid)} onmouseleave={() => (hoveredSid = null)}
                  disabled={!st.user} title={st.name}>
            <img class="layer" src={st.body} alt="" />
            <span class="head" style="transform-origin:{FACE_ORIGIN} 50%;transform:{headTransform(a)}">
              <img class="layer" src={st.head} alt="" />
              <img class="layer" src={eyesSrc(a?.eyes ?? 0)} alt="" />
              <img class="layer" src={mouthSrc(st.gender, a?.mouth ?? st.mouthRest)} alt="" />
            </span>
          </button>
          <img class="sym pixel" class:hl={st.sid === hoveredSid} src={armsSrc(st, a)} alt=""
               style="left:{st.left}px;top:{st.top}px;width:{st.w}px;height:{st.h}px;z-index:{st.ziArms}" />
        {/each}
        {#if scene.teacherSlot}
          {@const t = scene.teacherSlot}
          <button class="actor" class:hl={hoveredSid === '__teacher'}
                  style="left:{t.left}px;top:{t.top}px;width:{t.w}px;height:{t.h}px;z-index:{t.zi}"
                  onclick={() => t.user && (selected = { user: t.user, sprites: [teacherFace] })}
                  onmouseenter={() => (hoveredSid = '__teacher')} onmouseleave={() => (hoveredSid = null)}
                  disabled={!t.user} title={t.name}>
            <img class="flip" src={teacherSrc} alt="" style="width:{t.w}px;height:{t.h}px" />
          </button>
        {/if}
        {#if busP >= 0}
          {@const b = busPos(busP)}
          <img class="sym" src={png('bus')} alt="" style="left:{b.left}px;top:{b.top}px;width:{b.w}px;height:{b.h}px;z-index:{BUS_ZI}" />
        {/if}
        <div class="vignette"></div>
      </div>
    {/if}
  </div>

  <StudentInfo user={selected?.user ?? null} sprites={selected?.sprites ?? []} {token}
               onClose={() => (selected = null)}
               onUpdate={(u) => { students.set(u.id, u); students = new Map(students); if (selected) selected = { ...selected, user: u }; }} />
  <div class="credit">Sprites : Teacher Story © Motion Twin (CC BY-NC-SA)</div>
</div>

<style>
  .room { min-height: 100vh; background: #2b2f3a; }
  .bar { display:flex; align-items:center; gap:16px; padding:12px 20px; background:#5e4632; color:#f7e7c8; border-bottom:4px solid #3d2c1e; position:sticky; top:0; z-index:1000; }
  .bar h2 { margin:0; font:700 15px system-ui; flex:1; }
  .back { background:#f7e7c8; color:#3d2c1e; border:0; padding:6px 12px; border-radius:4px; cursor:pointer; font:700 12px system-ui; box-shadow:0 2px 0 #3d2c1e; }
  .back:hover { background:#fff8ec; }
  .count { background:#f7e7c8; color:#3d2c1e; padding:3px 10px; border-radius:999px; font:700 11px system-ui; }
  .music { background:#f7e7c8; color:#3d2c1e; border:0; width:30px; height:30px; border-radius:6px; cursor:pointer; font-size:14px; box-shadow:0 2px 0 #3d2c1e; }
  .music:hover { background:#fff8ec; }
  .music.on { background:#f5cf6a; }
  .warn { background:#c97b2c; color:#fff8ec; padding:3px 10px; border-radius:999px; font:700 11px system-ui; }

  .viewport { display:flex; justify-content:center; padding:24px 20px 60px; overflow:auto; isolation:isolate; }
  .stage { position:relative; flex:none; overflow:hidden; background:#1d2129; box-shadow:0 8px 30px rgba(0,0,0,0.4); }

  .sym { position:absolute; display:block; pointer-events:none; }
  .actor { position:absolute; background:none; border:0; padding:0; cursor:pointer; line-height:0; }
  .actor img { display:block; image-rendering:pixelated; pointer-events:none; }
  .actor:disabled { cursor:default; }
  .student .layer { position:absolute; inset:0; width:100%; height:100%; image-rendering:pixelated; }
  .student .head { position:absolute; inset:0; }
  .pixel { image-rendering:pixelated; }
  .flip { transform:scaleX(-1); }
  .sym.hl, .actor.hl { filter: drop-shadow(0 0 1px #ffe27a) drop-shadow(0 0 2px #ffd24a) brightness(1.08); }

  /* lumière d'ambiance : léger vignettage chaud pour donner de la profondeur à la salle */
  .vignette { position:absolute; inset:0; pointer-events:none; z-index:99999999;
    background: radial-gradient(ellipse 75% 70% at 50% 42%, rgba(255,236,180,0.05) 0%, transparent 45%, rgba(20,15,32,0.42) 100%); }

  .hint { padding:60px; text-align:center; color:#e7d8b4; font:700 14px system-ui; }
  .hint.err { color:#ff9b9b; }
  .credit { position:fixed; bottom:6px; right:10px; font:500 10px system-ui; color:rgba(255,255,255,.45); pointer-events:none; z-index:2000; }
</style>
