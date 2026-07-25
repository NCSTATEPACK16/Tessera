/**
 * Step 1 dev harness — the cutter and the renderer, hardcoded photo, no UI.
 *
 * Exists to answer three questions on real hardware, which is the step 1 gate:
 *   does the cut look cut, rather than stamped?
 *   do the tabs interlock exactly?
 *   does an idle board really schedule no frames?
 *
 * The HUD reports the last one directly. Deleted when the real setup screen
 * lands at step 5.
 */

import { cutInWorker, cutPixelRatio } from '@/cut/cut-client';
import type { CutPiece } from '@/cut/types';
import { createCamera, fitCamera } from '@/render/camera';
import type { Camera } from '@/render/camera';
import { CameraControls } from '@/render/camera-controls';
import { Renderer } from '@/render/renderer';
import type { Scene, ScenePiece } from '@/render/scene';
import { createSyntheticImage } from './synthetic-image';
import { scatterPieces, solvedPiece } from './scatter';

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
  count: el<HTMLSelectElement>('count'),
  recut: el<HTMLButtonElement>('recut'),
  toggle: el<HTMLButtonElement>('toggle'),
  fit: el<HTMLButtonElement>('fit'),
};

const renderer = new Renderer({ container: ui.board });

let camera: Camera = createCamera();
let scene: Scene = {
  finish: 'felt',
  boardW: 0,
  boardH: 0,
  placed: [],
  loose: [],
  held: [],
  completion: 0,
};

let cutPieces: CutPiece[] = [];
let scattered: ScenePiece[] = [];
let solved = false;
let seed = 1;

const controls = new CameraControls({
  element: ui.board,
  getViewport: () => renderer.size,
  getCamera: () => camera,
  setCamera: (next) => {
    camera = next;
    render();
  },
  getBoard: () => ({ w: scene.boardW, h: scene.boardH }),
});

function render(): void {
  renderer.draw(scene, camera);
  ui.zoom.textContent = `${camera.zoom.toFixed(2)}×`;

  // Read after the frame lands, so the numbers describe a real pass.
  requestAnimationFrame(() => {
    ui.drawn.textContent = `${renderer.stats.lastDynamicCount + renderer.stats.lastStaticCount}`;
    ui.frames.textContent = `${renderer.stats.frames}`;
    ui.sched.textContent = renderer.isScheduled ? 'yes' : 'no';
  });
}

/** Swap between scattered and solved, to eyeball the seams. */
function applyLayout(): void {
  const scale = cutPixelRatio();
  scene = {
    ...scene,
    placed: solved ? cutPieces.map((p) => solvedPiece(p, scale)) : [],
    loose: solved ? [] : scattered,
    completion: solved ? 1 : 0,
  };
  ui.toggle.textContent = solved ? 'Scatter' : 'Solve';
  render();
}

async function runCut(): Promise<void> {
  const targetCount = Number(ui.count.value);
  seed++;

  ui.status.textContent = 'cutting';
  ui.cutms.textContent = '—';
  ui.pieces.textContent = '0';

  cutPieces = [];
  scattered = [];
  scene = { ...scene, placed: [], loose: [], completion: 0 };
  render();

  const source = await createSyntheticImage();
  const scale = cutPixelRatio();

  try {
    const result = await cutInWorker({
      source,
      seed,
      targetCount,
      handlers: {
        onGrid: (grid) => {
          // The real number, never the target (§04).
          ui.grid.textContent = `${grid.cols} × ${grid.rows} = ${grid.count}`;
          scene = { ...scene, boardW: grid.boardW, boardH: grid.boardH };
          camera = fitCamera(renderer.size, grid.boardW, grid.boardH);
          render();
        },
        onPieces: (batch, done, total) => {
          // Pieces materialise onto the mat as they arrive from the worker —
          // "it turns loading into the first moment of delight" (§04).
          cutPieces.push(...batch);
          scattered.push(
            ...scatterPieces(batch, {
              seed,
              boardW: scene.boardW,
              boardH: scene.boardH,
              bitmapScale: scale,
            }),
          );
          scene = { ...scene, loose: [...scattered] };
          ui.pieces.textContent = `${done} / ${total}`;
          render();
        },
        onError: (message) => {
          ui.status.textContent = 'error';
          console.error('[cut]', message);
        },
      },
    });

    cutPieces = result.pieces;
    solved = false;
    applyLayout();

    ui.status.textContent = 'ready';
    // §04 budgets under 1.2s on an iPhone 12. Flagged so a regression is
    // visible on the device rather than in a profiler afterwards.
    const overBudget = result.elapsedMs > 1200;
    ui.cutms.textContent = `${Math.round(result.elapsedMs)}ms${overBudget ? ' ⚠' : ''}`;
  } catch (error) {
    ui.status.textContent = 'failed';
    ui.grid.textContent = '—';
    console.error(error);
  }
}

ui.recut.addEventListener('click', () => void runCut());
ui.count.addEventListener('change', () => void runCut());
ui.fit.addEventListener('click', () => {
  controls.fit();
});
ui.toggle.addEventListener('click', () => {
  solved = !solved;
  applyLayout();
});

window.addEventListener('resize', () => {
  renderer.resize();
  render();
});

void runCut();
