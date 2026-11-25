/**
 * Today — the first tab, and what a profile with history lands on (modernize
 * spec §4; born as the 2026-08-22 Home screen, the v2 spec §3 tab).
 *
 * The photo is the screen. Top to bottom on a phone: the header; the daily
 * hero, full-bleed, its copy on the measured scrim and its one primary in the
 * daily photo's accent (`Shell` sets it); the offline row, inline, never over
 * a button; "Keep going", a rail of boards lit over their unlit photo — or, with
 * nothing in progress, an invitation instead of an empty state; the streak and
 * collection cards; the install row last, web only. On a wide screen the hero
 * sits left with the cards stacked right and the rail below.
 *
 * Every decision is `src/play/today.ts`'s (`heroModel` and friends); this file
 * only draws what `App.tsx` hands it.
 */

import { useState } from "react";
import type { CompletionRecord } from "@/persist/completions";
import type { DateKey } from "@/daily/dates";
import type { DayCell } from "@/daily/streak";
import type { HeroModel } from "@/play/today";
import { isNative } from "@/platform";
import { ProgressRing } from "./ProgressRing";
import { PwaBanner } from "./PwaBanner";
import { ReopenedCard } from "./ReopenedCard";
import { CollectionCard, StreakCard, useObjectUrl } from "./TodayCards";
import { heroScrimBackground } from "./scrim";
import { useOnline } from "./useOnline";
import { Badge, Button, Icon } from "./kit";

export interface RailItem {
  puzzleId: string;
  title: string;
  placed: number;
  total: number;
  thumbnailBlob: Blob;
}

export interface TodayProps {
  /** e.g. "Sat 21 Nov", formatted by the caller. */
  dateLabel: string;
  daily: { title: string; photoUrl: string };
  hero: HeroModel;
  /** The daily's own board thumbnail, while it is in progress. */
  heroThumbnail: Blob | null;
  /** Today's daily's completion row, for "See your card". */
  doneRecord: CompletionRecord | null;
  /** In-progress puzzles other than today's daily, most recent first. */
  continuing: readonly RailItem[];
  streak: {
    numeral: number;
    line: string;
    pips: readonly DayCell[];
    today: DateKey;
  };
  collection: {
    finished: number;
    piecesPlaced: number;
    recent: readonly CompletionRecord[];
  };
  /** Start, or resume, today's daily — the same library entry either way. */
  onPlayDaily: () => void;
  onOpenDaily: () => void;
  onContinue: (puzzleId: string) => void;
  onNewPuzzle: () => void;
  onAllPuzzles: () => void;
  onOpenCollection: () => void;
  onSettings: () => void;
}

function Hero({
  daily,
  hero,
  heroThumbnail,
  onAction,
}: {
  daily: TodayProps["daily"];
  hero: HeroModel;
  heroThumbnail: Blob | null;
  onAction: () => void;
}): React.ReactElement {
  const thumbnailUrl = useObjectUrl(
    hero.state === "progress" ? heroThumbnail : null
  );
  const imageUrl = thumbnailUrl ?? daily.photoUrl;
  const actionName =
    hero.action?.label === "Start"
      ? `Start today’s puzzle: ${daily.title}`
      : hero.action?.label === "Keep going"
      ? `Keep going: ${daily.title}, ${hero.percent ?? 0}%`
      : hero.action?.label;

  return (
    <section
      aria-label="Today’s puzzle"
      className="relative flex min-h-[380px] shrink-0 flex-col justify-end overflow-hidden rounded-[var(--radius-lg)] bg-[var(--mat-deep)] lg:min-h-[392px]"
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className={`absolute inset-0 h-full w-full ${
            // The board thumbnail has the board's aspect, not the hero's:
            // cropping it would cut off the border pieces placed first.
            thumbnailUrl ? "object-contain" : "object-cover"
          }`}
        />
      )}
      {/* The hairline sits on the photo, not around it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[var(--radius-lg)] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]"
      />
      {/* B7: real ink on a measured scrim (`scrim.ts`). The top padding is the
          scrim's fade, both in px, so the eyebrow sits on the solid part —
          6.7:1 over a pure white sky. `--ink-muted` never goes here. In flow,
          not absolute: at 200% type the copy outgrows 380px, and the hero
          grows with it rather than clipping the title off the top. */}
      <div
        className="relative flex flex-col gap-2 p-5 pt-7"
        style={{ background: heroScrimBackground() }}
      >
        {/* `.eyebrow` is unlayered CSS and outranks a utility colour. */}
        <span className="eyebrow" style={{ color: "var(--ink-secondary)" }}>
          {hero.eyebrow}
        </span>
        <h2 className="m-0 font-display text-6 font-normal leading-tight text-[var(--ink-primary)] lg:text-7">
          {daily.title}
        </h2>
        <p className="meta m-0 text-[var(--ink-secondary)]">{hero.line}</p>
        <div className="mt-2 flex min-h-[var(--touch-min)] flex-wrap items-center gap-3">
          {hero.action && (
            <Button
              variant={hero.action.variant}
              size="lg"
              aria-label={actionName}
              onClick={onAction}
              className="min-w-[132px]"
            >
              {hero.action.label}
            </Button>
          )}
          {hero.percent !== null && (
            <span className="flex items-center gap-2">
              <ProgressRing completion={hero.percent / 100} size={32} />
              <span className="meta text-[var(--ink-secondary)]">
                {hero.percent}%
              </span>
            </span>
          )}
          {hero.state === "done" && (
            <Badge
              label="Done today"
              tone="success"
              icon={<Icon.Check size={12} />}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function RailCard({
  item,
  onOpen,
}: {
  item: RailItem;
  onOpen: (puzzleId: string) => void;
}): React.ReactElement {
  const url = useObjectUrl(item.thumbnailBlob);
  const completion = item.total === 0 ? 0 : item.placed / item.total;
  const percent = Math.round(completion * 100);
  return (
    <button
      type="button"
      aria-label={`Continue your puzzle: ${item.title}, ${percent}%`}
      onClick={() => onOpen(item.puzzleId)}
      className="flex w-[200px] shrink-0 flex-col gap-2 text-left transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)] active:scale-[0.98]"
    >
      <span className="block h-[150px] w-full overflow-hidden rounded-[var(--radius-md)] bg-[var(--mat-deep)] lg:h-[132px]">
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      </span>
      <span className="truncate px-[2px] font-display text-4 text-[var(--ink-primary)]">
        {item.title}
      </span>
      <span className="flex items-center gap-2 px-[2px]">
        <ProgressRing completion={completion} size={20} />
        <span className="meta text-[var(--ink-secondary)]">
          {percent}% · {item.total} pieces
        </span>
      </span>
    </button>
  );
}

function KeepGoing({
  items,
  onContinue,
  onNewPuzzle,
  onAllPuzzles,
}: {
  items: readonly RailItem[];
  onContinue: (puzzleId: string) => void;
  onNewPuzzle: () => void;
  onAllPuzzles: () => void;
}): React.ReactElement {
  return (
    <section
      aria-label="Keep going"
      className="flex min-w-0 flex-col [grid-area:rail]"
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="m-0 text-3 font-normal text-[var(--ink-primary)]">
          Keep going
        </h2>
        <button
          type="button"
          onClick={onAllPuzzles}
          className="touch-target px-1 text-2 text-[var(--ink-secondary)]"
        >
          All puzzles
        </button>
      </div>
      {/* Bleeds to the screen edge on a phone, so the next card peeks. */}
      <div className="-mr-4 flex gap-3 overflow-x-auto pb-1 pr-4">
        {items.map((item) => (
          <RailCard key={item.puzzleId} item={item} onOpen={onContinue} />
        ))}
        <button
          type="button"
          aria-label="New puzzle"
          onClick={onNewPuzzle}
          className="flex h-[150px] w-[120px] shrink-0 flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--edge-hair)] text-2 text-[var(--ink-secondary)] lg:h-[132px]"
        >
          <Icon.Plus size={20} />
          New puzzle
        </button>
      </div>
    </section>
  );
}

function Invitation({
  onNewPuzzle,
}: {
  onNewPuzzle: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-raised)] p-5 [grid-area:rail]">
      <p className="m-0 text-3 text-[var(--ink-secondary)]">
        Any photo works. Start with one you like looking at.
      </p>
      <Button
        variant="default"
        size="lg"
        aria-label="New puzzle"
        onClick={onNewPuzzle}
      >
        <span className="flex items-center justify-center gap-2">
          <Icon.Plus size={18} />
          New puzzle
        </span>
      </Button>
    </div>
  );
}

export function Today({
  dateLabel,
  daily,
  hero,
  heroThumbnail,
  doneRecord,
  continuing,
  streak,
  collection,
  onPlayDaily,
  onOpenDaily,
  onContinue,
  onNewPuzzle,
  onAllPuzzles,
  onOpenCollection,
  onSettings,
}: TodayProps): React.ReactElement {
  const online = useOnline();
  const [cardOpen, setCardOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-4 px-4 pb-6 pt-1 text-3 [animation:screen-in_var(--duration-slow)_var(--ease-standard)] lg:max-w-[72rem] lg:px-7">
      <header className="flex items-center justify-between gap-3 pl-1">
        <h1 className="m-0 font-display text-5 font-normal text-[var(--ink-primary)]">
          Tessera
        </h1>
        <span className="flex items-center gap-1">
          <span className="meta text-[var(--ink-secondary)]">{dateLabel}</span>
          <button
            type="button"
            aria-label="Settings"
            onClick={onSettings}
            className="touch-target flex items-center justify-center rounded-full text-[var(--ink-secondary)]"
          >
            <Icon.Gear />
          </button>
        </span>
      </header>

      <div className="grid gap-4 [grid-template-areas:'hero'_'rail'_'cards'] lg:grid-cols-[640px_1fr] lg:[grid-template-areas:'hero_cards'_'rail_rail']">
        {/* The offline row lives in the hero's column, so on a wide screen it
            never opens an empty grid row beside the cards. */}
        <div className="flex min-w-0 flex-col gap-4 [grid-area:hero]">
          <Hero
            daily={daily}
            hero={hero}
            heroThumbnail={heroThumbnail}
            onAction={() => {
              if (hero.state === "done") setCardOpen(true);
              else onPlayDaily();
            }}
          />

          {!online && (
            <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-raised)] px-4 py-3 text-2 text-[var(--ink-secondary)]">
              <Icon.Offline />
              <span>You’re offline. Puzzles you’ve started still work.</span>
            </div>
          )}
        </div>

        {continuing.length > 0 ? (
          <KeepGoing
            items={continuing}
            onContinue={onContinue}
            onNewPuzzle={onNewPuzzle}
            onAllPuzzles={onAllPuzzles}
          />
        ) : (
          <Invitation onNewPuzzle={onNewPuzzle} />
        )}

        <div className="grid grid-cols-2 gap-3 [grid-area:cards] lg:grid-cols-1 lg:grid-rows-2 lg:gap-4">
          <StreakCard
            numeral={streak.numeral}
            line={streak.line}
            pips={streak.pips}
            today={streak.today}
            onOpen={onOpenDaily}
          />
          <CollectionCard
            finished={collection.finished}
            piecesPlaced={collection.piecesPlaced}
            recent={collection.recent}
            onOpen={onOpenCollection}
          />
        </div>
      </div>

      {/* "Add to Home Screen" means nothing to an app that is already installed. */}
      {!isNative && <PwaBanner />}

      {cardOpen && doneRecord && (
        <ReopenedCard entry={doneRecord} onClose={() => setCardOpen(false)} />
      )}
    </div>
  );
}
