/**
 * Dev harness for steps 1–2 — hardcoded photo, no product UI.
 *
 * Step 1 asked three questions: does the cut look cut, do the tabs interlock, and
 * does an idle board really schedule no frames. Step 2 adds the only one that
 * matters more than those:
 *
 *   **does the snap feel right in the hand?**
 *
 * That is not a question this file can answer — §17 budgets a week of tuning on
 * an iPad for it, and §08's gate is that it must feel complete on a silent
 * device. What this file can do is put every dial next to the board: tolerance,
 * rotation, reduced motion, and audio, all switchable without a reload, so the
 * week of tuning is spent tuning rather than rebuilding.
 *
 * Deleted at step 5, when the real setup screen lands.
 */

import { cutInWorker } from '@/cut/cut-client';
import type { CutPiece } from '@/cut/types';
import type { SnapDifficulty } from '@/board/snap';
import { AudioEngine } from '@/audio/engine';
import { BoardControls } from '@/input/board-controls';
import { PlaySession } from '@/play/session';
import { clampZoom, createCamera, fitCameraToBounds, fitScale, relativeZoom } from '@/render/camera';
import type { Camera } from '@/render/camera';
import { Renderer } from '@/render/renderer';
import { emptyScene } from '@/render/scene';
import type { Scene, ScenePiece } from '@/render/scene';
import { createSyntheticImage } from './synthetic-image';
import { scatterPieces } from './scatter';

const el = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`harness: missing #${id}`);
  return found as T;
};

const ui = {
  board: el<HTMLDivElement>('board'),
  status: el('status'),
  grid: el('grid'),
  pieces: el('pieces'),
  cutms: el('cutms'),
  zoom: el('zoom'),
  drawn: el('drawn'),
  frames: el('frames'),
  sched: el('sched'),
  placed: el('placed'),
  count: el<HTMLSelectElement>('count'),
  tolerance: el<HTMLSelectElement>('tolerance'),
  rotation: el<HTMLInputElement>('rotation'),
  reduced: el<HTMLInputElement>('reduced'),
  sound: el<HTMLInputElement>('sound'),
  recut: el<HTMLButtonElement>('recut'),
  solve: el<HTMLButtonElement>('solve'),
  fit: el<HTMLButtonElement>('fit'),
};

const renderer = new Renderer({ container: ui.board });
const audio = new AudioEngine();

let camera: Camera = createCamera();
let scene: Scene = emptyScene();
let session: PlaySession | null = null;
let controls: BoardControls | null = null;
let seed = 1;
let boardW = 0;
let boardH = 0;
/** Image pixels per world unit — the units piece outlines are in. */
let pathScale = 1;

/**
 * Pieces drawn while the cut is still running.
 *
 * The session cannot exist until every piece has arrived — the adjacency graph
 * references ids that may not have been cut yet — but §04 asks for pieces
 * materialising onto the mat as they come back from the worker, which "turns
 * loading into the first moment of delight". So the arriving batches are drawn
 * directly until the board takes over.
 */
let materialising: ScenePiece[] = [];

/** The rAF pump. Runs only while something is actually moving. */
let pumping = false;
let lastFrameMs = 0;

function render(): void {
  scene = session
    ? session.scene()
    : { ...emptyScene(), boardW, boardH, loose: [...materialising] };
  renderer.draw(scene, camera);
  // Zoom as the player reads it: 1× is the whole board on screen, not one
  // screen pixel per world unit.
  ui.zoom.textContent = `${relativeZoom(camera.zoom, fitScale(renderer.size, boardW, boardH)).toFixed(2)}×`;
  if (session) {
    const { placed, total } = session.summary;
    ui.placed.textContent = `${placed} / ${total}`;
  }

  // Read after the frame lands, so the numbers describe a real pass.
  requestAnimationFrame(() => {
    ui.drawn.textContent = `${renderer.stats.lastDynamicCount + renderer.stats.lastStaticCount}`;
    ui.frames.textContent = `${renderer.stats.frames}`;
    ui.sched.textContent = renderer.isScheduled ? 'yes' : 'no';
  });
}

/**
 * Keep drawing while a spring is running or a finger is down, and stop dead
 * otherwise — "on an idle board with no finger down the app draws nothing at
 * all" (§03) is a property of this loop, not of the renderer.
 */
function pump(now: number): void {
  const dt = lastFrameMs === 0 ? 1000 / 60 : now - lastFrameMs;
  lastFrameMs = now;

  controls?.tick(now);
  audio.tick(now);
  const stillMoving = session?.advance(dt) ?? false;
  // `pressing` counts as busy, or the long-press timer never gets a tick to
  // fire on — a finger held still would be a finger nothing is listening to.
  const phase = controls?.machine.phase;
  const handDown = phase === 'dragging' || phase === 'pressing';

  render();

  if (stillMoving || handDown) {
    requestAnimationFrame(pump);
  } else {
    pumping = false;
    lastFrameMs = 0;
    renderer.stopAnimating('play');
  }
}

function wake(): void {
  if (pumping) return;
  pumping = true;
  lastFrameMs = 0;
  renderer.startAnimating('play');
  requestAnimationFrame(pump);
}

function difficulty(): SnapDifficulty {
  return ui.tolerance.value as SnapDifficulty;
}

/**
 * Frame the board and everything scattered around it.
 *
 * Clamped against the board's own fit scale, which is what 1× means — the zoom
 * range is 0.5×–4× *of the fitted board*, never of a world unit.
 */
function frameContent(): void {
  if (boardW <= 0 || boardH <= 0) return;
  const bounds = session
    ? session.contentBounds()
    : { x: 0, y: 0, w: boardW, h: boardH };
  const framed = fitCameraToBounds(renderer.size, bounds);
  camera = { ...framed, zoom: clampZoom(framed.zoom, fitScale(renderer.size, boardW, boardH)) };
}

function buildSession(pieces: CutPiece[], boardW: number, boardH: number): PlaySession {
  const play = new PlaySession({
    pieces,
    boardW,
    boardH,
    pathScale,
    // Steps 1–2 scatter everything across the mat, because judging the snap
    // needs pieces to be *on* something. The tray (§06) is the product's model
    // and lives in the shell at `/`; this page predates it by two steps.
    startInTray: false,
    difficulty: difficulty(),
    rotation: ui.rotation.checked,
    reducedMotion: ui.reduced.checked,
    onEvent: (event) => {
      if (!ui.sound.checked) return;
      const now = performance.now();
      switch (event.type) {
        case 'grab':
          void audio.play('pickup', { nowMs: now });
          break;
        case 'snap':
          // A merge that pulled in more than the piece itself is a chord, not a
          // note, voiced by how much just joined (§08).
          audio.play(event.mergedClusters > 1 ? 'groupMerge' : 'snap', {
            clusterSize: event.mergedSize,
            nowMs: now,
          });
          break;
        case 'miss':
          audio.play('invalidDrop', { nowMs: now });
          break;
        case 'edgeFrame':
          audio.play('edgeFrame', { nowMs: now });
          break;
        case 'complete':
          audio.play('completion', { nowMs: now });
          break;
      }
    },
  });

  for (const position of scatterPieces(pieces, { seed, boardW, boardH })) {
    play.board.moveCluster(play.board.clusterIdOf(position.id), position.x, position.y);
  }
  play.rebuild();
  return play;
}

async function runCut(): Promise<void> {
  const targetCount = Number(ui.count.value);
  seed++;

  ui.status.textContent = 'cutting';
  ui.cutms.textContent = '—';
  ui.pieces.textContent = '0';

  controls?.destroy();
  controls = null;
  session = null;
  materialising = [];
  boardW = 0;
  boardH = 0;
  render();

  const source = await createSyntheticImage();

  try {
    const result = await cutInWorker({
      source,
      seed,
      targetCount,
      handlers: {
        onGrid: (grid) => {
          // The real number, never the target (§04).
          ui.grid.textContent = `${grid.cols} × ${grid.rows} = ${grid.count}`;
          boardW = grid.boardW;
          boardH = grid.boardH;
          pathScale = grid.scale;
          frameContent();
          render();
        },
        onPieces: (batch, done, total) => {
          // Pieces materialise onto the mat as they arrive from the worker (§04).
          for (const position of scatterPieces(batch, { seed, boardW, boardH })) {
            const piece = batch.find((p) => p.id === position.id)!;
            materialising.push({
              id: piece.id,
              x: position.x,
              y: position.y,
              w: piece.worldW,
              h: piece.worldH,
              rot: 0,
              bitmap: piece.bitmap,
              path: piece.path,
              pathScale,
            });
          }
          ui.pieces.textContent = `${done} / ${total}`;
          render();
        },
        onError: (message) => {
          ui.status.textContent = 'error';
          console.error('[cut]', message);
        },
      },
    });

    // The board takes over from the materialising preview, on the same scatter
    // seed, so nothing visibly jumps at the handover.
    materialising = [];
    session = buildSession(result.pieces, boardW, boardH);
    controls = new BoardControls({
      element: ui.board,
      session,
      getViewport: () => renderer.size,
      getCamera: () => camera,
      setCamera: (next) => {
        camera = next;
        render();
      },
      getBoard: () => ({ w: boardW, h: boardH }),
      onChange: wake,
    });
    frameContent();
    render();

    ui.status.textContent = 'ready';
    // §04 budgets under 1.2s on an iPhone 12. Flagged so a regression is visible
    // on the device rather than in a profiler afterwards.
    const overBudget = result.elapsedMs > 1200;
    ui.cutms.textContent = `${Math.round(result.elapsedMs)}ms${overBudget ? ' ⚠' : ''}`;
  } catch (error) {
    ui.status.textContent = 'failed';
    ui.grid.textContent = '—';
    console.error(error);
  }
}

/** Drop every remaining piece into its slot, to inspect the seams. */
function solve(): void {
  const play = session;
  if (!play) return;
  for (const piece of [...play.board.pieces]) {
    const cluster = play.board.clusterIdOf(piece.id);
    if (play.board.isPlaced(piece.id)) continue;
    play.board.moveCluster(cluster, piece.targetX, piece.targetY);
    play.release(cluster, { x: 0, y: 0 });
  }
  play.rebuild();
  wake();
}

ui.recut.addEventListener('click', () => void runCut());
ui.count.addEventListener('change', () => void runCut());
ui.tolerance.addEventListener('change', () => void runCut());
ui.rotation.addEventListener('change', () => void runCut());
ui.reduced.addEventListener('change', () => void runCut());
ui.solve.addEventListener('click', solve);
ui.fit.addEventListener('click', () => {
  controls?.camera.fit();
  render();
});

// §08: unlock the context on the first deliberate tap, and never before — iOS
// leaves it suspended otherwise, and the first snap of the session is silent.
const unlock = (): void => {
  void audio.unlock();
  window.removeEventListener('pointerdown', unlock);
};
window.addEventListener('pointerdown', unlock);

// §05: `interrupted` is a first-class state. Let go of everything, rather than
// coming back to a piece welded to a finger that no longer exists.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    controls?.interrupt();
    audio.suspend();
  }
});

window.addEventListener('resize', () => {
  renderer.resize();
  render();
});

void runCut();
