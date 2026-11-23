/**
 * Pairing B's type roles, machine-checked (modernize spec §3, owner ruling
 * 2026-11-21): mono is for eyebrows and numerals that tick or count in place —
 * everything else a player reads is Inter Tight. Without this, `font-data`
 * creeps back into every subline, and on a 402pt phone mono is what wraps.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI = join(__dirname, '../../src/ui');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

const FILES = new Map(tsxFiles(UI).map((p) => [relative(UI, p), readFileSync(p, 'utf8')]));

const filesUsing = (pattern: RegExp): string[] =>
  [...FILES].filter(([, src]) => pattern.test(src)).map(([name]) => name).sort();

const countIn = (name: string, pattern: RegExp): number =>
  (FILES.get(name)?.match(new RegExp(pattern.source, 'g')) ?? []).length;

/**
 * Where mono stays: the live `n / N` (TopBar), lens counts (LensChips), the
 * order numeral (PieceChip), the calendar until phase e redesigns it
 * (MonthCalendar), and Badge, which is the eyebrow role in a pill.
 */
const MONO_ALLOWED = new Set([
  'TopBar.tsx',
  'LensChips.tsx',
  'PieceChip.tsx',
  'MonthCalendar.tsx',
  'kit/Badge.tsx',
]);

describe('chrome type roles', () => {
  it('finds the UI sources', () => {
    expect(FILES.size).toBeGreaterThan(20);
  });

  it('mono appears only at sanctioned sites (pairing B)', () => {
    expect(filesUsing(/\bfont-data\b|var\(--font-data\)/).filter((f) => !MONO_ALLOWED.has(f))).toEqual(
      [],
    );
  });

  it('PieceChip uses mono only for the order numeral', () => {
    expect(countIn('PieceChip.tsx', /\bfont-data\b/)).toBe(1);
  });

  it('no off-scale tracking or weight', () => {
    expect(filesUsing(/\btracking-(wide|wider|widest|tight|\[0)/)).toEqual([]);
    expect(filesUsing(/\bfont-(medium|semibold|bold)\b/)).toEqual([]);
  });
});
