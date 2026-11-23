/**
 * Comps for docs/superpowers/specs/2026-11-15-modernize-design.md.
 *
 * A design artefact, not product code: served by `npm run dev` at
 * /docs/superpowers/specs/assets/2026-11-15-modernize/comps.html. It imports
 * the real cutter and the real accent extractor so the pieces, chips, cut
 * lines and accents shown are exactly what the app would produce. Nothing in
 * `src/` imports this file.
 */

import '@fontsource/inter-tight/latin-400.css';
import '@fontsource/inter-tight/latin-500.css';
import '@fontsource/inter-tight/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/instrument-serif/latin-400.css';

import { cut } from '@/cut/cutter';
import type { CutGeometry, CutPiece } from '@/cut/types';
import { toPath2D } from '@/core/geom';
import { extractAccent, type AccentTokens } from '@/render/accent';
import { CURATED_PHOTOS } from '@/play/curated-manifest';

// ---------------------------------------------------------------------------
// data

type Curated = (typeof CURATED_PHOTOS)[number];
const photo = (id: string): Curated => {
  const p = CURATED_PHOTOS.find((c) => c.id === id);
  if (!p) throw new Error(`no curated photo ${id}`);
  return p;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bitmaps = new Map<string, Promise<ImageBitmap>>();
function loadPhoto(id: string, maxEdge: number): Promise<ImageBitmap> {
  const key = `${id}@${maxEdge}`;
  let p = bitmaps.get(key);
  if (!p) {
    p = (async () => {
      const blob = await (await fetch(`/assets/curated/${photo(id).file}`)).blob();
      const full = await createImageBitmap(blob);
      const k = Math.min(1, maxEdge / Math.max(full.width, full.height));
      if (k === 1) return full;
      return createImageBitmap(full, {
        resizeWidth: Math.round(full.width * k),
        resizeHeight: Math.round(full.height * k),
        resizeQuality: 'high',
      });
    })();
    bitmaps.set(key, p);
  }
  return p;
}

interface Cut {
  id: string;
  name: string;
  photo: ImageBitmap;
  geo: CutGeometry;
  pieces: CutPiece[];
  /** Outline per piece, in image pixels. */
  outlines: Path2D[];
  accent: AccentTokens;
}

const cuts = new Map<string, Promise<Cut>>();
function cutPhoto(id: string, count: number, maxEdge = 1400): Promise<Cut> {
  const key = `${id}/${count}/${maxEdge}`;
  let p = cuts.get(key);
  if (!p) {
    p = (async () => {
      const source = await loadPhoto(id, maxEdge);
      await new Promise((r) => requestAnimationFrame(r));
      const seed = hash(id);
      const it = cut({ source, seed, targetCount: count, cutStyle: 'classic', pixelRatio: 1 });
      let geo: CutGeometry | null = null;
      const pieces: CutPiece[] = [];
      for (let r = it.next(); !r.done; r = it.next()) {
        if (r.value.type === 'grid') geo = r.value.geometry;
        else pieces.push(...r.value.pieces);
      }
      if (!geo) throw new Error('no grid');
      const outlines = pieces.map((piece) => {
        const out = new Path2D();
        out.addPath(
          toPath2D(piece.path),
          new DOMMatrix([1, 0, 0, 1, piece.targetX * geo!.scale, piece.targetY * geo!.scale]),
        );
        return out;
      });
      return {
        id,
        name: photo(id).name,
        photo: source,
        geo,
        pieces,
        outlines,
        accent: extractAccent(pieces, seed),
      };
    })();
    cuts.set(key, p);
  }
  return p;
}

/** A plausible order of placement: the frame first, then rows. */
function progressOrder(c: Cut): CutPiece[] {
  const edges = c.pieces.filter((p) => p.isEdge);
  const inner = c.pieces.filter((p) => !p.isEdge);
  return [...edges, ...inner];
}

function placedSet(c: Cut, fraction: number): Set<number> {
  const order = progressOrder(c);
  return new Set(order.slice(0, Math.round(order.length * fraction)).map((p) => p.id));
}

// ---------------------------------------------------------------------------
// canvas helpers

const DPR = 2;
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement('canvas');
  el.width = Math.round(w * DPR);
  el.height = Math.round(h * DPR);
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  const ctx = el.getContext('2d')!;
  ctx.scale(DPR, DPR);
  return [el, ctx];
}

interface Fit {
  s: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
function fitInto(imgW: number, imgH: number, box: { x: number; y: number; w: number; h: number }, cover = false): Fit {
  const s = cover ? Math.max(box.w / imgW, box.h / imgH) : Math.min(box.w / imgW, box.h / imgH);
  const w = imgW * s;
  const h = imgH * s;
  return { s, w, h, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2 };
}

function pieceRect(c: Cut, p: CutPiece, f: Fit) {
  return {
    x: f.x + p.targetX * c.geo.scale * f.s,
    y: f.y + p.targetY * c.geo.scale * f.s,
    w: p.bitmap.width * f.s,
    h: p.bitmap.height * f.s,
  };
}

function matBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#15181d';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.2, w / 2, h * 0.45, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * The lit board: placed pieces at full value over the photo "unlit", plus the
 * §07 progress bloom (a blurred copy of the lit layer drawn back additively,
 * 0 → 0.9 with completion). `unlit` is the proposal for thumbnails: today they
 * are captured from the static layer alone, so an early board reads as black.
 */
function drawLitBoard(
  ctx: CanvasRenderingContext2D,
  c: Cut,
  placed: Set<number>,
  f: Fit,
  opts: { unlit: boolean; frame: boolean; bloomScale?: number },
): void {
  if (opts.unlit) {
    ctx.save();
    ctx.filter = 'brightness(0.2) saturate(0.5)';
    ctx.drawImage(c.photo, f.x, f.y, f.w, f.h);
    ctx.restore();
  }
  if (opts.frame) {
    ctx.strokeStyle = '#2c333c';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(f.x) + 0.5, Math.round(f.y) + 0.5, Math.round(f.w) - 1, Math.round(f.h) - 1);
  }
  const W = ctx.canvas.width / DPR;
  const H = ctx.canvas.height / DPR;
  const [, lit] = canvas(W, H);
  for (const p of c.pieces) {
    if (!placed.has(p.id)) continue;
    const r = pieceRect(c, p, f);
    lit.drawImage(p.bitmap, r.x, r.y, r.w, r.h);
  }
  const fraction = placed.size / c.pieces.length;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(0.9, 0.9 * fraction) * (opts.bloomScale ?? 0.55);
  ctx.filter = `blur(${Math.max(6, f.w * 0.035)}px)`;
  ctx.drawImage(lit.canvas, 0, 0, W, H);
  ctx.restore();
  ctx.drawImage(lit.canvas, 0, 0, W, H);
}

function boardThumb(c: Cut, fraction: number, w: number, h: number, cover = true): HTMLCanvasElement {
  const [el, ctx] = canvas(w, h);
  ctx.fillStyle = '#101318';
  ctx.fillRect(0, 0, w, h);
  const f = fitInto(c.photo.width, c.photo.height, { x: 0, y: 0, w, h }, cover);
  drawLitBoard(ctx, c, placedSet(c, fraction), f, { unlit: true, frame: false });
  return el;
}

function photoCanvas(c: Cut, w: number, h: number): HTMLCanvasElement {
  const [el, ctx] = canvas(w, h);
  const f = fitInto(c.photo.width, c.photo.height, { x: 0, y: 0, w, h }, true);
  ctx.drawImage(c.photo, f.x, f.y, f.w, f.h);
  return el;
}

/** One tray chip: the piece's real silhouette, a baked contact shadow, and §06's corner notch. */
function chipCanvas(p: CutPiece, accentTray: string, size = 56): HTMLCanvasElement {
  const [el, ctx] = canvas(size, size);
  const pad = 6;
  const k = Math.min((size - pad * 2) / p.bitmap.width, (size - pad * 2) / p.bitmap.height);
  const w = p.bitmap.width * k;
  const h = p.bitmap.height * k;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 5 * DPR;
  ctx.shadowOffsetY = 1.5 * DPR;
  ctx.drawImage(p.bitmap, (size - w) / 2, (size - h) / 2 + 1, w, h);
  ctx.restore();
  if (p.isEdge) {
    ctx.strokeStyle = accentTray;
    ctx.lineWidth = 1.75;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(3.5, 12);
    ctx.lineTo(3.5, 3.5);
    ctx.lineTo(12, 3.5);
    ctx.stroke();
  }
  return el;
}

// ---------------------------------------------------------------------------
// icons (src/ui/kit/Icon.tsx, verbatim paths)

const svg = (body: string, size = 22) =>
  `<svg aria-hidden width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const I = {
  gear: (s = 22) =>
    svg(
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
      s,
    ),
  home: (s = 24) => svg('<path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/>', s),
  grid: (s = 24) =>
    svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', s),
  photo: (s = 24) => svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>', s),
  plus: (s = 22) => svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', s),
  pause: (s = 18) =>
    svg('<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>', s),
  bulb: (s = 22) =>
    svg('<line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/>', s),
  fit: (s = 20) => svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', s),
  pin: (s = 14) => svg('<path d="M12 17v5"/><path d="M8 3h8l-1 6 3 4H6l3-4z"/>', s),
  offline: (s = 18) => svg('<path d="M2 8.8a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16.1a5 5 0 017 0"/><line x1="12" y1="20" x2="12" y2="20"/><line x1="3" y1="3" x2="21" y2="21"/>', s),
  zoom: (s = 14) => svg('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', s),
  freeze: (s = 10) => svg('<line x1="12" y1="2" x2="12" y2="22"/><line x1="3" y1="7" x2="21" y2="17"/><line x1="21" y1="7" x2="3" y2="17"/>', s),
};

function ring(fraction: number, size: number, color: string): string {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden style="transform:rotate(-90deg)"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2.5"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${c * fraction} ${c}"/></svg>`;
}

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function accentVars(node: HTMLElement, a: AccentTokens): void {
  node.style.setProperty('--accent', a.accent);
  node.style.setProperty('--accent-bloom', a.accentBloom);
  node.style.setProperty('--accent-tray', a.accentTray);
}

function framed(device: HTMLElement, caption: string, scaled = false): HTMLElement {
  const wrap = el(`<figure style="margin:0"></figure>`);
  if (scaled) {
    const s = el(`<div class="scaled-62"></div>`);
    s.append(device);
    wrap.append(s);
  } else wrap.append(device);
  wrap.append(el(`<figcaption class="caption" style="max-width:${scaled ? 731 : 402}px">${caption}</figcaption>`));
  return wrap;
}

// ---------------------------------------------------------------------------
// 1 · Today

const RAIL = [
  { id: 'banff-sunrise-lake', count: 150, fraction: 0.62 },
  { id: 'red-fox-face', count: 100, fraction: 0.18 },
  { id: 'spice-market-vibrant', count: 200, fraction: 0.41 },
];
const WALL = ['tiger-closeup', 'macaw-feathers', 'swiss-snow-peaks', 'desert-dunes-water', 'owl-close-up', 'candy-jar-colorful', 'autumn-lake-reflection', 'white-sand-dunes'];

type TodayState = 'unplayed' | 'progress' | 'done' | 'first';

function tabbar(selected: number, dot: boolean): HTMLElement {
  const items = [
    ['Today', I.home()],
    ['Puzzles', I.grid()],
    ['Collection', I.photo()],
  ];
  return el(
    `<div class="tabbar">${items
      .map(([label, icon], i) => `<div class="${i === selected ? 'sel' : ''}">${icon}${label}${i === 0 && dot ? '<span class="dot"></span>' : ''}</div>`)
      .join('')}</div>`,
  );
}

function floatbar(dot: boolean): HTMLElement {
  return el(
    `<div class="floatbar"><div class="sel">${I.home(20)}Today${dot ? '<span style="width:7px;height:7px;border-radius:9px;background:var(--accent);margin-left:2px"></span>' : ''}</div><div>${I.grid(20)}Puzzles</div><div>${I.photo(20)}Collection</div></div>`,
  );
}

async function hero(state: TodayState, daily: Cut, count: number, w: number, h: number): Promise<HTMLElement> {
  const node = el(`<div class="hero" style="height:${h}px"></div>`);
  if (state === 'progress') node.append(boardThumb(daily, 0.38, w, h));
  else node.append(photoCanvas(daily, w, h));
  const big = w > 500;
  let actions = '';
  let sub = '';
  let eyebrow = `Daily · ${count} pieces`;
  if (state === 'unplayed' || state === 'first') {
    sub = `3 hints included · new puzzle in 9h 41m`;
    actions = `<button class="btn primary" style="min-width:132px">Start</button>`;
  } else if (state === 'progress') {
    const placed = Math.round(count * 0.38);
    sub = `${placed} of ${count} placed`;
    actions = `<button class="btn primary" style="min-width:132px">Keep going</button><span class="progress">${ring(0.38, 28, 'var(--accent)')}<span class="num">38%</span></span>`;
  } else {
    eyebrow = `Daily · done`;
    sub = `${count} pieces in 24:18 · clean run`;
    actions = `<button class="btn ghost">See your card</button><span class="badge">${svg('<polyline points="20 6 9 17 4 12"/>', 12)}Done today</span>`;
  }
  node.append(
    el(`<div class="copy">
      <div class="eyebrow">${eyebrow}</div>
      <div class="title display" style="${big ? 'font-size:var(--t7)' : ''}">${daily.name}</div>
      <div class="sub">${sub}</div>
      <div class="actions">${actions}</div>
    </div>`),
  );
  return node;
}

async function rail(cardW = 200, thumbH = 150): Promise<HTMLElement> {
  const node = el(`<div class="rail"></div>`);
  for (const r of RAIL) {
    const c = await cutPhoto(r.id, r.count, 900);
    const card = el(`<div class="puzzle-card" style="flex-basis:${cardW}px">
      <div class="thumb" style="width:${cardW}px;height:${thumbH}px"></div>
      <div class="name display">${c.name}</div>
      <div class="meta">${ring(r.fraction, 18, c.accent.accent)}${Math.round(r.fraction * 100)}% · ${r.count} pieces</div>
    </div>`);
    card.querySelector('.thumb')!.append(boardThumb(c, r.fraction, cardW, thumbH));
    node.append(card);
  }
  node.append(el(`<div class="new-tile" style="height:${thumbH}px">${I.plus()}New puzzle</div>`));
  return node;
}

function pips(today: number, done: number[], freeze: number[]): string {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return `<div class="pips">${days
    .map((d, i) => {
      const cls = [done.includes(i) ? 'done' : '', i === today ? 'today' : '', freeze.includes(i) ? 'freeze' : ''].join(' ');
      return `<div class="pip ${cls}"><i>${freeze.includes(i) ? I.freeze(9) : ''}</i>${d}</div>`;
    })
    .join('')}</div>`;
}

async function streakCard(state: TodayState): Promise<HTMLElement> {
  if (state === 'first') {
    return el(`<div class="card"><div class="streak-num display" style="color:var(--ink-muted)">0</div><div class="label">Play the daily to start a streak.</div>${pips(5, [], [])}</div>`);
  }
  const n = state === 'done' ? 24 : 23;
  const done = state === 'done' ? [0, 1, 3, 4, 5] : [0, 1, 3, 4];
  const line = state === 'done' ? 'Played today. 1 freeze saved.' : 'Today keeps it going.';
  return el(`<div class="card"><div class="streak-num display">${n}</div><div class="label">day streak</div><div class="meta" style="font-size:var(--t1)">${line}</div>${pips(5, done, [2])}</div>`);
}

async function collectionCard(state: TodayState): Promise<HTMLElement> {
  const node = el(`<div class="card"><div class="mosaic"></div></div>`);
  const mosaic = node.querySelector('.mosaic')!;
  if (state === 'first') {
    for (let i = 0; i < 4; i++) mosaic.append(el('<span></span>'));
    node.append(el(`<div class="label">Finished puzzles gather here.</div>`));
    return node;
  }
  for (const id of WALL.slice(0, 8)) {
    const c = await cutPhoto(id, 50, 400);
    const tile = photoCanvas(c, 48, 48);
    tile.style.width = '100%';
    tile.style.height = 'auto';
    mosaic.append(tile);
  }
  node.append(el(`<div><span class="display" style="font-size:var(--t5)">14</span> <span class="label">finished</span></div>`));
  node.append(el(`<div class="meta">2,150 pieces placed</div>`));
  return node;
}

async function todayPhone(state: TodayState, dailyId: string, opts: { offline?: boolean; tall?: number } = {}): Promise<HTMLElement> {
  const count = 200;
  const daily = await cutPhoto(dailyId, 100, 1400);
  const device = el(`<div class="device phone" style="${opts.tall ? `height:${opts.tall}px` : ''}"><div class="screen"><div class="status"></div><div class="today-head"><span class="wordmark display">Tessera</span><span style="display:flex;align-items:center;gap:4px"><span class="today-date">Sat 21 Nov</span><button class="icon-btn" aria-label="Settings">${I.gear()}</button></span></div><div class="scroll"></div></div></div>`);
  accentVars(device, daily.accent);
  const scroll = device.querySelector('.scroll') as HTMLElement;
  scroll.append(await hero(state, daily, count, 370, 380));
  if (opts.offline) {
    scroll.append(el(`<div class="inline-row">${I.offline()}<span class="grow">You're offline. Puzzles you've started still work.</span></div>`));
  }
  if (state === 'first') {
    scroll.append(
      el(`<div class="card empty-card"><p>Any photo works. Start with one you like looking at.</p><button class="btn default block">${I.plus(18)}New puzzle</button></div>`),
    );
  } else {
    scroll.append(el(`<div class="section-head"><h3>Keep going</h3><a>All puzzles</a></div>`));
    scroll.append(await rail());
  }
  const duo = el(`<div class="duo"></div>`);
  duo.append(await streakCard(state), await collectionCard(state));
  scroll.append(duo);
  if (!opts.offline && state !== 'first') {
    scroll.append(el(`<div class="inline-row"><span class="grow">Install Tessera for a full-screen, offline-ready app.</span><button>Install</button></div>`));
  }
  device.append(tabbar(0, state !== 'done'));
  device.append(el(`<div class="home-ind"></div>`));
  return device;
}

async function todayIpad(dailyId: string): Promise<HTMLElement> {
  const daily = await cutPhoto(dailyId, 100, 1400);
  const device = el(`<div class="device ipad"><div class="screen" style="padding:96px 70px 0"></div></div>`);
  accentVars(device, daily.accent);
  const screen = device.querySelector('.screen') as HTMLElement;
  screen.append(
    el(`<div class="today-head" style="padding:0 0 16px 4px"><span class="wordmark display">Tessera</span><span style="display:flex;align-items:center;gap:8px"><span class="today-date">Saturday 21 November</span><button class="icon-btn">${I.gear()}</button></span></div>`),
  );
  const grid = el(`<div style="display:grid;grid-template-columns:640px 1fr;gap:16px"></div>`);
  grid.append(await hero('unplayed', daily, 200, 640, 392));
  const col = el(`<div style="display:grid;grid-template-rows:1fr 1fr;gap:16px"></div>`);
  const s = await streakCard('unplayed');
  const c = await collectionCard('unplayed');
  s.style.padding = c.style.padding = '16px 20px';
  col.append(s, c);
  grid.append(col);
  screen.append(grid);
  screen.append(el(`<div class="section-head" style="margin-top:24px"><h3>Keep going</h3><a>All puzzles</a></div>`));
  screen.append(await rail(200, 132));
  device.append(floatbar(true));
  return device;
}

// ---------------------------------------------------------------------------
// 3 · Tray

interface PlayLayout {
  W: number;
  H: number;
  board: { x: number; y: number; w: number; h: number };
  sheetH: number;
  dock: boolean;
}

function lensRow(c: Cut, active: string, regionOn: boolean, wrap = false): string {
  const edges = c.pieces.filter((p) => p.isEdge).length;
  const corners = c.pieces.filter((p) => p.isCorner).length;
  const loose = c.pieces.length;
  const lens = (name: string, count: number | null, extra = '') =>
    `<span class="lens ${active === name ? 'on' : ''} ${extra}">${name}${count === null ? '' : ` <span class="num">${count}</span>`}</span>`;
  return `<div class="lenses" style="${wrap ? 'flex-wrap:wrap' : ''}">${lens('All', loose)}${lens('Edges', edges)}${lens('Corners', corners)}${lens('Colour', null)}${
    regionOn ? lens('Region', 31) : `<span class="lens off" aria-disabled="true">${I.zoom()}Region</span>`
  }${lens('Recent', 6)}</div>`;
}

function colourBins(c: Cut): string {
  const r = rng(7);
  const picks = [...c.pieces].sort(() => r() - 0.5).slice(0, 6);
  return `<div class="lenses" style="padding-top:0">${picks
    .map((p, i) => `<span class="lens ${i === 2 ? 'on' : ''}"><span class="swatch" style="background:rgb(${p.meanColor.join(',')})"></span>${i + 1} <span class="num">${12 + Math.round(r() * 20)}</span></span>`)
    .join('')}<span class="lens">Mixed <span class="num">9</span></span></div>`;
}

function topbar(c: Cut, placed: number): HTMLElement {
  return el(`<div class="topbar"><div class="t"><span class="display">${c.name}</span><span class="num">${placed} / ${c.pieces.length}</span></div><button class="icon-btn filled" aria-label="Fit">${I.fit()}</button><button class="icon-btn filled" aria-label="Pause">${I.pause()}</button></div>`);
}

async function trayDevice(kind: 'default' | 'select' | 'dock'): Promise<HTMLElement> {
  const c = await cutPhoto('spice-stall-orange', 100, 1400);
  const ipad = kind === 'dock';
  const W = ipad ? 1180 : 402;
  const H = ipad ? 820 : 874;
  const sheetH = kind === 'default' ? Math.round(H * 0.35) : kind === 'select' ? Math.round(H * 0.5) : 0;
  const boardArea = ipad
    ? { x: 32, y: 132, w: 840 - 64, h: H - 132 - 96 }
    : { x: 16, y: 132, w: 370, h: H - sheetH - 132 - 84 };
  const fraction = 0.34;
  const placed = placedSet(c, fraction);
  const loose = c.pieces.filter((p) => !placed.has(p.id));
  const device = el(`<div class="device ${ipad ? 'ipad' : 'phone'}"></div>`);
  accentVars(device, c.accent);

  // board
  const [cv, ctx] = canvas(W, H);
  cv.className = 'board-canvas';
  matBackground(ctx, W, H);
  const f = fitInto(c.photo.width, c.photo.height, boardArea);
  drawLitBoard(ctx, c, placed, f, { unlit: false, frame: true, bloomScale: 1 });
  // three pieces the player has out on the mat, below-left of the frame
  const out = loose.slice(5, 8);
  out.forEach((p, i) => {
    const r = pieceRect(c, p, f);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8 * DPR;
    ctx.shadowOffsetY = 3 * DPR;
    ctx.drawImage(p.bitmap, f.x + 8 + i * r.w * 1.05, f.y + f.h + 14 + (i % 2) * 6, r.w, r.h);
    ctx.restore();
  });
  device.append(cv);
  const bar = topbar(c, placed.size);
  if (ipad) bar.style.right = '340px';
  device.append(bar);
  device.append(el(`<div class="progress-line" style="${ipad ? 'right:360px' : ''}"><i style="width:${fraction * 100}%"></i></div>`));
  const hintBottom = ipad ? 24 : sheetH + 16;
  device.append(el(`<div class="hint" style="right:${ipad ? 340 + 24 : 16}px;bottom:${hintBottom}px">${I.bulb()}<span class="count">3</span></div>`));

  // tray
  const order = [...loose].sort((a, b) => hash(`${a.id}`) - hash(`${b.id}`));
  const tray = el(
    ipad
      ? `<div class="dock"></div>`
      : `<div class="sheet" style="height:${sheetH}px"><div class="handle"></div></div>`,
  );
  const shelf = kind === 'select' || kind === 'dock' ? order.slice(0, 3) : [];
  tray.append(
    el(`<div class="tray-head"><span class="eyebrow">Tray · ${loose.length - out.length} loose</span><button class="ref-btn" aria-label="Reference photo"></button></div>`),
  );
  (tray.querySelector('.ref-btn') as HTMLElement).append(photoCanvas(c, 40, 30));
  if (shelf.length) {
    const s = el(`<div class="shelf"><span class="lab">${I.pin()}Pinned</span></div>`);
    for (const p of shelf) {
      const chip = el(`<div class="chip"></div>`);
      chip.append(chipCanvas(p, c.accent.accentTray));
      s.append(chip);
    }
    tray.append(s);
  }
  tray.append(el(lensRow(c, kind === 'dock' ? 'Colour' : 'All', ipad, ipad)));
  if (kind === 'dock') tray.append(el(colourBins(c)));
  const grid = el(`<div class="grid"></div>`);
  let list = order.slice(shelf.length);
  list.forEach((p, i) => {
    const chip = el(`<div class="chip"></div>`);
    chip.append(chipCanvas(p, c.accent.accentTray));
    if (kind === 'default' && i === 7) chip.classList.add('lift');
    if (kind === 'select' && [1, 4, 5].includes(i)) {
      chip.classList.add('sel');
      chip.append(el(`<span class="order">${[1, 4, 5].indexOf(i) + 1}</span>`));
    }
    grid.append(chip);
  });
  tray.append(grid);
  if (kind === 'select') {
    tray.append(
      el(`<div class="selbar"><span class="grow"><span class="num">3</span> selected</span><button class="btn default">Pin</button><button class="btn primary" style="background:var(--accent)">Pull out</button><button class="btn" style="color:var(--ink-secondary);background:none">Cancel</button></div>`),
    );
  }
  device.append(tray);
  if (!ipad) device.append(el(`<div class="home-ind"></div>`));
  return device;
}

// ---------------------------------------------------------------------------
// 4 · Cut animation

/**
 * Proposed timings (ms from the moment the grid arrives, which is within a
 * frame of Start). These are the spec's numbers; the player just runs them.
 */
const T = {
  photoIn: [0, 180] as const,
  sweep: [120, 620] as const,
  /** Rows lift in order across this window, never before the front has passed them. */
  lift: [560, 800] as const,
  liftAfterPass: 120,
  liftDur: 160,
  driftDelay: 100,
  colStagger: 120,
  driftK: 210, // presentation spring, ζ = 1 (d = 2√k), never the snap's 520/26
  driftDur: 380,
  sheetRise: [380, 700] as const,
  ceiling: 1400,
  afterCut: 500, // the animation never ends later than this after the last batch
};

const easeStd = (x: number) => {
  // cubic-bezier(.32,.72,0,1), solved numerically
  const cx = 3 * 0.32, bx = 3 * (0 - 0.32) - cx, ax = 1 - cx - bx;
  const cy = 3 * 0.72, by = 3 * (1 - 0.72) - cy, ay = 1 - cy - by;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const xt = ((ax * t + bx) * t + cx) * t - x;
    const d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(d) < 1e-6) break;
    t -= xt / d;
  }
  t = Math.min(1, Math.max(0, t));
  return ((ay * t + by) * t + cy) * t;
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const prog = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
/** Critically damped spring from 0 to 1, unit mass. */
const spring = (ms: number, k: number) => {
  if (ms <= 0) return 0;
  const w = Math.sqrt(k);
  const s = ms / 1000;
  return 1 - (1 + w * s) * Math.exp(-w * s);
};

interface CutScene {
  c: Cut;
  L: PlayLayout;
  f: Fit;
  dest: 'tray' | 'scatter';
  /** Offscreen layers, drawn once: the real cut outlines in light. */
  lines: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  chips: Map<number, HTMLCanvasElement>;
  /** Per piece, sheet- or mat-space destination centre and scale. */
  target: Map<number, { x: number; y: number; scale: number; inSheet: boolean; visible: boolean }>;
  schedule: Schedule;
  ipad: boolean;
}

interface Schedule {
  rowPass: number[];
  liftStart: number[];
  driftStart: Map<number, number>;
  end: number;
  cutDone: number;
}

function buildSchedule(c: Cut, cutMs: number): Schedule {
  const rows = c.geo.rows;
  const rowArrive = (r: number) => (cutMs * (r + 1)) / rows;
  // The sweep front: time-based, but never past a row the worker has not sent.
  const rowPass: number[] = [];
  for (let r = 0; r < rows; r++) {
    const byTime = T.sweep[0] + ((r + 1) / rows) * (T.sweep[1] - T.sweep[0]);
    rowPass.push(Math.max(byTime, rowArrive(r) + 40, r > 0 ? rowPass[r - 1]! : 0));
  }
  const liftStart = rowPass.map((pass, r) =>
    Math.max(T.lift[0] + (r / Math.max(1, rows - 1)) * (T.lift[1] - T.lift[0]), pass + T.liftAfterPass),
  );
  const cutDone = cutMs;
  // Stagger compresses so the last piece lands by the ceiling, or 500ms after
  // the cut when the worker is slow, whichever is later.
  const endBy = Math.max(T.ceiling, cutDone + T.afterCut);
  const driftStart = new Map<number, number>();
  for (const p of c.pieces) {
    const base = liftStart[p.row]! + T.driftDelay;
    const stagger = (p.col / Math.max(1, c.geo.cols - 1)) * T.colStagger;
    driftStart.set(p.id, Math.min(base + stagger, endBy - T.driftDur));
  }
  const end = Math.max(...[...driftStart.values()].map((v) => v + T.driftDur));
  return { rowPass, liftStart, driftStart, end, cutDone };
}

async function cutScene(dest: 'tray' | 'scatter', ipad: boolean, cutMs: number): Promise<CutScene> {
  const c = dest === 'scatter' ? await cutPhoto('mountain-lake-reflection', 12, 1400) : await cutPhoto('banff-sunrise-lake', 150, 1400);
  const W = ipad ? 1180 : 402;
  const H = ipad ? 820 : 874;
  const sheetH = !ipad && dest === 'tray' ? Math.round(H * 0.35) : 0;
  let area = ipad
    ? { x: 32, y: 132, w: 840 - 64, h: H - 132 - 96 }
    : { x: 16, y: 132, w: 370, h: H - sheetH - 132 - 84 };
  if (dest === 'scatter') area = ipad ? { x: 32, y: 132, w: 776, h: 330 } : { x: 60, y: 132, w: 282, h: 330 };
  const f = fitInto(c.photo.width, c.photo.height, area);
  const L: PlayLayout = { W, H, board: area, sheetH, dock: ipad };

  const [lines, lctx] = canvas(W, H);
  const [glow, gctx] = canvas(W, H);
  for (const [ctx2, width, blur] of [
    [lctx, 1.1, 0],
    [gctx, 2.2, 4],
  ] as const) {
    ctx2.save();
    ctx2.translate(f.x, f.y);
    ctx2.scale(f.s, f.s);
    ctx2.strokeStyle = c.accent.accentBloom;
    ctx2.lineWidth = width / f.s;
    if (blur) ctx2.filter = `blur(${blur}px)`;
    for (const o of c.outlines) ctx2.stroke(o);
    ctx2.restore();
  }

  const chips = new Map<number, HTMLCanvasElement>();
  const target = new Map<number, { x: number; y: number; scale: number; inSheet: boolean; visible: boolean }>();
  const order = [...c.pieces].sort((a, b) => hash(`${a.id}${c.id}`) - hash(`${b.id}${c.id}`));
  if (dest === 'tray') {
    const gridX = ipad ? 840 + 20 : 20;
    const gridW = ipad ? 300 : W - 40;
    const gridY = ipad ? 20 + 44 + 52 + 52 + 4 : 17 + 44 + 52 + 4; // sheet/dock-local
    const perRow = Math.floor((gridW + 8) / 64);
    const gap = (gridW - perRow * 56) / (perRow - 1);
    const visibleH = ipad ? H - gridY : sheetH - gridY;
    order.forEach((p, i) => {
      chips.set(p.id, chipCanvas(p, c.accent.accentTray));
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const y = gridY + row * 64 + 28;
      const r = pieceRect(c, p, f);
      const scale = Math.min(44 / r.w, 44 / r.h);
      target.set(p.id, { x: gridX + col * (56 + gap) + 28, y: Math.min(y, visibleH + 20), scale, inSheet: !ipad, visible: y - 28 < visibleH });
    });
  } else {
    // The guided twelve's scatter, as the spec proposes fixing it: centred under
    // the frame and wrapped to the frame's width, so fit never has to clamp.
    const perRow = 4;
    const cell = (c.geo.boardW / c.geo.cols) * c.geo.scale * f.s * 1.3;
    const r2 = rng(3);
    order.forEach((p, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = f.x + f.w / 2 + (col - (perRow - 1) / 2) * cell + (r2() - 0.5) * 8;
      const y = f.y + f.h + 40 + row * cell + cell / 2 + (r2() - 0.5) * 8;
      target.set(p.id, { x, y, scale: 1, inSheet: false, visible: true });
    });
  }
  return { c, L, f, dest, lines, glow, chips, target, schedule: buildSchedule(c, cutMs), ipad };
}

function drawSheet(ctx: CanvasRenderingContext2D, sc: CutScene, t: number, rm: boolean): number {
  const { L } = sc;
  if (sc.ipad) {
    ctx.fillStyle = '#1e232a';
    ctx.fillRect(840, 0, 340, L.H);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(840, 0, 1, L.H);
    drawTrayHead(ctx, sc, 860, 20 + 22, t);
    return 0;
  }
  if (sc.dest !== 'tray') return L.H;
  const p = rm ? (t >= 420 ? 1 : 0) : easeStd(prog(t, T.sheetRise[0], T.sheetRise[1]));
  const y = L.H - L.sheetH * p;
  if (p <= 0) return y;
  ctx.save();
  if (rm) ctx.globalAlpha = prog(t, 420, 620);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 32;
  ctx.fillStyle = '#1e232a';
  ctx.beginPath();
  ctx.roundRect(0, y, L.W, L.sheetH + 40, [22, 22, 0, 0]);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(22, y, L.W - 44, 1);
  ctx.fillStyle = '#363e49';
  ctx.beginPath();
  ctx.roundRect(L.W / 2 - 18, y + 8, 36, 5, 3);
  ctx.fill();
  drawTrayHead(ctx, sc, 20, y + 17 + 22, t);
  ctx.restore();
  return y;
}

function drawTrayHead(ctx: CanvasRenderingContext2D, sc: CutScene, x: number, y: number, t: number): void {
  const arrived = sc.c.pieces.filter((p) => t >= (sc.schedule.driftStart.get(p.id) ?? 0) + 300).length;
  ctx.font = '12px "IBM Plex Mono"';
  ctx.fillStyle = '#8a929e';
  ctx.textBaseline = 'middle';
  ctx.fillText(`TRAY · ${arrived} LOOSE`.split('').join(String.fromCharCode(8202)), x, y);
  // lens pills, as shapes
  const labels = ['All', 'Edges', 'Corners', 'Colour'];
  let lx = x;
  ctx.font = '500 14px "Inter Tight"';
  for (const [i, lab] of labels.entries()) {
    const w = ctx.measureText(lab).width + 28;
    ctx.fillStyle = i === 0 ? 'rgba(255,255,255,0.10)' : '#15181d';
    ctx.strokeStyle = '#2c333c';
    ctx.beginPath();
    ctx.roundRect(lx, y + 28, w, 36, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = i === 0 ? '#edf0f4' : '#b9c1cc';
    ctx.fillText(lab, lx + 14, y + 46);
    lx += w + 8;
  }
}

function drawCutFrame(ctx: CanvasRenderingContext2D, sc: CutScene, t: number, rm: boolean): void {
  const { c, L, f, schedule: S } = sc;
  ctx.clearRect(0, 0, L.W, L.H);
  matBackground(ctx, sc.ipad ? 840 : L.W, L.H);

  // the empty frame is there from the first frame: it is what the pieces leave behind
  ctx.strokeStyle = '#2c333c';
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(f.x) + 0.5, Math.round(f.y) + 0.5, Math.round(f.w) - 1, Math.round(f.h) - 1);

  const sheetY = drawSheet(ctx, sc, t, rm);

  if (rm) {
    // Reduced motion: photo, lines in light, then one cross-fade to the rest state.
    const restA = prog(t, 420, 620);
    ctx.save();
    ctx.globalAlpha = (1 - restA) * prog(t, 0, 120);
    ctx.drawImage(c.photo, f.x, f.y, f.w, f.h);
    ctx.globalAlpha = (1 - restA) * prog(t, 120, 240);
    ctx.drawImage(sc.lines, 0, 0, L.W, L.H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - restA) * prog(t, 120, 240) * (1 - prog(t, 240, 520)) * 0.9;
    ctx.drawImage(sc.glow, 0, 0, L.W, L.H);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = restA;
    drawRest(ctx, sc, sheetY);
    ctx.restore();
    return;
  }

  const firstLift = S.liftStart[0]!;
  const photoA = easeStd(prog(t, T.photoIn[0], T.photoIn[1]));

  // 1. the photo, whole, until the first row lifts
  if (t < firstLift) {
    ctx.save();
    ctx.globalAlpha = photoA;
    const k = 0.985 + 0.015 * photoA;
    ctx.translate(f.x + f.w / 2, f.y + f.h / 2);
    ctx.scale(k, k);
    ctx.drawImage(c.photo, -f.w / 2, -f.h / 2, f.w, f.h);
    ctx.restore();
  }

  // 2. pieces: resting ones are pixel-identical to the photo under them
  const moving: { p: CutPiece; x: number; y: number; s: number; a: number }[] = [];
  if (t >= firstLift) {
    for (const p of c.pieces) {
      const r = pieceRect(c, p, f);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const lift = easeStd(prog(t, S.liftStart[p.row]!, S.liftStart[p.row]! + T.liftDur));
      const ds = S.driftStart.get(p.id)!;
      const d = spring(t - ds, T.driftK);
      const tg = sc.target.get(p.id)!;
      let x = cx;
      let y = cy - 3 * lift;
      let s = 1 + 0.045 * lift;
      let a = 1;
      if (d > 0) {
        const ty = tg.inSheet ? sheetY + tg.y : tg.y;
        const mx = (cx + tg.x) / 2;
        const my = Math.min(cy, ty) - (sc.dest === 'tray' ? 24 : 12);
        const u = d;
        x = (1 - u) * (1 - u) * cx + 2 * (1 - u) * u * mx + u * u * tg.x;
        y = (1 - u) * (1 - u) * (cy - 3) + 2 * (1 - u) * u * my + u * u * ty;
        s = (1 + 0.045) * (1 - u) + tg.scale * u;
        if (sc.dest === 'tray') a = 1 - prog(u, 0.72, 0.97);
      }
      if (lift > 0 || d > 0) moving.push({ p, x, y, s, a });
      else ctx.drawImage(p.bitmap, r.x, r.y, r.w, r.h);
    }
  }

  // 3. the cut lines, in light, revealed by a front that follows the worker
  const rows = c.geo.rows;
  const frontRow = (() => {
    let k = 0;
    for (let r = 0; r < rows; r++) if (t >= S.rowPass[r]!) k = r + 1;
    // smooth between rows
    const r = Math.min(k, rows - 1);
    const prev = k === 0 ? T.sweep[0] : S.rowPass[k - 1]!;
    const next = S.rowPass[r]!;
    return k >= rows ? rows : k + clamp01((t - prev) / Math.max(1, next - prev));
  })();
  const slope = 0.12;
  const frontY = f.y + (frontRow / rows) * (f.h + slope * f.w) - slope * f.w;
  const linesFade = 1 - prog(t, firstLift + 40, S.liftStart[rows - 1]! + T.liftDur);
  if (t >= T.sweep[0] && linesFade > 0) {
    const clipTo = (top: number, bottom: number) => {
      ctx.beginPath();
      ctx.moveTo(f.x - 4, top);
      ctx.lineTo(f.x + f.w + 4, top + slope * f.w);
      ctx.lineTo(f.x + f.w + 4, bottom + slope * f.w);
      ctx.lineTo(f.x - 4, bottom);
      ctx.closePath();
      ctx.clip();
    };
    ctx.save();
    clipTo(f.y - slope * f.w - 4, frontY);
    ctx.globalAlpha = 0.38 * linesFade;
    ctx.drawImage(sc.lines, 0, 0, L.W, L.H);
    ctx.restore();
    // fresh cuts are bright: a band just behind the front
    const band = Math.max(70, f.h * 0.28);
    ctx.save();
    clipTo(frontY - band, frontY);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * linesFade;
    ctx.drawImage(sc.glow, 0, 0, L.W, L.H);
    ctx.globalAlpha = 0.6 * linesFade;
    ctx.drawImage(sc.lines, 0, 0, L.W, L.H);
    ctx.restore();
  }

  // 4. moving pieces on top, drawn about their centres
  for (const m of moving) {
    const r = pieceRect(c, m.p, f);
    if (m.a <= 0) continue;
    ctx.save();
    ctx.globalAlpha = m.a;
    ctx.translate(m.x, m.y);
    ctx.scale(m.s, m.s);
    ctx.drawImage(m.p.bitmap, -r.w / 2, -r.h / 2, r.w, r.h);
    ctx.restore();
  }

  // 5. chips landing in the tray
  if (sc.dest === 'tray') {
    for (const p of c.pieces) {
      const tg = sc.target.get(p.id)!;
      if (!tg.visible) continue;
      const d = spring(t - S.driftStart.get(p.id)!, T.driftK);
      const a = prog(d, 0.7, 1);
      if (a <= 0) continue;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.drawImage(sc.chips.get(p.id)!, tg.x - 28, (tg.inSheet ? sheetY : 0) + tg.y - 28, 56, 56);
      ctx.restore();
    }
  }
}

function drawRest(ctx: CanvasRenderingContext2D, sc: CutScene, sheetY: number): void {
  const { c, f } = sc;
  for (const p of c.pieces) {
    const tg = sc.target.get(p.id)!;
    if (sc.dest === 'tray') {
      if (!tg.visible) continue;
      ctx.drawImage(sc.chips.get(p.id)!, tg.x - 28, (tg.inSheet ? sheetY : 0) + tg.y - 28, 56, 56);
    } else {
      const r = pieceRect(c, p, f);
      ctx.drawImage(p.bitmap, tg.x - r.w / 2, tg.y - r.h / 2, r.w, r.h);
    }
  }
}

async function cutDevice(sc: CutScene, t: number, rm: boolean): Promise<HTMLElement> {
  const device = el(`<div class="device ${sc.ipad ? 'ipad' : 'phone'}"></div>`);
  accentVars(device, sc.c.accent);
  const [cv, ctx] = canvas(sc.L.W, sc.L.H);
  cv.className = 'board-canvas';
  drawCutFrame(ctx, sc, t, rm);
  device.append(cv);
  const tb = topbar(sc.c, 0);
  if (sc.ipad) tb.style.right = '340px';
  device.append(tb);
  if (!sc.ipad) device.append(el(`<div class="home-ind"></div>`));
  (device as HTMLElement & { draw?: (t: number) => void }).draw = (tt: number) => drawCutFrame(ctx, sc, tt, rm);
  return device;
}

// ---------------------------------------------------------------------------
// 2 · Type comparison

async function typeColumn(pair: 'A' | 'B' | 'C', label: string): Promise<HTMLElement> {
  const daily = await cutPhoto(currentDaily(), 100, 1400);
  const c = await cutPhoto('banff-sunrise-lake', 150, 900);
  const col = el(`<div class="type-col" data-pair="${pair}"><h4>${label}</h4><div class="spec"></div></div>`);
  accentVars(col, daily.accent);
  const spec = col.querySelector('.spec') as HTMLElement;
  // Pairings are page-level classes, so each column re-declares the three roles inline.
  const display = pair === 'C' ? "'Newsreader', Georgia, serif" : "'Instrument Serif', Georgia, serif";
  const meta = pair === 'A' ? "'IBM Plex Mono', monospace" : "'Inter Tight', sans-serif";
  col.style.setProperty('--f-display', display);
  col.style.setProperty('--f-meta', meta);
  col.style.setProperty('--display-track', pair === 'C' ? '-0.02em' : '-0.01em');
  const h = await hero('unplayed', daily, 200, 360, 300);
  spec.append(h);
  const card = el(`<div class="puzzle-card" style="flex-basis:auto"><div class="thumb"></div><div class="name display">${c.name}</div><div class="meta">${ring(0.62, 18, c.accent.accent)}62% · 150 pieces</div></div>`);
  card.querySelector('.thumb')!.append(boardThumb(c, 0.62, 200, 150));
  const row = el(`<div style="display:flex;gap:16px;align-items:flex-start"></div>`);
  row.append(card);
  row.append(
    el(`<div style="display:flex;flex-direction:column;gap:6px;padding-top:4px"><span class="display" style="font-size:var(--t7);line-height:.9">23</span><span class="label" style="font-size:var(--t2);color:var(--ink-secondary)">day streak</span><span class="eyebrow" style="margin-top:12px">Tray · 96 loose</span><span class="num" style="font-size:var(--t1);color:var(--ink-muted)">34 / 100</span></div>`),
  );
  spec.append(row);
  spec.append(
    el(`<div><div class="display" style="font-size:var(--t5)">Paused</div><div class="meta" style="margin-top:4px">34 of 100 placed · 12:40</div><p style="margin:12px 0 0;font-size:var(--t3);line-height:1.45;color:var(--ink-secondary)">Any photo works. Start with one you like looking at.</p></div>`),
  );
  return col;
}

function typeRamp(): HTMLElement {
  const rows: [string, string, string][] = [
    ['64 · t7', 'Streak number, completion card title', 'Same, plus the iPad Today hero title'],
    ['40 · t6', 'Daily hero title (phone)', 'Same'],
    ['28 · t5', 'Screen titles (Tessera, Paused), Collection count', 'Same'],
    ['20 · t4', 'Unused in chrome today (2 uses)', 'Puzzle names on cards and in the top bar, serif'],
    ['16 · t3', '5 uses; most body copy sits at 14', 'Body, buttons, section heads: the default'],
    ['14 · t2', '46 uses, the de facto body size', 'Metadata and secondary lines, UI face, tabular figures'],
    ['12 · t1', '41 uses; eyebrows and counts in mono', 'Eyebrows (mono, tracked) and ticking counts only'],
  ];
  return el(
    `<div class="ramp"><div class="hd">Step</div><div class="hd">Today (measured from src/ui)</div><div class="hd">Proposed role</div>${rows
      .map(([a, b, c]) => `<div class="num">${a}</div><div>${b}</div><div style="color:var(--ink-primary)">${c}</div>`)
      .join('')}</div>`,
  );
}

// ---------------------------------------------------------------------------
// page

let dailyId = 'misty-forest-lake';
const currentDaily = () => dailyId;

async function renderToday(): Promise<void> {
  const phones = document.getElementById('today-phones')!;
  const ipad = document.getElementById('today-ipad')!;
  phones.replaceChildren();
  ipad.replaceChildren();
  phones.append(
    framed(
      await todayPhone('unplayed', dailyId),
      '<b>Returning, daily not yet played.</b> The photo is the screen. One primary action, in the daily photo\'s extracted accent. The rail\'s thumbnails show the photo unlit with your progress lit: an early board no longer reads as a black rectangle.',
    ),
    framed(
      await todayPhone('progress', dailyId),
      '<b>Daily in progress.</b> The hero becomes the live board (unlit photo, lit progress, real bloom) with its ring and "Keep going". No second save path: it is the library entry for <span class="num">daily-YYYY-MM-DD</span>.',
    ),
    framed(
      await todayPhone('done', dailyId),
      '<b>Daily done.</b> The badge carries its word. The primary action leaves the hero; "See your card" reopens the completion card from <span class="num">completions</span>. The tab dot clears.',
    ),
    framed(
      await todayPhone('first', dailyId, { offline: true }),
      '<b>First visit after the guided twelve, offline.</b> No rail, an invitation instead of an empty state, a zero streak that does not scold, and an empty mosaic that says what will fill it. The offline row is inline, never fixed over a button.',
    ),
    framed(
      await todayPhone('unplayed', dailyId, { tall: 1268 }),
      '<b>Scrolled length.</b> Streak and collection sit below the rail as two compact cards that lead into the Daily hub and the Collection tab. The install row is last, web only.',
    ),
  );
  ipad.append(
    framed(
      await todayIpad(dailyId),
      '<b>iPad landscape.</b> The floating tab bar stays (v2 spec). Hero and the two compact cards share one row; the rail runs below. The hero title steps up to 64.',
      true,
    ),
  );
}

async function renderType(): Promise<void> {
  const host = document.getElementById('type-compare')!;
  host.replaceChildren(
    await typeColumn('A', 'A · As shipped: Instrument Serif, Inter Tight, Plex Mono for metadata'),
    await typeColumn('B', 'B · Recommended: same families; mono only for eyebrows and ticking numerals'),
    await typeColumn('C', 'C · Alternative: Newsreader display (+1.4 KB), roles as B'),
  );
  document.getElementById('type-ramp')!.replaceChildren(typeRamp());
}

async function renderTray(): Promise<void> {
  document.getElementById('tray-phones')!.replaceChildren(
    framed(
      await trayDevice('default'),
      '<b>Default detent (35%).</b> One header row: the "tray · N loose" eyebrow and the reference photo as a 44pt thumbnail (it replaces the full-width "Reference photo · Hide" row). Pill lenses with mono counts. Chips are the real piece silhouette on the sheet, no square cell; the edge notch stays. One chip is shown pressed: it lifts 1.06. Hint is the 52pt lightbulb with its count, 16pt above the sheet and clear of the frame.',
    ),
    framed(
      await trayDevice('select'),
      '<b>Select mode, half detent.</b> The shelf is a recessed well, labelled with a pin glyph, above the lenses. Selected chips take an order numeral (never colour alone). The selection bar replaces nothing on the board.',
    ),
  );
  document.getElementById('tray-ipad')!.replaceChildren(
    framed(
      await trayDevice('dock'),
      '<b>iPad landscape dock (right; mirrored when Tray side is Left).</b> Lenses wrap rather than scroll; the Colour lens shows its bins as swatch-plus-numeral pills. Region is enabled here because the player has zoomed past 1.5×.',
      true,
    ),
  );
}

let players: { draw: (t: number) => void; end: number }[] = [];
async function renderCut(): Promise<void> {
  const slow = (document.getElementById('cut-slow') as HTMLInputElement).checked;
  const rm = (document.getElementById('cut-rm') as HTMLInputElement).checked;
  const dest = (document.getElementById('cut-dest') as HTMLSelectElement).value as 'tray' | 'scatter';
  const cutMs = slow ? 2400 : 900;
  const host = document.getElementById('cut-players')!;
  host.replaceChildren();
  players = [];
  for (const ipad of [false, true]) {
    const sc = await cutScene(dest, ipad, cutMs);
    const d = await cutDevice(sc, 0, rm);
    players.push({ draw: (d as HTMLElement & { draw: (t: number) => void }).draw, end: rm ? 620 : sc.schedule.end });
    host.append(
      framed(
        d,
        ipad
          ? `<b>iPad landscape.</b> Pieces drift into the dock, which is already there.`
          : `<b>Phone.</b> ${dest === 'tray' ? `${sc.c.pieces.length} pieces` : 'The guided twelve'}; cut ${cutMs} ms; animation ends at <span class="num">${Math.round(rm ? 620 : sc.schedule.end)} ms</span>.`,
        ipad,
      ),
    );
  }
  const scrub = document.getElementById('cut-scrub') as HTMLInputElement;
  scrub.max = String(Math.ceil(Math.max(...players.map((p) => p.end)) + 100));
  drawAt(Number(scrub.value));
}

function drawAt(t: number): void {
  for (const p of players) p.draw(t);
  (document.getElementById('cut-time') as HTMLOutputElement).value = `${Math.round(t)} ms`;
}

async function renderFrames(): Promise<void> {
  const host = document.getElementById('cut-frames')!;
  const hostI = document.getElementById('cut-frames-ipad')!;
  const sc = await cutScene('tray', false, 900);
  const sci = await cutScene('tray', true, 900);
  const frames: [number, string][] = [
    [90, 'Photo arrives framed, 0.985 → 1 over 180 ms. The empty frame is already under it.'],
    [330, 'Cut lines trace down the photo in the bloom accent. Fresh cuts glow, then settle to a hairline.'],
    [560, 'The sweep finishes on the last row the worker has sent: it never outruns the cut. The sheet is rising.'],
    [720, 'Rows lift in order, 1.045 and 3pt up. The gaps that open are the mat.'],
    [930, 'Pieces arc into the tray on a critically damped spring; each chip fades in where its piece lands.'],
    [1150, 'The last rows land. The sheet is already at its 35% detent.'],
    [1450, 'Rest. Every animation source has retired; the board is idle and draws nothing.'],
  ];
  host.replaceChildren();
  hostI.replaceChildren();
  for (const [t, text] of frames) {
    const d = await cutDevice(sc, t, false);
    const fr = el(`<div class="frame"><div class="holder"></div><div class="caption"><span class="num">${t} ms</span>${text}</div></div>`);
    fr.querySelector('.holder')!.append(d);
    host.append(fr);
  }
  for (const [t, text] of [frames[1]!, frames[3]!, frames[4]!, frames[6]!] as [number, string][]) {
    const d = await cutDevice(sci, t, false);
    const fr = el(`<div class="frame ipad"><div class="holder"></div><div class="caption"><span class="num">${t} ms</span>${text}</div></div>`);
    fr.querySelector('.holder')!.append(d);
    hostI.append(fr);
  }
}

async function main(): Promise<void> {
  await document.fonts.ready;
  const pairing = document.getElementById('pairing') as HTMLSelectElement;
  pairing.addEventListener('change', () => (document.documentElement.dataset.type = pairing.value));
  const dailySel = document.getElementById('daily-photo') as HTMLSelectElement;
  for (const p of CURATED_PHOTOS) dailySel.append(new Option(p.name, p.id, false, p.id === dailyId));
  dailySel.addEventListener('change', async () => {
    dailyId = dailySel.value;
    await renderToday();
    await renderType();
  });

  await renderToday();
  await renderType();
  await renderTray();
  await renderCut();
  await renderFrames();

  const scrub = document.getElementById('cut-scrub') as HTMLInputElement;
  scrub.addEventListener('input', () => drawAt(Number(scrub.value)));
  for (const id of ['cut-slow', 'cut-rm', 'cut-dest']) document.getElementById(id)!.addEventListener('change', () => void renderCut());
  let raf = 0;
  document.getElementById('cut-play')!.addEventListener('click', () => {
    cancelAnimationFrame(raf);
    const speed = (document.getElementById('cut-half') as HTMLInputElement).checked ? 0.25 : 1;
    const start = performance.now();
    const end = Number(scrub.max);
    const step = (now: number) => {
      const t = Math.min(end, (now - start) * speed);
      scrub.value = String(t);
      drawAt(t);
      if (t < end) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
  document.body.dataset.ready = '1';
}

void main();
