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
import type { PieceId } from '@/cut/types';
import { MOVE_THRESHOLD_PX } from '@/input/pointer';
import { PlayRuntime } from '@/play/runtime';
import type { RuntimeSummary } from '@/play/runtime';
import { fallbackAccentTokens } from '@/render/accent';
import type { Lens } from '@/tray/lenses';
import { DOCK_QUERY, useMediaQuery } from './useMediaQuery';
import { useChrome } from './store';
import { Tray } from './Tray';
import { TopBar } from './TopBar';
import { HintButton } from './HintButton';
import { PhotoPicker } from './PhotoPicker';
import type { PhotoChoice } from './PhotoPicker';
import { PhotoCrop } from './PhotoCrop';
import type { PhotoCropResult } from './PhotoCrop';
import { PuzzleSetup } from './PuzzleSetup';
import type { PuzzleConfig } from '@/play/setup';
import { renderCuratedPhoto } from '@/play/curated';
import { downscaleTarget } from '@/play/photo';

/**
 * Reads a File's natural pixel size without allocating a persistent
 * ImageBitmap — used only to size the resize options passed to the real
 * decode in `handlePhotoChosen`. `Image.decode()` still rasterises once, but
 * nothing keeps that decode alive: the object URL is revoked and the
 * `Image` dropped immediately after, unlike an undisposed `createImageBitmap`
 * result.
 */
async function probeImageSize(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * CLAUDE.md "Hard numbers": source downscale, max 2560px long edge. Applied
 * at decode time for uploads so `PhotoCrop`'s live-preview canvas and its
 * `rasterizeCrop` pass never allocate multiple full-resolution (12MP+)
 * surfaces at once — the final cut output was already capped later in the
 * pipeline, but the intermediate canvases were not.
 */
async function decodeUpload(file: File): Promise<ImageBitmap> {
  const size = await probeImageSize(file);
  const target = downscaleTarget(size.width, size.height);
  if (target.width === size.width && target.height === size.height) {
    return createImageBitmap(file);
  }
  return createImageBitmap(file, {
    resizeWidth: target.width,
    resizeHeight: target.height,
    resizeQuality: 'high',
  });
}

export function App(): React.ReactElement {
  const boardRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const shelfRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<PlayRuntime | null>(null);

  type SetupPhase =
    | { kind: 'picker'; error: string | null }
    | { kind: 'cropping'; source: ImageBitmap }
    | { kind: 'configuring'; source: ImageBitmap; seed: number };

  const [setupPhase, setSetupPhase] = useState<SetupPhase>({ kind: 'picker', error: null });
  const [playConfig, setPlayConfig] = useState<
    ({ source: ImageBitmap; seed: number } & PuzzleConfig) | null
  >(null);

  // Human-speed, not per-frame: flips once when a chip leaves or returns to the
  // tray, never during the drag itself. Drives the shelf's dashed placeholder.
  const [dragging, setDragging] = useState(false);
  // The group chip under a tap, mid-rename. `null` is "no rename open".
  const [renaming, setRenaming] = useState<number | null>(null);
  // 0 when docked (the tray is a flex sibling, not an overlay). See `updateInsets`.
  const [trayHeight, setTrayHeight] = useState(0);

  const [summary, setSummary] = useState<RuntimeSummary>({
    status: 'cutting',
    cut: { done: 0, total: 0, cols: 0, rows: 0 },
    placed: 0,
    total: 0,
    regionUnlocked: false,
    regionRevision: 0,
    trayRevision: 0,
    hintTarget: null,
    hintsUsed: 0,
    accent: fallbackAccentTokens(),
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

  // Same test, one region smaller (§06) — a release over the shelf row pins
  // rather than just returning. The shelf renders only while a drag is in
  // flight or it is non-empty, so `shelfRef.current` is null exactly when there
  // is nothing to pin onto, and this correctly answers "no".
  const overShelf = useRef<(client: { x: number; y: number }) => boolean>(() => false);
  overShelf.current = (client) => {
    const rect = shelfRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return (
      client.x >= rect.left &&
      client.x <= rect.right &&
      client.y >= rect.top &&
      client.y <= rect.bottom
    );
  };

  // Shared by the mount effect and the resize effect below, so there is one
  // place that knows how to compute insets rather than two branches that can
  // drift. Keyed on `docked` because the docked tray contributes nothing (a
  // flex sibling already out of the board container) while the phone sheet's
  // height is the whole point.
  const updateInsets = useCallback((): void => {
    const rect = trayRef.current?.getBoundingClientRect();
    if (docked || !rect) {
      runtime.current?.setTrayInsets({ left: 0, right: 0, top: 0, bottom: 0 });
      setTrayHeight(0);
    } else {
      runtime.current?.setTrayInsets({ left: 0, right: 0, top: 0, bottom: rect.height });
      // The hint button's own floor: the sheet is a fixed overlay across the
      // bottom of the viewport, at every detent, and a button bottom-anchored
      // to the raw viewport sits underneath it — visible in neither layout nor
      // hit-testing. `test/browser/hints.spec.ts` caught this on the phone
      // project; the dock passed because the docked tray is a flex sibling and
      // never overlaps the board at all.
      setTrayHeight(rect.height);
    }
  }, [docked]);

  // -- the setup flow: picker -> crop -> playConfig ---------------------------

  const handlePhotoChosen = useCallback(async (choice: PhotoChoice): Promise<void> => {
    try {
      const bitmap =
        choice.kind === 'curated' ? await renderCuratedPhoto(choice.id) : await decodeUpload(choice.file);
      // A previous round trip through crop (picker -> crop -> picker -> pick
      // again) would otherwise leak that bitmap's off-heap backing store —
      // GC does not reliably reclaim ImageBitmaps promptly. `onBack` already
      // closes it on the normal path; this is the defensive twin for any
      // other route back into this handler while a cropping phase exists.
      setSetupPhase((prev) => {
        if (prev.kind === 'cropping') prev.source.close();
        return { kind: 'cropping', source: bitmap };
      });
    } catch {
      setSetupPhase((prev) => {
        if (prev.kind === 'cropping') prev.source.close();
        return { kind: 'picker', error: "Couldn't open that photo. Try a different file." };
      });
    }
  }, []);

  const handleCropConfirm = useCallback(
    (result: PhotoCropResult): void => {
      // `result.source` is a fresh bitmap `rasterizeCrop` produced via
      // `transferToImageBitmap` — always a distinct instance from the
      // uncropped original below, so this can never double-close the same
      // object. Only the cropped result is needed from here on; the
      // full-resolution original is not used again once the crop is confirmed.
      if (setupPhase.kind === 'cropping') setupPhase.source.close();
      setSetupPhase({ kind: 'configuring', source: result.source, seed: result.seed });
    },
    [setupPhase],
  );

  const handleSetupConfirm = useCallback(
    (config: PuzzleConfig): void => {
      if (setupPhase.kind !== 'configuring') return;
      setPlayConfig({ source: setupPhase.source, seed: setupPhase.seed, ...config });
    },
    [setupPhase],
  );

  // -- the runtime, mounted once the crop is confirmed -------------------------

  useEffect(() => {
    const container = boardRef.current;
    if (!container || !playConfig) return;

    let instance: PlayRuntime | null = null;

    instance = new PlayRuntime({
      container,
      source: playConfig.source,
      seed: playConfig.seed,
      targetCount: playConfig.targetCount,
      difficulty: playConfig.difficulty,
      rotation: playConfig.rotation,
      mode: playConfig.mode,
      assists: playConfig.assists,
      isOverTray: (client) => overTray.current(client),
      isOverShelf: (client) => overShelf.current(client),
      onDragStateChange: (isDragging) => {
        // §06: dragging a piece out auto-collapses the sheet to peek and
        // re-expands on release, so the mat is never obscured mid-drag.
        const store = useChrome.getState();
        if (isDragging) store.collapseForDrag();
        else store.restoreAfterDrag();
        setDragging(isDragging);
      },
      notify: setSummary,
    });

    runtime.current = instance;
    updateInsets();
    void instance.start();

    // §08: unlock the audio context on the first deliberate tap after the
    // board exists, and never before — iOS leaves it suspended otherwise and
    // the first snap of the session is silent. Registered here rather than
    // in a mount-time effect: the picker/crop screens render before
    // `playConfig` is set and before `instance` exists, so a listener
    // registered on the app's first mount would fire on the picker's first
    // tap, no-op through the optional chain (`runtime.current` still null),
    // and remove itself — permanently losing the unlock for the whole
    // session. Tying registration to this effect means the listener is only
    // ever added once a real runtime exists to unlock, added at most once
    // per mounted instance, and always torn down alongside it, so remount
    // cycles cannot accumulate duplicate listeners.
    const unlock = (): void => {
      instance?.unlockAudio();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);

    return () => {
      window.removeEventListener('pointerdown', unlock);
      instance?.destroy();
      runtime.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `updateInsets`
    // is called for its side effect on the runtime it just created, not
    // watched for change here; see the original comment this replaces.
  }, [playConfig]);

  // The dock's inner edge changes the board's viewport, and a window resize
  // event never fires for it. Without this the camera silently stops matching
  // the canvas and every hit test lands in the wrong place.
  //
  // The same observer also drives `setTrayInsets`, watching the tray's own root
  // alongside the board: the docked tray is a flex sibling and its width is
  // already out of the board container, so it contributes nothing; the iPhone
  // sheet is a fixed overlay whose *height* changes with every detent drag, and
  // that never touches the board container's size at all. Left at the default
  // zero, `safeWorldRect()` would deal every pulled-out piece behind the sheet,
  // where a drop returns it straight to the tray.
  // `playConfig` is in the dependency array (even though the effect body
  // never reads it) because the board `<div ref={boardRef}>` does not exist
  // in the DOM until `playConfig` is set — on first mount `container` is
  // null and the effect bails without ever creating the observer. Neither
  // `docked` nor `updateInsets` changes on the picker->crop->playing
  // transition, so without `playConfig` here React would never re-run this
  // effect and the observer would never attach at all.
  useEffect(() => {
    const container = boardRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      runtime.current?.resize();
      updateInsets();
    });
    observer.observe(container);
    if (trayRef.current) observer.observe(trayRef.current);
    updateInsets();
    return () => observer.disconnect();
  }, [docked, updateInsets, playConfig]);

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
    // `pinned` lives on `TrayModel`, not on `summary` — `trayRevision` is what
    // says "read it again", the same signal the tray view below already keys on.
    useChrome.getState().setShelf(runtime.current?.tray?.pinned ?? []);
  }, [summary]);

  // §13: the extracted accent replaces the fallback wherever chrome reads
  // `var(--accent)`/`var(--color-accent)`. Set on the root rather than baked
  // into `theme.css`'s `@theme` block, which is a build-time constant — this
  // is the one place the token set is genuinely per-puzzle.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--accent', summary.accent.accent);
    root.setProperty('--color-accent', summary.accent.accent);
    root.setProperty('--color-accent-bloom', summary.accent.accentBloom);
    root.setProperty('--color-accent-tray', summary.accent.accentTray);
  }, [summary.accent]);

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

  // A tap on a group's label chip opens the rename form. The chip lives on
  // canvas — `groupChipAt` is the first non-piece hit target in the app — so a
  // tap has to be told apart from the start of a drag or a camera pan by hand,
  // with the same 6px threshold `PointerMachine` and `TrayDrag` both use.
  // Checked only on `pointerup`, a discrete event: `groupChipAt` rebuilds the
  // scene, and calling it from `pointermove` would double that cost against the
  // 250-piece/60fps budget every frame of every gesture on the board.
  const groupTapOrigin = useRef<{ x: number; y: number } | null>(null);

  if (!playConfig) {
    if (setupPhase.kind === 'picker') {
      return <PhotoPicker onPhotoChosen={handlePhotoChosen} error={setupPhase.error} />;
    }
    if (setupPhase.kind === 'cropping') {
      return (
        <PhotoCrop
          source={setupPhase.source}
          onConfirm={handleCropConfirm}
          onBack={() =>
            setSetupPhase((prev) => {
              // Leaving the crop screen for a different photo — the original
              // bitmap it was cropping is no longer needed.
              if (prev.kind === 'cropping') prev.source.close();
              return { kind: 'picker', error: null };
            })
          }
        />
      );
    }
    return (
      <PuzzleSetup
        source={setupPhase.source}
        onConfirm={handleSetupConfirm}
        // Back re-enters crop on the already-cropped bitmap, not the original —
        // the pre-crop source was released when the crop was confirmed.
        onBack={() => setSetupPhase({ kind: 'cropping', source: setupPhase.source })}
      />
    );
  }

  return (
    <div className="flex h-full w-full bg-[var(--mat-void)]">
      <div className="relative min-w-0 flex-1">
        {/* The canvas layers live in here and React never touches them again. */}
        <div
          ref={boardRef}
          className="absolute inset-0"
          style={{ touchAction: 'none' }}
          onPointerDown={(event) => {
            groupTapOrigin.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={(event) => {
            const origin = groupTapOrigin.current;
            groupTapOrigin.current = null;
            if (!origin) return;
            const dx = event.clientX - origin.x;
            const dy = event.clientY - origin.y;
            if (Math.hypot(dx, dy) >= MOVE_THRESHOLD_PX) return;

            const rect = boardRef.current?.getBoundingClientRect();
            if (!rect) return;
            const id = runtime.current?.groupChipAt({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            });
            if (id !== null && id !== undefined) setRenaming(id);
          }}
        />

        <TopBar
          status={summary.status}
          placed={summary.placed}
          total={summary.total}
          cut={summary.cut}
          onFit={() => runtime.current?.fit()}
        />

        {summary.status === 'playing' && (
          <HintButton
            hasTarget={summary.hintTarget !== null}
            onFire={(tier) => runtime.current?.fireHint(tier) ?? false}
            clearanceBottomPx={trayHeight}
          />
        )}

        {renaming !== null && (
          <form
            className="absolute left-1/2 top-[64px] flex -translate-x-1/2 gap-[8px] rounded-[8px] border border-[var(--edge-hair)] bg-[var(--mat-felt)] p-[8px]"
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get('label');
              if (typeof value === 'string' && value.trim()) {
                runtime.current?.renameGroup(renaming, value.trim());
              }
              setRenaming(null);
            }}
          >
            <input
              name="label"
              autoFocus
              aria-label="Group name"
              defaultValue={runtime.current?.groupLabel(renaming) ?? ''}
              className="min-h-[44px] rounded-[6px] bg-transparent px-[8px] font-[var(--font-data)] text-[14px]"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setRenaming(null);
              }}
            />
            <button type="submit" className="min-h-[44px] px-[12px] text-[14px]">
              Rename
            </button>
          </form>
        )}
      </div>

      <Tray
        rootRef={trayRef}
        shelfRef={shelfRef}
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
        onPullOut={(pieceId, event) => runtime.current?.pullFromTray(pieceId, event) ?? false}
        onLocate={(id) => runtime.current?.locate(id)}
        dragging={dragging}
        onPullSelection={(pieceIds) => {
          runtime.current?.pullOut(pieceIds);
        }}
      />
    </div>
  );
}
