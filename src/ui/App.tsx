/**
 * The product shell.
 *
 * **The board never re-renders through React** (§03). `PlayRuntime` is created
 * once against a ref'd `<div>` and then owns the canvas, the camera, the
 * session, the audio and the frame loop; what crosses back into React is a
 * handful of numbers that change at human speed. Every render of this component
 * is a lens change, a placement, or a resize — never a drag frame.
 *
 * The tray is fed from `TrayModel`, which is recomputed here rather than
 * memoised on piece identity: it is a walk over 250 records on a lens change, and
 * a stale answer would draw a chip for a piece sitting on the mat.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSyntheticImage } from '@/dev/synthetic-image';
import type { PieceId } from '@/cut/types';
import { PlayRuntime } from '@/play/runtime';
import type { RuntimeSummary } from '@/play/runtime';
import type { Lens } from '@/tray/lenses';
import { DOCK_QUERY, useMediaQuery } from './useMediaQuery';
import { useChrome } from './store';
import { Tray } from './Tray';
import { useTrayDrag } from './useTrayDrag';
import { TopBar } from './TopBar';

/** Step 5 brings the real photo picker; until then the cut needs *a* photo. */
const SEED = 1;
const TARGET_COUNT = 200;

export function App(): React.ReactElement {
  const boardRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<PlayRuntime | null>(null);

  const [summary, setSummary] = useState<RuntimeSummary>({
    status: 'cutting',
    cut: { done: 0, total: 0, cols: 0, rows: 0 },
    placed: 0,
    total: 0,
    regionUnlocked: false,
    regionRevision: 0,
    trayRevision: 0,
  });

  const docked = useMediaQuery(DOCK_QUERY);
  const chrome = useChrome();

  // Read through a ref so the runtime's callbacks never close over a stale
  // layout — the tray's rectangle moves every time the dock is resized.
  const overTray = useRef<(client: { x: number; y: number }) => boolean>(() => false);
  overTray.current = (client) => {
    const rect = trayRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return (
      client.x >= rect.left &&
      client.x <= rect.right &&
      client.y >= rect.top &&
      client.y <= rect.bottom
    );
  };

  // -- the runtime, mounted once ---------------------------------------------

  useEffect(() => {
    const container = boardRef.current;
    if (!container) return;

    let live = true;
    let instance: PlayRuntime | null = null;

    void (async () => {
      const source = await createSyntheticImage();
      if (!live) return;

      instance = new PlayRuntime({
        container,
        source,
        seed: SEED,
        targetCount: TARGET_COUNT,
        isOverTray: (client) => overTray.current(client),
        onDragStateChange: (dragging) => {
          // §06: dragging a piece out auto-collapses the sheet to peek and
          // re-expands on release, so the mat is never obscured mid-drag.
          const store = useChrome.getState();
          if (dragging) store.collapseForDrag();
          else store.restoreAfterDrag();
        },
        notify: setSummary,
      });

      runtime.current = instance;
      void instance.start();
    })();

    return () => {
      live = false;
      instance?.destroy();
      runtime.current = null;
    };
  }, []);

  // The dock's inner edge changes the board's viewport, and a window resize
  // event never fires for it. Without this the camera silently stops matching
  // the canvas and every hit test lands in the wrong place.
  useEffect(() => {
    const container = boardRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => runtime.current?.resize());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // §08: unlock the audio context on the first deliberate tap, and never before
  // — iOS leaves it suspended otherwise and the first snap of the session is
  // silent.
  useEffect(() => {
    const unlock = (): void => {
      runtime.current?.unlockAudio();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // §05: `interrupted` is a first-class state, not an error path.
  useEffect(() => {
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') runtime.current?.interrupt();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, []);

  // Keep the chrome store in step with the runtime, and only when it changes.
  useEffect(() => {
    useChrome.getState().setStatus(summary.status);
    useChrome.getState().setCut(summary.cut);
    useChrome.getState().setProgress(summary.placed, summary.total);
    useChrome.getState().setRegionUnlocked(summary.regionUnlocked);
  }, [summary]);

  // -- the tray --------------------------------------------------------------

  const tray = runtime.current?.tray ?? null;
  const session = runtime.current?.session ?? null;

  const view = useMemo(() => {
    if (!tray) {
      return { ids: [] as PieceId[], counts: new Map<Lens, { count: number; enabled: boolean }>() };
    }
    const region = runtime.current?.visibleRegion() ?? null;
    return {
      ids: tray.visible(chrome.lens, chrome.lensArg, region),
      counts: new Map(
        tray.lensCounts(region).map((entry) => [entry.lens, entry] as const),
      ),
    };
    // `trayRevision` and `regionRevision` are the runtime saying "this answer is
    // stale now" — they are the whole subscription, and neither ticks per frame.
  }, [tray, chrome.lens, chrome.lensArg, summary.trayRevision, summary.regionRevision]);

  const binCount = useCallback(
    (bin: number) => tray?.binCount(bin, runtime.current?.visibleRegion() ?? null) ?? 0,
    [tray, summary.trayRevision, summary.regionRevision],
  );

  const { onChipPointerDown } = useTrayDrag({
    onPullOut: (pieceId, event) => runtime.current?.pullFromTray(pieceId, event) ?? false,
  });

  return (
    <div className="flex h-full w-full bg-[var(--mat-void)]">
      <div className="relative min-w-0 flex-1">
        {/* The canvas layers live in here and React never touches them again. */}
        <div ref={boardRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

        <TopBar
          status={summary.status}
          placed={summary.placed}
          total={summary.total}
          cut={summary.cut}
          onFit={() => runtime.current?.fit()}
        />
      </div>

      <Tray
        rootRef={trayRef}
        docked={docked}
        width={chrome.trayWidth}
        detent={chrome.detent}
        onWidth={chrome.setTrayWidth}
        onDetent={chrome.setDetent}
        lens={chrome.lens}
        lensArg={chrome.lensArg}
        counts={view.counts}
        bins={tray?.bins ?? []}
        binCount={binCount}
        onPick={(lens, arg) => chrome.setLens(lens, arg ?? null)}
        ids={view.ids}
        remaining={summary.total - summary.placed}
        bitmapOf={(id) => runtime.current?.bitmapOf(id) ?? null}
        isEdge={(id) => tray?.isEdge(id) ?? false}
        isOnMat={(id) => session?.locationOf(id) === 'mat'}
        onChipPointerDown={onChipPointerDown}
        onLocate={(id) => runtime.current?.locate(id)}
      />
    </div>
  );
}
