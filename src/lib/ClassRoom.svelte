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
  // Bras par humeur (Student.hx updatePose) : 8 mains posées / 9 avachi / 10 mains jointes.
  const ARMS_FOLD = indexed(import.meta.glob('./assets/ts/students/armsfold*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>);
  const ARMS_BORED = indexed(import.meta.glob('./assets/ts/students/armsbored*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>);
  const ARMS_ENGAGED = indexed(import.meta.glob('./assets/ts/students/armsengaged*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>);
  const eyesG = import.meta.glob('./assets/ts/students/eyes*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
  const mouthG = import.meta.glob('./assets/ts/students/mouth_*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
  const EYES = frameMap(eyesG, /eyes(\d+)\.png$/);
  const MOUTH_M = frameMap(mouthG, /mouth_m(\d+)\.png$/);
  const MOUTH_F = frameMap(mouthG, /mouth_f(\d+)\.png$/);
  type Mood = 'engaged' | 'neutral' | 'bored';
  type ArmPose = 'fold' | 'bored' | 'engaged';
  type Meta = { gender: 'm' | 'f'; mouthRest: number; mood: Mood };
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
  let musicTried = false;
  function setMusic(on: boolean) {
    if (!audioEl) return;
    audioEl.volume = 0.35;
    if (on) audioEl.play().then(() => { musicOn = true; }).catch(() => { musicOn = false; });
    else { audioEl.pause(); musicOn = false; }
  }
  const toggleMusic = () => setMusic(!musicOn);

  let page = $state(0);   // pagination des élèves (la salle a SEATS.length sièges)

  function hash(s: string){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return Math.abs(h);}

  onMount(async () => {
    try {
      const ms = await classMembersFor(token, klass.id);
      members = ms;
      const ids = ms.map((m) => m.studentId).filter(Boolean) as string[];
      students = await getUsers(token, ids);
    } catch (e: any) { error = String(e); } finally { loading = false; }
  });

  // Lance la musique au 1er geste utilisateur dans la salle (les navigateurs bloquent
  // l'autoplay sonore tant qu'il n'y a pas d'interaction). Une seule tentative.
  function armMusicAutoplay() {
    if (musicTried) return; musicTried = true;
    setMusic(true);
  }

  // ===== Projection isométrique EXACTE du jeu (Iso.hx) =====
  const S = 2.25;   // échelle d'affichage (25% plus petit qu'avant : 3 → 2.25)
  const RWID = 12, RHEI = 12;
  const EXIT = { x: 1, y: 9 }, DESK = { x: 5, y: 10 }, BOARD = { x: 6, y: 11 };
  const SEAT_X = [2, 4, 5, 7, 8, 10], SEAT_Y = [2, 4, 6];   // 18 places (Solver.hx:230)
  const SEATS: { x: number; y: number }[] = [];
  for (const y of SEAT_Y) for (const x of SEAT_X) SEATS.push({ x, y });
  const COLS = SEAT_X.length;

  // Pagination : on remplit les 18 sièges, page par page, pour voir TOUTE la classe.
  const PER_PAGE = SEATS.length;
  const pageCount = $derived(Math.max(1, Math.ceil(members.length / PER_PAGE)));
  $effect(() => { if (page > pageCount - 1) page = 0; });   // clamp si la classe change
  const pageMembers = $derived(members.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE));
  const goPage = (d: number) => { if (pageCount > 1) page = (page + d + pageCount) % pageCount; };

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
    blend?: boolean; opacity?: number; mask?: string; desat?: boolean;
  };
  type Slot = {
    sid: string; seat: number; left: number; top: number; w: number; h: number; zi: number; ziArms: number;
    body: string; head: string; armsFold: string; armsBored: string; armsEngaged: string;
    gender: 'm' | 'f'; restMouth: number; restArms: ArmPose;
    user: BubbleUser | null; name: string; sprites: string[];
  };

  // Expression de repos selon l'humeur (updatePose, Student.hx:707-718).
  const moodMouth = (m: Meta) => (m.mood === 'engaged' ? 2 : m.mood === 'bored' ? 3 : m.mouthRest);
  const moodArms = (m: Meta): ArmPose => (m.mood === 'engaged' ? 'engaged' : m.mood === 'bored' ? 'bored' : 'fold');
  const armsPng = (idx: number, p: ArmPose) => (p === 'engaged' ? ARMS_ENGAGED : p === 'bored' ? ARMS_BORED : ARMS_FOLD)[idx];

  let _i = 0;
  function placeSym(items: Item[], name: string, cx: number, cy: number, opts: {
    mode?: 'A' | 'B'; dx?: number; dy?: number; mcx?: number; mcy?: number;
    xr?: number; yr?: number; zprio?: number; bucket?: number; flip?: boolean; useHeight?: boolean;
    sid?: string; blend?: boolean; opacity?: number; desat?: boolean;
  } = {}) {
    const g = geo[name]; if (!g) return;
    const { mode = 'A', dx = 0, dy = 0, mcx = 0, mcy = 0, xr = 0.5, yr = 0.5,
      zprio = 0, bucket = DP_ITEMS, flip = false, useHeight = true, sid, blend = false, opacity = 1, desat = false } = opts;
    const ax = cx - 0.5 + xr, ay = cy - 0.5 + yr;
    let px = sx(ax, ay), py = sy(ax, ay);
    if (useHeight) py -= heightMap(cx, cy);
    const ox = mode === 'A' ? mcx : mcx + dx;
    const oy = mode === 'A' ? mcy : mcy + 29 + dy;
    const z = bucket * 1e7 + zprio * 10000 + (_i++) + 1000 * Math.floor(100 + ax * 7 + ay * 7);
    items.push({
      src: png(name), w: g.w * S, h: g.h * S,
      left: ((px + ox) - g.ox - FL) * S, top: ((py + oy) - g.oy - FT) * S,
      flip, z, zi: zi(z), pixel: false, kind: 'decor', sid, blend, opacity, desat,
    });
  }

  function placeStudent(slots: Slot[], sid: string, idx: number, seat: number,
    cx: number, cy: number, user: BubbleUser | null, name: string) {
    // Assis : getInCasePos() du jeu = { xr:0.5, yr:0.95 } (Student.hx:552).
    // yOffset = -3 : propriété de base de l'entité Élève (Student.hx:144), appliquée
    // au sprite via Iso.hx:894 (sprite.y = pt.y + yOffset). Elle remonte le corps ET les
    // bras (overArms partage le même yOffset) de 3 px → l'élève ne s'enfonce plus dans la
    // table, donc trousse/cartable cessent de chevaucher son corps.
    const g = SG, xr = 0.5, yr = 0.95, Y_OFFSET = -3;
    const ax = cx - 0.5 + xr, ay = cy - 0.5 + yr;
    const px = sx(ax, ay), py = sy(ax, ay) - heightMap(cx, cy) + Y_OFFSET;
    const left = (px - g.ox - FL) * S, top = (py - g.oy - FT) * S, w = g.w * S, h = g.h * S;
    const base = 100 + ax * 7 + ay * 7;
    const zBody = DP_ITEMS * 1e7 + (_i++) + 1000 * Math.floor(base);
    const zArms = DP_ITEMS * 1e7 + (_i++) + 1000 * (5 + Math.floor(base));  // overArms layer=1
    const m = META[idx];
    const restMouth = moodMouth(m), restArms = moodArms(m);
    const sprites = [BODY[idx], HEAD[idx], eyesSrc(0), mouthSrc(m.gender, restMouth), armsPng(idx, restArms)];
    slots.push({ sid, seat, left, top, w, h, zi: zi(zBody), ziArms: zi(zArms),
      body: BODY[idx], head: HEAD[idx], armsFold: ARMS_FOLD[idx], armsBored: ARMS_BORED[idx], armsEngaged: ARMS_ENGAGED[idx],
      gender: m.gender, restMouth, restArms, user, name, sprites });
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

  // Part des élèves qui ont leurs affaires (trousse + cartable) sur le bureau. CHOIX ASSUMÉ
  // (le jeu les montre pour tous les assis) : on les réserve à une minorité pour l'ambiance
  // « classe peu motivée ». Réglable d'un seul endroit.
  const KIT_OUT_PCT = 35;

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

  const scene = $derived.by(() => {
    _i = 0;
    const items: Item[] = [];
    const slots: Slot[] = [];
    placeSym(items, 'solcouloir', 0, RHEI - 5, { zprio: -99, bucket: DP_BG });
    placeSym(items, sk('murcouloir'), 0, 0, { bucket: DP_BG });
    placeSym(items, sk('secretariat'), RWID - 1, -1, { mode: 'B', zprio: -98, bucket: DP_BG });
    // "Mur tableau" (lib.Mur2) : le jeu lui applique enableHole() = un CERCLE (rayon 40)
    // gravé en ERASE → un trou circulaire localisé LÀ OÙ EST LE PROF (pas le mur entier).
    placeSym(items, 'mur2', 0, RHEI, { zprio: 8 });
    {
      // RAYON 40 exact (Iso.hx:304 drawCircle(r,r,r), r=40) ; centré sur le sprite du prof.
      const mur = items[items.length - 1];
      const gJ = geo['james'];
      const tax = BOARD.x - 0.5 + 0.5, tay = BOARD.y - 0.5 + 0.9;
      const tpx = sx(tax, tay), tpy = sy(tax, tay) - heightMap(BOARD.x, BOARD.y) + 22;
      const tCx = (tpx - gJ.ox - FL) * S + (gJ.w * S) / 2;     // centre écran du sprite prof
      const tCy = (tpy - gJ.oy - FT) * S + (gJ.h * S) / 2;
      const hx = (tCx - mur.left).toFixed(1), hy = (tCy - mur.top).toFixed(1), hr = (40 * S).toFixed(1);
      mur.mask = `radial-gradient(circle ${hr}px at ${hx}px ${hy}px, transparent 0%, transparent 70%, rgba(0,0,0,0.85) 90%, #000 100%)`;
    }
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
    // Dessins d'élèves : position propre à chaque matière (Manager : drawings.setPos).
    placeSym(items, 'dessins', skinSet === 1 ? 3 : skinSet === 2 ? 5 : 9, 0, { mode: 'B', dy: 2 });
    // ===== Déco PROPRE À LA MATIÈRE (Manager.hx:2150-2305) — chaque salle est distincte. =====
    if (skinSet === 1) {
      // Sciences : mascotte Skully, fioles, ordi, table vide en +, vidéoprojecteur.
      placeSym(items, 'skully', 0, 8, { mcy: 24, xr: 1.2, yr: 0.1 });          // iso.Skully
      placeSym(items, 'potions', 0, 6, { mode: 'B' });
      placeSym(items, 'potions', 1, 0, { mode: 'B', flip: true, dy: 2 });
      placeSym(items, 'potions', 2, 0, { mode: 'B', flip: true, dy: 1 });
      placeSym(items, 'potions', RWID - 1, 0, { mode: 'B', flip: true, dy: 2 });
      placeSym(items, 'armoire', 0, 10, { mode: 'B' });
      placeSym(items, 'ordi', 3, 0, { mode: 'B', dy: 10 });
      placeSym(items, sk('tableeleve'), 7, 9, { mode: 'B', dx: -10, dy: -5 });  // table vide (frame 4)
      placeSym(items, 'projo', 3, RHEI - 2, { mode: 'B' });                     // "off" (frame 8)
    } else if (skinSet === 2) {
      // Maths : armoires, table prof, feuilles, cadres de mathématiciens, hamster, aquarium,
      // projecteur, placard, et des chaises EN VRAC dans le coin (0-2, positions aléatoires).
      placeSym(items, 'armoire2', 0, 7, { mode: 'B' });
      placeSym(items, 'armoire2', 9, 0, { mode: 'B', flip: true, dy: -2 });
      placeSym(items, 'tablem', 0, 4, { mode: 'B', flip: true, dy: 2 });
      placeSym(items, 'paper', 4, 9, { mode: 'B' });
      placeSym(items, 'paper2', RWID - 3, RHEI - 3, { mode: 'B', dx: -3 });
      placeSym(items, 'mathscadre', 0, 10, { mode: 'B', flip: true, dx: -3, dy: -6 });
      placeSym(items, 'mathscadre2', 0, 9, { mode: 'B', flip: true, dx: -5, dy: -6 });
      placeSym(items, 'hamster', 1, 0, { mode: 'B' });
      placeSym(items, 'projo', RWID - 3, RHEI - 3, { mode: 'B' });
      placeSym(items, 'armoire', 0, 6, { mode: 'B' });
      let cxv = 2;                                                              // chaises du coin
      const nch = hash(klass.id + 'corner') % 3;                               // 0..2 (dayRand.random(3))
      for (let k = 0; k < nch; k++) {
        const xr = 0.5 + (hash(klass.id + 'cx' + k) % 41) / 100;               // 0.5..0.9
        const yr = 0.5 + (hash(klass.id + 'cy' + k) % 31) / 100;               // 0.5..0.8
        placeSym(items, 'chaiseeleve', cxv, 0, { mode: 'B', xr, yr });
        cxv += (hash(klass.id + 'cd' + k) % 2) + 1;
      }
      placeSym(items, 'aquarium', 7, 0, { mode: 'B' });
    } else {
      // Histoire-géo : buste de Napoléon, coffre, mappemonde, coucou, globe…
      placeSym(items, 'bonaparte', 0, 3, { mcy: 24, xr: 1.2 });                // iso.Skully2
      placeSym(items, 'coffre', 0, 4, { mode: 'B' });
      placeSym(items, 'armoire2', 0, 6, { mode: 'B' });
      placeSym(items, 'bureauordi', 1, 11, { mode: 'B', dy: -10, flip: true });
      placeSym(items, 'worldmap', 4, 0, { mode: 'B', dy: -24 });
      placeSym(items, 'coucou', 3, 0, { mode: 'B', dy: -6 });
      placeSym(items, 'armoire', 11, 0, { mode: 'B', flip: true });
      placeSym(items, 'tableglobe', 10, 10, { mode: 'B', dy: -8 });
    }
    pageMembers.forEach((m, n) => {
      const { x, y } = SEATS[n];
      const idx = poolIndex(m);
      // Table à la tuile (x,y+1) : addFurnMc(-6,-8) ; FRAME selon la matière
      // (Manager.hx:835 — Histoire 3 / Science 4 / Math 1). Chaise (x,y) : frame 1, (-10,-5).
      placeSym(items, sk('tableeleve'), x, y + 1, { mode: 'B', dx: -6, dy: -8 });
      placeSym(items, 'chaiseeleve', x, y, { mode: 'B', dx: -10, dy: -5 });
      const u = studentOf(m);
      placeStudent(slots, m.id, idx, n, x, y, u, u ? fullName(u) : '?');
      // Affaires sur le bureau (lib.Student.stuff @ tuile de la table). Offset EXACT du jeu :
      // trousse addFurnMc(-9,-10) ; mc.y += 29+dy. Couleur aléatoire (gotoAndStop(random)).
      // CHOIX ASSUMÉ (pas du jeu, qui sort trousse + cartable pour tous les assis) : on ne
      // garde QUE la trousse (le cartable se posait devant l'élève / débordait de la table et
      // alourdissait), et seulement sur une minorité d'élèves → ambiance « peu motivée ».
      if (hash(m.id + 'kit') % 100 < KIT_OUT_PCT) {
        const male = META[idx].gender === 'm';
        const tColor = hash(m.id + 'tr') % (male ? 4 : 3);
        placeSym(items, `${male ? 'trousseg' : 'troussef'}_${tColor}`, x, y + 1,
                 { mode: 'B', dx: -9, dy: -10, zprio: 1.5 });
      }
    });
    const teacherSlot = teacherSlotOf(teacher, teacher ? fullName(teacher) : '');
    items.sort((a, b) => a.z - b.z);
    return { items, slots, teacherSlot };
  });

  // ===== Anim d'attente FIDÈLE au jeu (Student.hx:905-913) =====
  // L'expression de repos (bouche + bras) vient de l'humeur et NE BOUGE PAS (cf. updatePose).
  // Par-dessus, toutes les irnd(30,100) frames (≈ rnd(10,33) ticks de 100 ms) le jeu fait
  // lookAt(irnd(0,2)-1, 0) — la tête regarde gauche / centre / droite — et un clignement.
  const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
  const LOOK_MIN = 10, LOOK_MAX = 33;
  type Dir = -1 | 0 | 1;
  type AnimSt = { dir: Dir; eyes: number };
  let anim = $state<AnimSt[]>([]);
  let ctr: { wait: number; blink: number }[] = [];

  $effect(() => {
    const n = Math.min(pageMembers.length, SEATS.length);
    if (anim.length === n) return;
    const a: AnimSt[] = []; ctr = [];
    for (let i = 0; i < n; i++) {
      a.push({ dir: 0, eyes: 0 });
      ctr.push({ wait: rnd(LOOK_MIN, LOOK_MAX), blink: 0 });   // désync initial
    }
    anim = a;
  });

  function tick() {
    const n = anim.length; if (!n) return;
    const a = anim.slice();
    for (let i = 0; i < n; i++) {
      const c = ctr[i]; const s = { ...a[i] };
      // clignement en cours : yeux 1 → 2 → 0 (anim "eyes_blink" = [1,2,0])
      if (c.blink > 0) { c.blink--; s.eyes = c.blink === 1 ? 2 : c.blink === 0 ? 0 : 1; }
      // anim d'attente : tourne la tête (gauche/centre/droite à parts égales) + cligne
      if (--c.wait <= 0) {
        s.dir = (rnd(0, 2) - 1) as Dir;                 // lookAt(irnd(0,2)-1, 0)
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

  // lookAt FIDÈLE (Student.hx:348-378). Origine = centre du visage (≈39.6% du canevas 24px).
  const FACE_ORIGIN = ((1 + 8.5) / 24 * 100).toFixed(1) + '%';
  // Regard à DROITE : la tête entière se retourne (head.scaleX = -1) et se décale de +2 px.
  function headTransform(a: AnimSt | undefined): string {
    return a && a.dir === 1 ? `translateX(${2 * S}px) scaleX(-1)` : 'none';
  }
  // Regard à GAUCHE : seul le VISAGE (yeux + bouche) glisse de -1 px (la tête/les cheveux ne
  // bougent pas) → mouvement subtil, plus de "saut" de toute la tête.
  function faceTransform(a: AnimSt | undefined): string {
    return a && a.dir === -1 ? `translateX(${-1 * S}px)` : 'none';
  }
  const armsSrc = (st: Slot) =>
    st.restArms === 'engaged' ? st.armsEngaged : st.restArms === 'bored' ? st.armsBored : st.armsFold;

  // ===== Prof : pose unique, face aux élèves (il enseigne) =====
  // En iso, les élèves sont en HAUT-DROITE du prof → face aux élèves = james_back retourné.
  // (On retire l'ancien va-et-vient automatique tableau↔classe : les 2 sprites ont des
  //  silhouettes de cheveux différentes, ce qui faisait "clignoter" une ligne au changement.)
  const teacherSrc = png('james_back');     // dans la salle : de dos, face à la classe
  const teacherFace = png('james');         // pour la fiche latérale (on voit son visage)

  // ===== Bus : passe dans la rue de temps en temps (lib.Bus, trajet x=RWID+3, y -10→25) =====
  const busGeo = geo['bus'];
  const BUS_ZI = zi(DP_ITEMS * 1e7 + 20 * 10000 + 1000 * Math.floor(100 + (RWID + 3) * 7 + 8 * 7));
  // CHOIX DE CADRAGE (pas du jeu) : le bus pleine taille écrase la vue serrée → on le réduit.
  // Mise à l'échelle autour de son point d'ancrage pour qu'il reste sur la chaussée.
  const BUS_SCALE = 0.8;
  let busP = $state(-1);   // -1 = inactif (caché) ; 0..1 = progression du passage
  function busPos(p: number) {
    const y = -10 + p * 35, cx = RWID + 3;
    const px = sx(cx, y), py = sy(cx, y) + 29;   // mc.y += 29 (Bus.hx)
    const f = BUS_SCALE;
    return {
      left: ((px - FL) - busGeo.ox * f) * S, top: ((py - FT) - busGeo.oy * f) * S,
      w: busGeo.w * S * f, h: busGeo.h * S * f,
    };
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

<svelte:window onkeydown={(e) => {
  if (e.key === 'ArrowLeft') goPage(-1);
  else if (e.key === 'ArrowRight') goPage(1);
}} />
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="room" onpointerdown={armMusicAutoplay}>
  <header class="bar">
    <button class="back" onclick={onBack}>← Retour</button>
    <h2>{klass.name ?? 'Classe'}</h2>
    <span class="count">{members.length} élèves</span>
    {#if pageCount > 1}
      <div class="pager" title="Flèches ← → pour changer de page">
        <button class="pg" onclick={() => goPage(-1)} aria-label="Page précédente">‹</button>
        <span class="pg-label">{page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, members.length)} / {members.length}</span>
        <button class="pg" onclick={() => goPage(1)} aria-label="Page suivante">›</button>
      </div>
    {/if}
    <button class="music" class:on={musicOn} onpointerdown={(e) => e.stopPropagation()} onclick={toggleMusic} title="Musique d'ambiance (thème de classe)">{musicOn ? '🔊 Musique' : '🔈 Musique'}</button>
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
                 style="left:{o.left}px;top:{o.top}px;width:{o.w}px;height:{o.h}px;z-index:{o.zi}{o.opacity < 1 ? `;opacity:${o.opacity}` : ''}{o.desat ? ';filter:saturate(0.6)' : ''}{o.blend ? ';mix-blend-mode:overlay' : ''}{o.mask ? `;-webkit-mask-image:${o.mask};mask-image:${o.mask}` : ''}" />
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
              <span class="face" style="transform-origin:{FACE_ORIGIN} 50%;transform:{faceTransform(a)}">
                <img class="layer" src={eyesSrc(a?.eyes ?? 0)} alt="" />
                <img class="layer" src={mouthSrc(st.gender, st.restMouth)} alt="" />
              </span>
            </span>
          </button>
          <img class="sym pixel" class:hl={st.sid === hoveredSid} src={armsSrc(st)} alt=""
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
  .music { background:#f7e7c8; color:#3d2c1e; border:0; padding:6px 12px; height:30px; border-radius:6px; cursor:pointer; font:700 12px system-ui; box-shadow:0 2px 0 #3d2c1e; white-space:nowrap; }
  .music:hover { background:#fff8ec; }
  .music.on { background:#f5cf6a; }

  /* Pagination des élèves */
  .pager { display:flex; align-items:center; gap:6px; background:#4a3625; border:2px solid #3d2c1e; border-radius:999px; padding:2px; }
  .pg { width:26px; height:26px; border:0; border-radius:50%; cursor:pointer; background:#f7e7c8; color:#3d2c1e; font:800 16px system-ui; line-height:1; display:flex; align-items:center; justify-content:center; }
  .pg:hover { background:#fff8ec; }
  .pg-label { font:800 11px system-ui; color:#f7e7c8; padding:0 4px; min-width:74px; text-align:center; letter-spacing:0.02em; }

  .viewport { display:flex; justify-content:center; padding:24px 20px 60px; overflow:auto; isolation:isolate; }
  .stage { position:relative; flex:none; overflow:hidden; background:#1d2129; box-shadow:0 8px 30px rgba(0,0,0,0.4); }

  .sym { position:absolute; display:block; pointer-events:none; }
  .actor { position:absolute; background:none; border:0; padding:0; cursor:pointer; line-height:0; }
  .actor img { display:block; image-rendering:pixelated; pointer-events:none; }
  .actor:disabled { cursor:default; }
  .student .layer { position:absolute; inset:0; width:100%; height:100%; image-rendering:pixelated; }
  .student .head, .student .face { position:absolute; inset:0; }
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
