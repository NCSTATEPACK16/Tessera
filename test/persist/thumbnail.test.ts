/**
 * `dataUrlToBlob` — the half of the synchronous thumbnail encode that has no
 * DOM in it. The encode itself, and the reason it is synchronous at all, is
 * asserted in a real browser by `persistence.spec.ts`.
 */

import { describe, expect, it } from 'vitest';
import { dataUrlToBlob } from '@/persist/thumbnail';

describe('dataUrlToBlob', () => {
  it('decodes the base64 payload byte for byte, keeping the MIME type', async () => {
    // A JPEG's SOI marker and the first bytes of an APP0 segment, 0xFF included
    // so a signed/unsigned slip in the byte copy would show.
    const bytes = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];
    const base64 = Buffer.from(bytes).toString('base64');

    const blob = dataUrlToBlob(`data:image/jpeg;base64,${base64}`);

    expect(blob.type).toBe('image/jpeg');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual(bytes);
  });

  it('decodes an empty payload to an empty blob', async () => {
    const blob = dataUrlToBlob('data:image/jpeg;base64,');
    expect(blob.size).toBe(0);
    expect(blob.type).toBe('image/jpeg');
  });
});
