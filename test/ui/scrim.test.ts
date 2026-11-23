/**
 * The Today hero's scrim (modernize spec §4). Measured, not assumed: the B7
 * fix used a 0.85 → 0.55 → 0 gradient, and the eyebrow sat in the 0.55 band —
 * under 3:1 over a pale sky. The constant is the one number that decides
 * whether the caption is readable on any photo, so it is tested from both sides.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HERO_SCRIM_ALPHA,
  HERO_SCRIM_FADE_PX,
  heroScrimBackground,
  scrimContrastOverWhite,
} from '@/ui/scrim';

const INK_SECONDARY = [0xb9, 0xc1, 0xcc] as const;
const INK_MUTED = [0x8a, 0x92, 0x9e] as const;

describe('hero scrim', () => {
  it('keeps --ink-secondary at AA over a pure white photo', () => {
    expect(scrimContrastOverWhite(INK_SECONDARY)).toBeGreaterThanOrEqual(4.5);
  });

  it('is guarding a real number: 0.70 would fail', () => {
    expect(scrimContrastOverWhite(INK_SECONDARY, 0.7)).toBeLessThan(4.5);
  });

  it('is why --ink-muted never goes on the hero', () => {
    expect(scrimContrastOverWhite(INK_MUTED)).toBeLessThan(4.5);
  });

  it('renders the gradient from the constants', () => {
    expect(HERO_SCRIM_ALPHA).toBe(0.82);
    expect(heroScrimBackground()).toContain('rgb(8 9 11 / 0.82)');
    expect(heroScrimBackground()).toContain('calc(100% - 64px)');
  });

  it("puts the eyebrow on the solid part at every root size: Today's top padding is the fade, in px", () => {
    // `pt-16` is 4rem: 56px at a 14px root, leaving the eyebrow's top in the
    // fade at alpha ~0.72, near the 4.25:1 failure. `pt-7` is --spacing-7, px.
    const ui = join(__dirname, '../../src/ui');
    const today = readFileSync(join(ui, 'Today.tsx'), 'utf8');
    const theme = readFileSync(join(ui, 'theme.css'), 'utf8');
    const copyBlock = today.match(/className="([^"]*)"\s*style=\{\{ background: heroScrimBackground\(\) \}\}/);
    expect(copyBlock, 'scrim copy block').not.toBeNull();
    expect(copyBlock![1]).toMatch(/(^|\s)pt-7(\s|$)/);
    expect(theme).toContain(`--spacing-7: ${HERO_SCRIM_FADE_PX}px;`);
  });
});
