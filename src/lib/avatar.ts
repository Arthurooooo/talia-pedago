// Sprites chibi "écolier mignon" générés géométriquement (ellipses → formes
// rondes, pas de cheveux-casquette), contour noir auto, uniforme col + cravate.
// Style inspiré des sets pixel-art kawaii d'écoliers.

const W = 20;
const H = 28;

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function shade(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const t = (c: number) =>
    factor > 1
      ? Math.min(255, Math.round(c + (255 - c) * (factor - 1)))
      : Math.max(0, Math.round(c * factor));
  return '#' + [r, g, b].map(t).map((c) => c.toString(16).padStart(2, '0')).join('');
}

// ---------- Palettes ----------
const OUTLINE = '#26222e';
const EYE = '#26222e';
const MOUTH = '#9a4040';
const CHEEK = '#f2a0a0';
const TIE = '#c1424a';
const SHOE = '#33405e';
const PANTS = '#33405e';

const SKIN = ['#ffd8b1', '#f0c293', '#d39b6e', '#a06b44', '#6e4a2e'];
const HAIR = ['#3a2a1e', '#5a3d28', '#8a5a32', '#c89a4e', '#e6cf7a', '#b34a2a', '#2b2b34', '#6b5340', '#d9d2c4'];
const SHIRT = ['#4a72c0', '#5a9a52', '#c46a3c', '#b04a82', '#7a52b0', '#3aa0a8', '#c43d52', '#d68f2a'];
// Tons "adulte" plus sobres mais VARIÉS (bleu/brun/ardoise/prune/olive/terracotta/teal).
const NEUTRAL = ['#5b6680', '#7a6a5c', '#4e6b85', '#6b5e7e', '#7d8a4e', '#9a6b52', '#4f7a6a', '#8a6b6b'];
const GLASS = '#8c8f9c';   // monture métal, distincte du noir des yeux

type Grid = string[][];
const blank = (): Grid => Array.from({ length: H }, () => Array(W).fill('.'));

function ell(g: Grid, cx: number, cy: number, rx: number, ry: number, ch: string, cond?: (x: number, y: number) => boolean) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy <= 1 && (!cond || cond(x, y))) g[y][x] = ch;
  }
}
function rect(g: Grid, x0: number, y0: number, x1: number, y1: number, ch: string) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
    if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = ch;
}

const STYLES = ['short', 'long', 'ponytail', 'spiky', 'bun'] as const;

function build(style: string): Grid {
  const g = blank();
  const cx = 10, cy = 9, hr = 7;
  ell(g, cx, cy, hr, hr, 'S'); // peau

  const fringe = cy - 2, sideBottom = cy + 2;
  ell(g, cx, cy - 1, hr + 1, hr + 1, 'H', (x, y) => {
    const d = Math.abs(x - cx);
    return y <= fringe || (d >= hr - 1 && y <= sideBottom);
  });
  if (style === 'long') {
    ell(g, cx, cy + 4, hr + 1, hr + 2, 'H', (x, y) => Math.abs(x - cx) >= hr - 1 && y > fringe);
  } else if (style === 'ponytail') {
    ell(g, cx + hr, cy - 1, 1.8, 2.6, 'H');
    rect(g, cx + hr, cy - 3, cx + hr + 2, cy + 2, 'H');
  } else if (style === 'spiky') {
    for (let i = -2; i <= 2; i++) rect(g, cx + i * 2, 1, cx + i * 2, 3, 'H');
  } else if (style === 'bun') {
    ell(g, cx, 2, 2.4, 2.4, 'H');
  }

  // Reflet : éclaircit le sommet du dôme
  for (let y = 0; y <= fringe - 1; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'H') g[y][x] = 'h';

  // Yeux 2×2, joues, bouche
  rect(g, cx - 4, cy + 1, cx - 3, cy + 2, 'E');
  rect(g, cx + 3, cy + 1, cx + 4, cy + 2, 'E');
  rect(g, cx - 5, cy + 4, cx - 4, cy + 4, 'c');
  rect(g, cx + 4, cy + 4, cx + 5, cy + 4, 'c');
  rect(g, cx - 1, cy + 5, cx, cy + 5, 'm');

  // Corps
  const by = cy + hr;
  rect(g, cx - 5, by + 1, cx + 5, by + 6, 'T');
  ell(g, cx, by + 6, 6, 2.5, 'T', (_x, y) => y >= by + 5);
  rect(g, cx - 2, by, cx + 2, by + 1, 'C'); // col
  rect(g, cx, by + 1, cx, by + 4, 'R');     // cravate
  rect(g, cx - 6, by + 2, cx - 6, by + 5, 'S'); // bras
  rect(g, cx + 6, by + 2, cx + 6, by + 5, 'S');
  rect(g, cx - 5, by + 7, cx + 5, by + 9, 'P'); // bas
  rect(g, cx - 4, by + 10, cx - 2, by + 11, 'K'); // jambes
  rect(g, cx + 2, by + 10, cx + 4, by + 11, 'K');
  return g;
}

// Contour : tout pixel vide adjacent (8-voisins) à un pixel plein → outline.
function outlineMask(g: Grid): boolean[][] {
  const m = Array.from({ length: H }, () => Array(W).fill(false));
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] !== '.') continue;
    for (const [dx, dy] of nb) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && g[ny][nx] !== '.') { m[y][x] = true; break; }
    }
  }
  return m;
}

interface Palette { [k: string]: string }

// Un hash INDÉPENDANT par attribut (salt différent) → peau/cheveux/haut/coiffure
// non corrélés : deux seeds proches ne donnent plus le même avatar entier.
function pick<T>(arr: readonly T[], seed: string, salt: string): T {
  return arr[hash(seed + '#' + salt) % arr.length];
}

function paletteFor(name: string, opts?: { neutral?: boolean }): { pal: Palette; style: string } {
  const seed = name || 'anon';
  const skin = pick(SKIN, seed, 'skin');
  const hair = pick(HAIR, seed, 'hair');
  const shirt = opts?.neutral ? pick(NEUTRAL, seed, 'shirt') : pick(SHIRT, seed, 'shirt');
  const style = pick(STYLES, seed, 'style');
  return {
    style,
    pal: {
      S: skin, H: hair, h: shade(hair, 1.35),
      T: shirt, C: shade(shirt, 1.4), R: TIE, P: PANTS, K: SHOE,
      E: EYE, c: CHEEK, m: MOUTH, O: OUTLINE,
    },
  };
}

function emit(g: Grid, pal: Palette, extra = ''): string {
  const mask = outlineMask(g);
  const parts: string[] = [];
  // outline d'abord
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!mask[y][x]) { x++; continue; }
      let e = x + 1; while (e < W && mask[y][e]) e++;
      parts.push(`<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${pal.O}"/>`);
      x = e;
    }
  }
  // couleurs
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const ch = g[y][x];
      if (ch === '.' || !pal[ch]) { x++; continue; }
      let e = x + 1; while (e < W && g[y][e] === ch) e++;
      parts.push(`<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${pal[ch]}"/>`);
      x = e;
    }
  }
  return parts.join('') + extra;
}

function svgWrap(inner: string, size: number): string {
  const height = (size * H / W).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${size}" height="${height}" shape-rendering="crispEdges" style="display:block">${inner}</svg>`;
}

export function avatarSVG(name: string, size = 40): string {
  const { pal, style } = paletteFor(name);
  return svgWrap(emit(build(style), pal), size);
}

export function teacherSVG(name: string, size = 48): string {
  const { pal, style } = paletteFor(name + '__t', { neutral: true });
  const g = build(style);
  // Lunettes en monture métal (≠ noir des yeux) → les yeux restent des carrés nets.
  // Cadres AUTOUR des yeux (eyes en cx±3..4, rangs cy+1..cy+2) + pont.
  const cx = 10, cy = 9;
  const O = GLASS;
  const gl = [
    `<rect x="${cx - 5}" y="${cy}" width="4" height="1" fill="${O}"/>`,
    `<rect x="${cx - 5}" y="${cy + 3}" width="4" height="1" fill="${O}"/>`,
    `<rect x="${cx - 5}" y="${cy + 1}" width="1" height="2" fill="${O}"/>`,
    `<rect x="${cx - 2}" y="${cy + 1}" width="1" height="2" fill="${O}"/>`,
    `<rect x="${cx + 2}" y="${cy}" width="4" height="1" fill="${O}"/>`,
    `<rect x="${cx + 2}" y="${cy + 3}" width="4" height="1" fill="${O}"/>`,
    `<rect x="${cx + 5}" y="${cy + 1}" width="1" height="2" fill="${O}"/>`,
    `<rect x="${cx + 2}" y="${cy + 1}" width="1" height="2" fill="${O}"/>`,
    `<rect x="${cx - 1}" y="${cy + 1}" width="3" height="1" fill="${O}"/>`,   // pont
  ];
  return svgWrap(emit(g, pal, gl.join('')), size);
}

export const emojiFor = avatarSVG; // compat
