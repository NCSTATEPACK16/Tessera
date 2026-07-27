/**
 * The group chip's geometry, in one place.
 *
 * Two consumers — `Renderer.drawGroupChips` draws it, `PlayRuntime.groupChipAt`
 * hit-tests it — and canvas has no retained scene graph for the second to ask
 * the first. Two independent copies of this arithmetic drift, and the symptom is
 * a tap target that does not match the thing under the finger.
 *
 * Pure, and the text measurer is injected, so it is testable without a canvas.
 */

import { describe, expect, it } from 'vitest';
import { GROUP_CHIP, groupChipRect, groupChipText } from '@/render/group-chip';

/** A stub measurer: every glyph is 7px wide. */
const measure = (text: string): number => text.length * 7;

describe('groupChipText', () => {
  it('marks a collapsed group, because the chip is then the whole group', () => {
    expect(groupChipText('the roof', false)).toBe('the roof');
    expect(groupChipText('the roof', true)).toBe('the roof ⌄');
  });
});

describe('groupChipRect', () => {
  it('sits above its anchor, clear of the outline', () => {
    const rect = groupChipRect('Set 1', false, { x: 100, y: 200 }, measure);

    expect(rect.x).toBe(100);
    expect(rect.y).toBe(200 - GROUP_CHIP.height - GROUP_CHIP.gap);
    expect(rect.h).toBe(GROUP_CHIP.height);
  });

  it('is as wide as its text plus padding on both sides', () => {
    const rect = groupChipRect('Set 1', false, { x: 0, y: 0 }, measure);

    expect(rect.w).toBe(measure('Set 1') + GROUP_CHIP.padX * 2);
  });

  it('grows for the collapsed glyph — the tap target must not lag the chip', () => {
    const open = groupChipRect('Set 1', false, { x: 0, y: 0 }, measure);
    const shut = groupChipRect('Set 1', true, { x: 0, y: 0 }, measure);

    expect(shut.w).toBeGreaterThan(open.w);
  });
});
