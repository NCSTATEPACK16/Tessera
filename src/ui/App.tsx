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
import { nextHarderCount } from '@/play/setup';
import type { PuzzleAssists } from '@/play/setup';
import type { SnapDifficulty } from '@/board/snap';
import { curatedPhotoById, renderCuratedPhoto } from '@/play/curated';
import { downscaleTarget } from '@/play/photo';
import { seedFromPuzzleId } from '@/core/rng';
import { deleteLibraryEntry, listLibrary, saveLibraryEntry } from '@/persist/library';
import type { LibraryEntry } from '@/persist/library';
import { loadPhoto, savePhoto } from '@/persist/photos';
import { captureThumbnail } from '@/persist/thumbnail';
import type { SessionSnapshot } from '@/persist/snapshot';
import { completionCount, listCompletions, saveCompletion } from '@/persist/completions';
import type { CompletionRecord } from '@/persist/completions';
import { hasSeenFirstRunSync, loadFirstRunDone, markFirstRunDone } from '@/persist/first-run';
import { FIRST_RUN_PIECES, firstRunStart, firstRunTick } from '@/play/first-run';
import type { FirstRunBeat, FirstRunState } from '@/play/first-run';
import { FirstRunOverlay } from './FirstRun';
import { composeCard } from '@/render/card';
import type { CardMeta } from '@/play/card';
import { Library } from './Library';
import { PauseSheet } from './PauseSheet';
import { CompletionCard } from './CompletionCard';
import { CollectionWall } from './CollectionWall';
import { dailyFor, dailyPuzzleId, isDailyPuzzleId } from '@/daily/daily';
import { localDateKey, monthKeyOf } from '@/daily/dates';
import {
  canRepair as canRepairStreak,
  emptyStreak,
  isDone,
  monthGrid,
  recordCompletion,
  repair as repairStreak,
  settle,
  streakLength,
  weekPips,
} from '@/daily/streak';
import type { StreakState } from '@/daily/streak';
import { loadStreak, saveStreak } from '@/persist/daily';
import { DailyHub } from './DailyHub';
import type { StreakTone } from './StreakFlame';
import { DEFAULT_PUZZLE_CONFIG } from '@/play/setup';
import { HEIC_HEAD_BYTES, looksLikeHeic, namedLikeHeic } from '@/play/heic';
import { decodeHeicInWorker, readHead } from '@/play/heic-client';

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
/**
 * Step 5c: HEIC is what an iPhone shoots by default. Track 1 converts it
 * rather than refusing it, but conversion can still fail — on a device where
 * the WASM will not load, or on a genuinely corrupt file — and when it does,
 * "couldn't open that photo" is technically true and useless.
 */
const HEIC_MESSAGE =
  "HEIC photos aren’t supported directly here — try ‘Most Compatible’ in Settings → Photos, or export as JPEG.";

async function decodeUpload(file: File): Promise<ImageBitmap> {
  try {
    const size = await probeImageSize(file);
    const target = downscaleTarget(size.width, size.height);
    // `imageOrientation: 'from-image'` explicitly, on both branches: the
    // default has varied across engines, and a portrait photo landing
    // sideways is a whole puzzle cut wrong.
    if (target.width === size.width && target.height === size.height) {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    }
    return await createImageBitmap(file, {
      resizeWidth: target.width,
      resizeHeight: target.height,
      resizeQuality: 'high',
      imageOrientation: 'from-image',
    });
  } catch (error) {
    // The browser gets first refusal, always — Safari decodes HEIC natively,
    // and iOS often transcodes to JPEG on the share path. Only once the engine
    // has actually failed is it worth asking whether libheif should be woken.
    const head = await readHead(file, HEIC_HEAD_BYTES);
    if (looksLikeHeic(file, head)) {
      try {
        return await decodeHeicInWorker(file);
      } catch {
        throw new Error(HEIC_MESSAGE);
      }
    }
    // The bytes said no, but the name or MIME type said HEIC. That file is
    // corrupt rather than HEIC, and the player is still better served by the
    // advice than by the generic message — see `namedLikeHeic`.
    if (namedLikeHeic(file)) throw new Error(HEIC_MESSAGE);
    throw error;
  }
}

/**
 * A settling spring is ~120ms (`CLAUDE.md`'s "Snap spring" row), so this
 * resolves in one or two frames in practice. The 500ms cap is defense against
 * a future bug in the settle logic hanging card composition forever — it must
 * never block the player from finishing.
 */
async function waitForSettled(rt: PlayRuntime): Promise<void> {
  const deadline = performance.now() + 500;
  while (rt.animating && performance.now() < deadline) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

/**
 * The daily's fixed configuration. Everyone plays the same puzzle, so there is
 * no setup screen in the daily flow and nothing here is a player choice.
 * Classic (the hint economy is part of the shared challenge), rotation off
 * (`PLAN.md`: rotation must never be the default), standard tolerance, no
 * assists.
 */
const DAILY_CONFIG = {
  mode: 'classic',
  rotation: false,
  difficulty: DEFAULT_PUZZLE_CONFIG.difficulty,
  assists: DEFAULT_PUZZLE_CONFIG.assists,
} as const;

/**
 * §16: no mode picker, and "rotation never appears in the guided first
 * puzzle." Twelve passes straight through — `PuzzleConfig.targetCount` is a
 * plain number, so `PIECE_COUNT_LADDER` is not widened and 12 never becomes
 * an offerable count on the setup screen. Zen, so the rescue hint at eight
 * can never run out of budget mid-tutorial. `generous` so the first snap
 * lands.
 */
const FIRST_RUN_CONFIG = {
  targetCount: FIRST_RUN_PIECES,
  mode: 'zen',
  rotation: false,
  difficulty: 'generous',
  assists: DEFAULT_PUZZLE_CONFIG.assists,
} as const;

/**
 * The guided twelve's fixed photo. No "hero" designation exists in the
 * curated manifest — a judgment call, not a spec requirement: the "easy"
 * rating on the same "wide and calm" shelf `banff-sunrise-lake` (the
 * manifest's first entry, but rated "hard") sits on, so the very first
 * puzzle a new player sees is never the harder cut.
 */
const FIRST_RUN_PHOTO_ID = 'mountain-lake-reflection';
const FIRST_RUN_PUZZLE_ID = 'first-run';

export function App(): React.ReactElement {
  const boardRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const shelfRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<PlayRuntime | null>(null);

  type SetupPhase =
    | {
        kind: 'picker';
        error: string | null;
        /**
         * A chosen photo is decoding. HEIC conversion can take seconds on an
         * older device, and silence during it reads as "nothing happened" —
         * which the target player takes as their own mistake, not the app's
         * delay. Absent means idle; only `handlePhotoChosen` ever sets it.
         */
        busy?: boolean;
      }
    // `photoId` is the curated photo's id, or null for an upload — carried
    // through so the completion card can credit it (§15) and title it.
    | { kind: 'cropping'; source: ImageBitmap; photoId: string | null }
    | {
        kind: 'configuring';
        source: ImageBitmap;
        seed: number;
        puzzleId: string;
        photoId: string | null;
      };

  /**
   * Where the app is, above `setupPhase`. `'checking'` is the single
   * IndexedDB read on mount that decides between the library and the picker —
   * a first-time player must never see an empty library apologising to them.
   */
  type Screen = 'checking' | 'daily' | 'library' | 'setup' | 'playing' | 'first-run' | 'wall';
  const [screen, setScreen] = useState<Screen>('checking');

  /**
   * §16's coach. `firstRunModel` is the machine's own opaque state (latches);
   * `trayRevealed` is separate React state because the tray-reveal *beat*
   * fires only on the one tick it happens, but the tray, once mounted, must
   * never un-mount — a later beat like 'playing' or 'hint-rescue' must not
   * take it away.
   */
  const [firstRunBeat, setFirstRunBeat] = useState<FirstRunBeat>('cold-open');
  const [trayRevealed, setTrayRevealed] = useState(false);
  const firstRunModel = useRef<FirstRunState>(firstRunStart());
  const lastPlacementAt = useRef(Date.now());
  const prevFirstRunPlaced = useRef(0);
  /** The collection wall's rows, loaded on entry; the screen to return to. */
  const [completions, setCompletions] = useState<readonly CompletionRecord[]>([]);
  const beforeWall = useRef<Screen>('setup');
  /**
   * Read once per mount. A session that survives local midnight keeps
   * yesterday's key until the next load, which is correct: the daily the
   * player is holding is the one they started.
   */
  const [today] = useState(() => localDateKey(new Date()));
  const [streak, setStreak] = useState<StreakState>(() => emptyStreak());
  /** Where "Done" and "Leave" go back to. */
  const originScreen = useRef<'daily' | 'library' | 'setup'>('setup');
  /** Guards the completion recording against re-firing on every render. */
  const recordedDaily = useRef<string | null>(null);
  const [dailyResult, setDailyResult] = useState<{ streak: number; freezeEarned: boolean } | null>(
    null,
  );
  const [libraryEntries, setLibraryEntries] = useState<readonly LibraryEntry[]>([]);
  const [restoreSnapshot, setRestoreSnapshot] = useState<SessionSnapshot | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [restartKey, setRestartKey] = useState(0);
  const [liveAssists, setLiveAssists] = useState<PuzzleAssists | null>(null);
  const [liveDifficulty, setLiveDifficulty] = useState<SnapDifficulty | null>(null);
  /** Read at save time, never subscribed to — a scroll must not re-render. */
  const trayScrollRef = useRef(0);
  /** The photo blob is written exactly once per puzzle, not every 800ms. */
  const photoSavedRef = useRef(false);
  /**
   * The autosave currently in flight.
   *
   * Anything that reads or deletes the library has to wait on it first: a
   * `listLibrary()` that overtakes the save shows stale progress, and a
   * `deleteLibraryEntry()` overtaken by one resurrects the entry it just
   * removed.
   */
  const saveInFlight = useRef<Promise<void>>(Promise.resolve());
  /** The one-time photo write, so anything needing a fresh decode can wait. */
  const photoWrite = useRef<Promise<void>>(Promise.resolve());

  const [setupPhase, setSetupPhase] = useState<SetupPhase>({ kind: 'picker', error: null });
  const [playConfig, setPlayConfig] = useState<
    | ({
        source: ImageBitmap;
        seed: number;
        puzzleId: string;
        photoId: string | null;
        /** §16's guided twelve: pieces begin loose on the mat, not in the tray. */
        startInTray?: boolean;
      } & PuzzleConfig)
    | null
  >(null);
  /** The composed Puzzle Card PNG and its meta, ready once a puzzle completes. */
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);
  const [cardMeta, setCardMeta] = useState<CardMeta | null>(null);
  /** Guards the one-time card compose against re-firing on every render. */
  const composedFor = useRef<string | null>(null);

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
    elapsedMs: 0,
    cleanRun: true,
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

  // The one read that decides the entry screen. Three conditions, not one —
  // each alone is wrong: a player who finished the guided twelve and then
  // deleted everything must not be taught it again, and neither must one who
  // has a real completion on the wall but no puzzle currently in progress.
  useEffect(() => {
    // The synchronous cache first: when it already says "seen", there is no
    // reason to make the IndexedDB round trip below wait on a read whose
    // answer is already known, and it can never be wrong in the direction
    // that matters — a stale/missing cache only ever costs one extra read,
    // never traps a returning player.
    const cachedDone = hasSeenFirstRunSync();
    void (async () => {
      const [entries, completions, firstRunDone] = await Promise.all([
        listLibrary(),
        completionCount(),
        cachedDone ? Promise.resolve(true) : loadFirstRunDone(),
      ]);
      setLibraryEntries(entries);

      if (entries.length === 0 && completions === 0 && !firstRunDone) {
        const source = await renderCuratedPhoto(FIRST_RUN_PHOTO_ID);
        setRestoreSnapshot(null);
        photoSavedRef.current = false;
        setLiveAssists(FIRST_RUN_CONFIG.assists);
        setLiveDifficulty(FIRST_RUN_CONFIG.difficulty);
        setPlayConfig({
          source,
          seed: seedFromPuzzleId(FIRST_RUN_PUZZLE_ID),
          puzzleId: FIRST_RUN_PUZZLE_ID,
          photoId: FIRST_RUN_PHOTO_ID,
          targetCount: FIRST_RUN_CONFIG.targetCount,
          mode: FIRST_RUN_CONFIG.mode,
          rotation: FIRST_RUN_CONFIG.rotation,
          difficulty: FIRST_RUN_CONFIG.difficulty,
          assists: FIRST_RUN_CONFIG.assists,
          startInTray: false,
        });
        setScreen('first-run');
        return;
      }

      setScreen(entries.length > 0 ? 'library' : 'setup');
    })();
  }, []);

  // Resets the coach's idle clock whenever `summary.placed` actually rises —
  // the only time-based threshold §16 has is twenty seconds, so this is the
  // one place that reads the wall clock.
  useEffect(() => {
    if (screen !== 'first-run') return;
    if (summary.placed > prevFirstRunPlaced.current) lastPlacementAt.current = Date.now();
    prevFirstRunPlaced.current = summary.placed;
  }, [screen, summary.placed]);

  // The coach's tick — a 1s interval, not per frame: the only time-based
  // threshold is twenty seconds, and a per-frame tick would violate "an idle
  // board draws nothing" for no benefit. Ticks immediately on mount and on
  // every placement change too, so a reveal never waits up to a second.
  useEffect(() => {
    if (screen !== 'first-run') return;

    const tick = (): void => {
      const out = firstRunTick(firstRunModel.current, {
        placed: summary.placed,
        total: summary.total,
        msSinceLastPlacement: Date.now() - lastPlacementAt.current,
        skipped: false,
      });
      firstRunModel.current = out.state;
      setFirstRunBeat(out.beat);
      if (out.state.trayRevealed) setTrayRevealed(true);
      if (out.fireHint) runtime.current?.fireHint(1);
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [screen, summary.placed, summary.total]);

  /** §16: skip is reachable from any beat. Writes no completion. */
  const handleFirstRunSkip = useCallback((): void => {
    void markFirstRunDone();
    runtime.current?.interrupt();
    setSetupPhase({ kind: 'picker', error: null });
    setScreen('setup');
    setPlayConfig(null);
    void saveInFlight.current
      .catch(() => {})
      .then(() => listLibrary())
      .then(setLibraryEntries);
  }, []);

  // Settle on open, once: `settle` walks up to yesterday, spending banked
  // freezes on gaps, and is idempotent within a day. The write-back only
  // happens when it actually changed something, so a player who opens the app
  // ten times writes once.
  useEffect(() => {
    void (async () => {
      const loaded = await loadStreak();
      const settled = settle(loaded, today);
      setStreak(settled.state);
      if (settled.freezesSpent > 0 || settled.state.settledThrough !== loaded.settledThrough) {
        await saveStreak(settled.state);
      }
    })();
  }, [today]);

  // -- the setup flow: picker -> crop -> playConfig ---------------------------

  const handlePhotoChosen = useCallback(async (choice: PhotoChoice): Promise<void> => {
    // Set before any await, so the reassurance is on screen from the moment
    // the file lands rather than from when the decoder gets going.
    setSetupPhase((prev) => {
      if (prev.kind === 'cropping') prev.source.close();
      return { kind: 'picker', error: null, busy: true };
    });
    try {
      const photoId = choice.kind === 'curated' ? choice.id : null;
      const bitmap =
        choice.kind === 'curated' ? await renderCuratedPhoto(choice.id) : await decodeUpload(choice.file);
      // A previous round trip through crop (picker -> crop -> picker -> pick
      // again) would otherwise leak that bitmap's off-heap backing store —
      // GC does not reliably reclaim ImageBitmaps promptly. `onBack` already
      // closes it on the normal path; this is the defensive twin for any
      // other route back into this handler while a cropping phase exists.
      setSetupPhase((prev) => {
        if (prev.kind === 'cropping') prev.source.close();
        return { kind: 'cropping', source: bitmap, photoId };
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message === HEIC_MESSAGE
          ? HEIC_MESSAGE
          : "Couldn't open that photo. Try a different file.";
      setSetupPhase((prev) => {
        if (prev.kind === 'cropping') prev.source.close();
        return { kind: 'picker', error: message };
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
      const photoId = setupPhase.kind === 'cropping' ? setupPhase.photoId : null;
      if (setupPhase.kind === 'cropping') setupPhase.source.close();
      setSetupPhase({
        kind: 'configuring',
        source: result.source,
        seed: result.seed,
        puzzleId: result.puzzleId,
        photoId,
      });
    },
    [setupPhase],
  );

  const handleSetupConfirm = useCallback(
    (config: PuzzleConfig): void => {
      if (setupPhase.kind !== 'configuring') return;
      setRestoreSnapshot(null);
      photoSavedRef.current = false;
      setDailyResult(null);
      setLiveAssists(config.assists);
      setLiveDifficulty(config.difficulty);
      setPlayConfig({
        source: setupPhase.source,
        seed: setupPhase.seed,
        puzzleId: setupPhase.puzzleId,
        photoId: setupPhase.photoId,
        ...config,
      });
      originScreen.current = 'setup';
      setScreen('playing');
    },
    [setupPhase],
  );

  // -- the library -----------------------------------------------------------

  const handleOpenLibraryEntry = useCallback(
    async (puzzleId: string): Promise<void> => {
      const entry = libraryEntries.find((e) => e.puzzleId === puzzleId);
      if (!entry) return;
      // A fresh working copy from the stored blob — the original was
      // transferred to the cutter worker and detached long ago.
      const bitmap = await loadPhoto(puzzleId);
      setRestoreSnapshot(entry.snapshot);
      setLiveAssists(entry.snapshot.assists);
      setLiveDifficulty(entry.snapshot.difficulty);
      setDailyResult(null);
      useChrome.getState().setLens(entry.snapshot.tray.lens, entry.snapshot.tray.lensArg);
      // Already stored — never rewrite it.
      photoSavedRef.current = true;
      // A daily opened from a library card still belongs to the library.
      if (originScreen.current !== 'daily') originScreen.current = 'library';
      setPlayConfig({
        source: bitmap,
        seed: entry.snapshot.seed,
        puzzleId,
        // The snapshot does not carry which curated photo this was; a resumed
        // daily recovers it from the date at card time (`buildCardMeta`).
        photoId: null,
        targetCount: entry.snapshot.targetCount,
        mode: entry.snapshot.mode,
        rotation: entry.snapshot.rotation,
        difficulty: entry.snapshot.difficulty,
        assists: entry.snapshot.assists,
      });
      setScreen('playing');
    },
    [libraryEntries],
  );

  // -- the daily -------------------------------------------------------------

  const daily = useMemo(() => dailyFor(today), [today]);

  /**
   * Straight from the hub onto a board: no picker, no crop, no setup screen.
   * Resumes an in-progress daily when one is saved, exactly as a library card
   * does, because a daily *is* a library entry — same stores, same
   * `Board.restore`, same snapshot.
   */
  const handleStartDaily = useCallback(async (): Promise<void> => {
    const existing = libraryEntries.find((entry) => entry.puzzleId === daily.puzzleId);
    originScreen.current = 'daily';

    if (existing) {
      await handleOpenLibraryEntry(daily.puzzleId);
      return;
    }

    const source = await renderCuratedPhoto(daily.photoId);
    setRestoreSnapshot(null);
    photoSavedRef.current = false;
    setDailyResult(null);
    setLiveAssists(DAILY_CONFIG.assists);
    setLiveDifficulty(DAILY_CONFIG.difficulty);
    setPlayConfig({
      source,
      seed: daily.seed,
      puzzleId: daily.puzzleId,
      photoId: daily.photoId,
      targetCount: daily.targetCount,
      mode: DAILY_CONFIG.mode,
      rotation: DAILY_CONFIG.rotation,
      difficulty: DAILY_CONFIG.difficulty,
      assists: DAILY_CONFIG.assists,
    });
    setScreen('playing');
  }, [daily, libraryEntries, handleOpenLibraryEntry]);

  const handleRepair = useCallback((): void => {
    const repaired = repairStreak(streak, today);
    setStreak(repaired);
    void saveStreak(repaired);
  }, [streak, today]);

  // -- autosave --------------------------------------------------------------

  const handleAutosave = useCallback(
    async (rt: PlayRuntime, canvas: HTMLCanvasElement | OffscreenCanvas): Promise<void> => {
      const chromeState = useChrome.getState();
      const snapshot = rt.snapshot({
        lens: chromeState.lens,
        lensArg: chromeState.lensArg,
        scroll: trayScrollRef.current,
      });
      if (!snapshot) return;

      const thumbnailBlob = await captureThumbnail(canvas);
      await saveLibraryEntry({
        puzzleId: snapshot.puzzleId,
        snapshot,
        thumbnailBlob,
        updatedAt: snapshot.updatedAt,
      });
    },
    [],
  );

  // -- pause, restart, leave, completion --------------------------------------

  const handleRestart = useCallback(async (): Promise<void> => {
    if (!playConfig) return;
    setPauseOpen(false);
    // A *fresh* source bitmap, decoded from the stored photo. The one in
    // `playConfig` was transferred to the cutter worker on the first start
    // and is detached — reusing it makes the second cut fail outright.
    await photoWrite.current;
    const source = await loadPhoto(playConfig.puzzleId);
    setRestoreSnapshot(null);
    setPlayConfig({ ...playConfig, source });
    setRestartKey((k) => k + 1);
  }, [playConfig]);

  const handleLeave = useCallback(async (): Promise<void> => {
    // One last save through the machinery `visibilitychange` already uses,
    // then wait for it — otherwise the card the player is about to see was
    // read out of IndexedDB before this write landed in it.
    runtime.current?.interrupt();
    // Batched together, for the same reason `handleDone` batches: a frame in
    // which `playConfig` is null and `setupPhase` still holds a detached
    // source would render `PuzzleSetup` and throw.
    setPauseOpen(false);
    setSetupPhase({ kind: 'picker', error: null });
    setScreen(originScreen.current === 'daily' ? 'daily' : 'library');
    setPlayConfig(null);
    await saveInFlight.current.catch(() => {});
    setLibraryEntries(await listLibrary());
  }, []);

  const handleAgainHarder = useCallback(async (): Promise<void> => {
    if (!playConfig) return;
    const next = nextHarderCount(playConfig.targetCount);
    if (next === null) return;
    // A genuinely new puzzle instance, so a new id and a new seed — the same
    // photo cut again, differently.
    const newPuzzleId = crypto.randomUUID();
    await photoWrite.current;
    const bitmap = await loadPhoto(playConfig.puzzleId);
    const seed = seedFromPuzzleId(newPuzzleId);
    await saveInFlight.current;
    await deleteLibraryEntry(playConfig.puzzleId);
    setRestoreSnapshot(null);
    photoSavedRef.current = false;
    setDailyResult(null);
    recordedDaily.current = null;
    // Drop the finished puzzle's card so the next completion cannot flash it.
    setCardBlob(null);
    setCardMeta(null);
    composedFor.current = null;
    setPlayConfig({
      source: bitmap,
      seed,
      puzzleId: newPuzzleId,
      photoId: playConfig.photoId,
      targetCount: next,
      mode: playConfig.mode,
      rotation: playConfig.rotation,
      difficulty: playConfig.difficulty,
      assists: playConfig.assists,
    });
  }, [playConfig]);

  /**
   * The completion card's meta, assembled from the frozen run numbers and the
   * photo. A resumed daily recovers its `photoId` from the date, since the
   * snapshot does not store it (§15 attribution still shows on a resumed daily).
   */
  const buildCardMeta = useCallback((): CardMeta | null => {
    if (!playConfig) return null;
    const photoId =
      playConfig.photoId ?? (isDailyPuzzleId(playConfig.puzzleId) ? daily.photoId : null);
    const curated = photoId ? curatedPhotoById(photoId) : undefined;
    return {
      title: curated?.name ?? 'Your photo',
      elapsedMs: summary.elapsedMs,
      pieceCount: summary.total,
      mode: playConfig.mode,
      cleanRun: summary.cleanRun,
      attribution: curated?.licence.attribution ?? null,
    };
  }, [playConfig, daily, summary.elapsedMs, summary.total, summary.cleanRun]);

  /**
   * §15: record the finish, then remove the in-progress entry — in that order,
   * so a crash between them loses nothing. The wall reads `completions`; the
   * library holds in-progress puzzles only. The `saveInFlight` wait is the same
   * race guard the old delete-only path carried: an autosave overtaking the
   * delete would resurrect the entry.
   */
  const commitCompletion = useCallback(async (): Promise<void> => {
    if (!playConfig) return;
    const rt = runtime.current;
    await saveInFlight.current.catch(() => {});
    if (rt) {
      const photoId =
        playConfig.photoId ?? (isDailyPuzzleId(playConfig.puzzleId) ? daily.photoId : null);
      const curated = photoId ? curatedPhotoById(photoId) : undefined;
      await waitForSettled(rt);
      const thumbnailBlob = await captureThumbnail(rt.boardCanvas());
      await saveCompletion({
        puzzleId: playConfig.puzzleId,
        photoId,
        thumbnailBlob,
        elapsedMs: summary.elapsedMs,
        pieceCount: summary.total,
        mode: playConfig.mode,
        cleanRun: summary.cleanRun,
        completedAt: Date.now(),
        attribution: curated?.licence.attribution ?? null,
      });
    }
    await deleteLibraryEntry(playConfig.puzzleId);
    // §16: finishing the guided twelve is a real completion, so it earns the
    // same "never taught again" write every skip already gets — one gate,
    // covers every action this card offers (Done, New puzzle, or the
    // first-run-only pair below).
    if (playConfig.puzzleId === FIRST_RUN_PUZZLE_ID) void markFirstRunDone();
  }, [playConfig, daily, summary.elapsedMs, summary.total, summary.cleanRun]);

  const clearCard = useCallback((): void => {
    setCardBlob(null);
    setCardMeta(null);
    composedFor.current = null;
  }, []);

  const handleDone = useCallback(async (): Promise<void> => {
    if (!playConfig) return;
    await commitCompletion();
    const entries = await listLibrary();

    // Every await is done, so these commit in one batch. That matters:
    // clearing `playConfig` while `setupPhase` was still `'configuring'`
    // renders `PuzzleSetup` for one frame against a source bitmap the cutter
    // worker detached long ago, and it throws on the spot.
    clearCard();
    setSetupPhase({ kind: 'picker', error: null });
    setLibraryEntries(entries);
    setScreen(
      originScreen.current === 'daily' ? 'daily' : entries.length > 0 ? 'library' : 'setup',
    );
    setPlayConfig(null);
  }, [playConfig, commitCompletion, clearCard]);

  /** Record the finish, then head straight to the picker for a fresh photo. */
  const handleNewPuzzle = useCallback(async (): Promise<void> => {
    if (!playConfig) return;
    await commitCompletion();
    setLibraryEntries(await listLibrary());
    clearCard();
    setSetupPhase({ kind: 'picker', error: null });
    setScreen('setup');
    setPlayConfig(null);
  }, [playConfig, commitCompletion, clearCard]);

  /** §16's primary next step: record the finish, then straight to a real photo. */
  const handleFirstRunOwnPhoto = handleNewPuzzle;

  /**
   * §16's secondary next step: record the finish, then straight into today's
   * puzzle. Never the "resume an existing daily" branch `handleStartDaily`
   * also carries — the guided twelve is, by construction, the only puzzle
   * that has ever existed in this profile, so today's daily cannot already
   * have a library entry yet.
   */
  const handleFirstRunDaily = useCallback(async (): Promise<void> => {
    if (!playConfig) return;
    await commitCompletion();
    const source = await renderCuratedPhoto(daily.photoId);
    const entries = await listLibrary();
    originScreen.current = 'daily';
    setRestoreSnapshot(null);
    photoSavedRef.current = false;
    setDailyResult(null);
    clearCard();
    setLibraryEntries(entries);
    setLiveAssists(DAILY_CONFIG.assists);
    setLiveDifficulty(DAILY_CONFIG.difficulty);
    setPlayConfig({
      source,
      seed: daily.seed,
      puzzleId: daily.puzzleId,
      photoId: daily.photoId,
      targetCount: daily.targetCount,
      mode: DAILY_CONFIG.mode,
      rotation: DAILY_CONFIG.rotation,
      difficulty: DAILY_CONFIG.difficulty,
      assists: DAILY_CONFIG.assists,
    });
    setScreen('playing');
  }, [playConfig, commitCompletion, clearCard, daily]);

  const openCollection = useCallback(async (): Promise<void> => {
    setCompletions(await listCompletions());
    beforeWall.current = screen;
    setScreen('wall');
  }, [screen]);

  // -- the runtime, mounted once the crop is confirmed -------------------------

  useEffect(() => {
    const container = boardRef.current;
    if (!container || !playConfig) return;

    let instance: PlayRuntime | null = null;

    instance = new PlayRuntime({
      container,
      source: playConfig.source,
      seed: playConfig.seed,
      puzzleId: playConfig.puzzleId,
      targetCount: playConfig.targetCount,
      difficulty: playConfig.difficulty,
      rotation: playConfig.rotation,
      mode: playConfig.mode,
      assists: playConfig.assists,
      ...(playConfig.startInTray !== undefined ? { startInTray: playConfig.startInTray } : {}),
      ...(restoreSnapshot ? { restore: { snapshot: restoreSnapshot } } : {}),
      onSave: (rt, canvas) => {
        saveInFlight.current = handleAutosave(rt, canvas);
        void saveInFlight.current;
      },
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

    // **Before** `start()`, which hands `source` to the cutter worker and
    // detaches it on this thread — a copy taken after that point throws, and
    // the library entry would be left with no photo to reopen from. Written
    // exactly once per puzzle: the photo never changes, only the board does.
    if (!photoSavedRef.current) {
      photoSavedRef.current = true;
      const puzzleId = playConfig.puzzleId;
      const offscreen = new OffscreenCanvas(playConfig.source.width, playConfig.source.height);
      offscreen.getContext('2d')?.drawImage(playConfig.source, 0, 0);
      photoWrite.current = offscreen
        .convertToBlob({ type: 'image/jpeg', quality: 0.9 })
        .then((blob) => savePhoto(puzzleId, blob));
      void photoWrite.current;
    }

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
  }, [playConfig, restartKey]);

  // Compose the Puzzle Card once, when a puzzle completes. Guarded by a ref so
  // a re-render cannot recompose it — the same shape `recordedDaily` uses. The
  // card is drawn from the completed board canvas (§11), not the source photo.
  useEffect(() => {
    if (summary.status !== 'complete' || !playConfig) return;
    if (composedFor.current === playConfig.puzzleId) return;
    const rt = runtime.current;
    if (!rt) return;
    const meta = buildCardMeta();
    if (!meta) return;
    composedFor.current = playConfig.puzzleId;
    let cancelled = false;
    void (async () => {
      // Fonts first: `ctx.font` falls back silently if the webfont has not
      // arrived, and a card in the wrong typeface is a defect nothing reports.
      await document.fonts.ready;
      // And the board itself: a piece that just completed the puzzle is still
      // mid-spring on the dynamic layer for ~120ms, absent from the static
      // layer this reads from. See `waitForSettled`.
      await waitForSettled(rt);
      if (cancelled) return;
      const blob = await composeCard(rt.boardCanvas(), meta);
      if (cancelled) return;
      setCardBlob(blob);
      setCardMeta(meta);
    })();
    return () => {
      cancelled = true;
    };
  }, [summary.status, playConfig, buildCardMeta]);

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

  // The streak is credited at the moment of completion, not on "Done": a
  // player who finishes and then backgrounds the tab has still played today.
  // Guarded by a ref rather than by state so a re-render cannot double-count.
  useEffect(() => {
    if (summary.status !== 'complete') return;
    const puzzleId = playConfig?.puzzleId;
    if (!puzzleId || !isDailyPuzzleId(puzzleId)) return;
    if (recordedDaily.current === puzzleId) return;
    recordedDaily.current = puzzleId;

    const dateKey = puzzleId.slice('daily-'.length);
    const result = recordCompletion(streak, dateKey);
    if (result.alreadyDone) return;
    setStreak(result.state);
    void saveStreak(result.state);
    setDailyResult({ streak: result.streak, freezeEarned: result.freezeEarned });
  }, [summary.status, playConfig, streak]);

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

  // §C Track 3: the one place comfort's 60pt control-target retarget happens.
  // `theme.css`'s `--touch-min` is already what every button and `.touch-target`
  // element reads — flipping this attribute is the whole mechanism. No puzzle
  // configured yet (library/setup screens) reads as comfort off, same as
  // `DEFAULT_PUZZLE_CONFIG.assists.comfort`.
  useEffect(() => {
    const comfort = (liveAssists ?? playConfig?.assists)?.comfort ?? false;
    document.documentElement.toggleAttribute('data-comfort', comfort);
  }, [liveAssists, playConfig?.assists]);

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

  // A blank frame while the one IndexedDB read resolves.
  if (screen === 'checking') return <div className="h-full w-full bg-[var(--mat-void)]" />;

  const streakCount = streakLength(streak, today);
  const streakTone: StreakTone =
    streak.completed.length === 0
      ? 'none'
      : streakCount === 0
        ? 'broken'
        : isDone(streak, today)
          ? 'alive'
          : 'at-risk';

  if (screen === 'daily') {
    const todaysEntry = libraryEntries.find((entry) => entry.puzzleId === daily.puzzleId);
    return (
      <DailyHub
        daily={daily}
        dateLabel={new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        monthLabel={new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        })}
        streak={streakCount}
        freezes={streak.freezes}
        tone={streakTone}
        pips={weekPips(streak, today)}
        grid={monthGrid(streak, monthKeyOf(today), today)}
        progress={
          todaysEntry
            ? { placed: todaysEntry.snapshot.placed, total: todaysEntry.snapshot.total }
            : null
        }
        progressThumbnail={todaysEntry?.thumbnailBlob ?? null}
        doneToday={isDone(streak, today)}
        canRepair={canRepairStreak(streak, today)}
        onRepair={handleRepair}
        onStart={() => {
          void handleStartDaily();
        }}
        onLibrary={() => setScreen('library')}
        onNewPuzzle={() => {
          originScreen.current = 'setup';
          setSetupPhase({ kind: 'picker', error: null });
          setScreen('setup');
        }}
      />
    );
  }

  if (screen === 'wall') {
    return (
      <CollectionWall entries={completions} onBack={() => setScreen(beforeWall.current)} />
    );
  }

  if (screen === 'library') {
    // Today's daily is offered on the hub, not here — one puzzle, one place to
    // start it. Yesterday's unfinished daily is no longer "today's" and shows
    // as an ordinary card, which is why nothing is ever deleted to achieve this.
    const shelved = libraryEntries.filter((entry) => entry.puzzleId !== dailyPuzzleId(today));
    return (
      <Library
        entries={shelved}
        streak={streakCount}
        streakTone={streakTone}
        onDaily={() => setScreen('daily')}
        onCollection={() => {
          void openCollection();
        }}
        onOpen={(puzzleId) => {
          void handleOpenLibraryEntry(puzzleId);
        }}
        onNewPuzzle={() => {
          originScreen.current = 'setup';
          setSetupPhase({ kind: 'picker', error: null });
          setScreen('setup');
        }}
      />
    );
  }

  if (!playConfig) {
    if (setupPhase.kind === 'picker') {
      return (
        <PhotoPicker
          onPhotoChosen={handlePhotoChosen}
          error={setupPhase.error}
          busy={setupPhase.busy ?? false}
          onDaily={() => setScreen('daily')}
          onCollection={() => {
            void openCollection();
          }}
        />
      );
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
        onBack={() =>
          setSetupPhase({
            kind: 'cropping',
            source: setupPhase.source,
            photoId: setupPhase.photoId,
          })
        }
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

        {summary.status === 'complete' ? (
          cardBlob && cardMeta ? (
            <CompletionCard
              meta={cardMeta}
              cardBlob={cardBlob}
              canGoHarder={nextHarderCount(playConfig.targetCount) !== null}
              nextCount={nextHarderCount(playConfig.targetCount)}
              {...(isDailyPuzzleId(playConfig.puzzleId) && dailyResult
                ? { daily: dailyResult }
                : {})}
              {...(playConfig.puzzleId === FIRST_RUN_PUZZLE_ID
                ? {
                    firstRun: {
                      onOwnPhoto: () => {
                        void handleFirstRunOwnPhoto();
                      },
                      onDaily: () => {
                        void handleFirstRunDaily();
                      },
                    },
                  }
                : {})}
              onAgainHarder={() => {
                void handleAgainHarder();
              }}
              onDone={() => {
                void handleDone();
              }}
              onNewPuzzle={() => {
                void handleNewPuzzle();
              }}
            />
          ) : null
        ) : (
          <TopBar
            status={summary.status}
            placed={summary.placed}
            total={summary.total}
            cut={summary.cut}
            onFit={() => runtime.current?.fit()}
            onPause={() => setPauseOpen(true)}
          />
        )}

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
              className="touch-target rounded-[6px] bg-transparent px-[8px] font-[var(--font-data)] text-2"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setRenaming(null);
              }}
            />
            <button type="submit" className="touch-target px-[12px] text-2">
              Rename
            </button>
          </form>
        )}

        {screen === 'first-run' && summary.status !== 'complete' && (
          <FirstRunOverlay
            beat={firstRunBeat}
            onSkip={handleFirstRunSkip}
            comfort={(liveAssists ?? playConfig?.assists)?.comfort ?? false}
            onToggleComfort={() => {
              const assists = liveAssists ?? playConfig?.assists;
              if (!assists) return;
              const next = { ...assists, comfort: !assists.comfort };
              setLiveAssists(next);
              runtime.current?.setAssists(next);
            }}
          />
        )}
      </div>

      {/* §16: the tray is genuinely not mounted before the reveal beat —
          "slides in on its own" means absent, not collapsed. Ordinary play
          (screen !== 'first-run') is unaffected. */}
      {(screen !== 'first-run' || trayRevealed) && (
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
          onScroll={(top) => {
            trayScrollRef.current = top;
          }}
          initialScrollTop={restoreSnapshot?.tray.scroll}
        />
      )}

      {/* An overlay, never a replacement: the board stays mounted underneath,
          so pausing does not tear down `PlayRuntime` and re-cut on resume. */}
      {pauseOpen && (
        <PauseSheet
          puzzleId={playConfig.puzzleId}
          onResume={() => setPauseOpen(false)}
          onRestart={() => {
            void handleRestart();
          }}
          onLeave={() => {
            void handleLeave();
          }}
          assists={liveAssists ?? playConfig.assists}
          difficulty={liveDifficulty ?? playConfig.difficulty}
          onAssistsChange={(assists) => {
            setLiveAssists(assists);
            runtime.current?.setAssists(assists);
          }}
          onDifficultyChange={(difficulty) => {
            setLiveDifficulty(difficulty);
            runtime.current?.setDifficulty(difficulty);
          }}
        />
      )}
    </div>
  );
}
