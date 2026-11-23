/**
 * The Today hero's scrim (modernize spec §4). Measured, not assumed: the B7
 * fix used a 0.85 → 0.55 → 0 gradient, and the eyebrow sat in the 0.55 band —
 * under 3:1 over a pale sky. The constant is the one number that decides
 * whether the caption is readable on any photo, so it is tested from both sides.
 */

import { describe, expect, it } from 'vitest';
import { HERO_SCRIM_ALPHA, heroScrimBackground, scrimContrastOverWhite } from '@/ui/scrim';

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
});
