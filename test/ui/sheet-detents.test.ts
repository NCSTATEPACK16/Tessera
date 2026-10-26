// v2 spec §5.2: the sheet opens at 35% so the board gets ~59% of a phone.
// The heights are the whole decision; `Sheet.tsx` only animates between them.
import { describe, expect, it } from 'vitest';
import {
  CHIP_CELL_PX,
  CHIP_GAP_PX,
  TWO_CHIP_ROWS_PX,
  heightOf,
  nearestDetent,
} from '@/ui/sheet-detents';

describe('heightOf', () => {
  it('opens at 35% of the viewport by default', () => {
    expect(heightOf('default', 844, false, null, null)).toBe(295);
  });
  it('keeps half at 50%', () => {
    expect(heightOf('half', 844, false, null, null)).toBe(422);
  });
  it('keeps full at 88%', () => {
    expect(heightOf('full', 844, false, null, null)).toBe(743);
  });
  it('grows peek to the measured pinned region', () => {
    expect(heightOf('peek', 844, true, 140, null)).toBe(140);
  });
  it('holds peek at its 96px floor otherwise', () => {
    expect(heightOf('peek', 844, false, 140, null)).toBe(96);
  });
});

describe('the default detent never hides the pieces', () => {
  // The pinned chrome (handle, title, reference row, lens row) is measured;
  // default must leave two full chip rows under it or the tray opens empty.
  it('stays at 35% when the chrome leaves two rows under it', () => {
    expect(heightOf('default', 844, false, null, 160)).toBe(295);
  });
  it('grows past 35% to fit the chrome plus two chip rows', () => {
    expect(heightOf('default', 844, false, null, 200)).toBe(200 + TWO_CHIP_ROWS_PX);
  });
  it('never grows past half', () => {
    expect(heightOf('default', 664, false, null, 260)).toBe(332);
  });
  it('two chip rows is two cells and the gaps around them', () => {
    expect(TWO_CHIP_ROWS_PX).toBe(2 * CHIP_CELL_PX + 2 * CHIP_GAP_PX);
  });
});

describe('nearestDetent', () => {
  it('settles a release near 35% on default', () => {
    expect(nearestDetent(300, 844, false, null, null)).toBe('default');
  });
  it('settles a release near 45% on half', () => {
    expect(nearestDetent(380, 844, false, null, null)).toBe('half');
  });
  it('settles a release near the bottom on peek', () => {
    expect(nearestDetent(100, 844, false, null, null)).toBe('peek');
  });
});
