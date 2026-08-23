import { describe, expect, it } from 'vitest';
import {
  IDLE_WARNING_DAYS,
  INSTALL_PROMPT_MIN_COMPLETIONS,
  lastActivityAt,
  shouldOfferInstall,
  shouldWarnIdle,
} from '@/play/pwa';

describe('shouldOfferInstall', () => {
  it('stays silent before the second completion', () => {
    expect(shouldOfferInstall(0, false)).toBe(false);
    expect(shouldOfferInstall(INSTALL_PROMPT_MIN_COMPLETIONS - 1, false)).toBe(false);
  });

  it('offers from the second completion onward', () => {
    expect(shouldOfferInstall(INSTALL_PROMPT_MIN_COMPLETIONS, false)).toBe(true);
    expect(shouldOfferInstall(INSTALL_PROMPT_MIN_COMPLETIONS + 5, false)).toBe(true);
  });

  it('never offers once already installed', () => {
    expect(shouldOfferInstall(50, true)).toBe(false);
  });
});

describe('shouldWarnIdle', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.parse('2026-08-23T00:00:00Z');

  it('never warns a profile with no recorded activity', () => {
    expect(shouldWarnIdle(null, now)).toBe(false);
  });

  it('does not warn just under the threshold', () => {
    const lastActivity = now - (IDLE_WARNING_DAYS * day - 1);
    expect(shouldWarnIdle(lastActivity, now)).toBe(false);
  });

  it('warns at exactly the threshold and beyond', () => {
    expect(shouldWarnIdle(now - IDLE_WARNING_DAYS * day, now)).toBe(true);
    expect(shouldWarnIdle(now - 30 * day, now)).toBe(true);
  });
});

describe('lastActivityAt', () => {
  it('is null for a fresh profile with no library and no completions', () => {
    expect(lastActivityAt([], [])).toBeNull();
  });

  it('is the newest timestamp across both sources', () => {
    expect(lastActivityAt([100, 500], [300])).toBe(500);
    expect(lastActivityAt([100], [900, 300])).toBe(900);
  });
});
