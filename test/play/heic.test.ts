import { describe, expect, it } from 'vitest';
import { HEIC_HEAD_BYTES, looksLikeHeic, namedLikeHeic, sniffHeicBrand } from '@/play/heic';

/**
 * A minimal ISO-BMFF `ftyp` box: a 4-byte size, the literal `ftyp`, then the
 * 4-byte major brand. Real files carry a minor version and a compatible-brands
 * list after that; nothing here reads them, so nothing here writes them.
 */
function ftypHeader(majorBrand: string, boxSize = 24): Uint8Array {
  const head = new Uint8Array(HEIC_HEAD_BYTES);
  new DataView(head.buffer).setUint32(0, boxSize);
  const ascii = (text: string, at: number): void => {
    for (let i = 0; i < 4; i += 1) head[at + i] = text.charCodeAt(i);
  };
  ascii('ftyp', 4);
  ascii(majorBrand, 8);
  return head;
}

/** The first bytes of any JPEG: SOI, then the APP0/APP1 marker. */
function jpegHeader(): Uint8Array {
  const head = new Uint8Array(HEIC_HEAD_BYTES);
  head.set([0xff, 0xd8, 0xff, 0xe0]);
  return head;
}

describe('sniffHeicBrand', () => {
  it('reads the major brand of an iPhone HEIC', () => {
    expect(sniffHeicBrand(ftypHeader('heic'))).toBe('heic');
  });

  it('accepts the generic HEIF still-image brand some exports use', () => {
    expect(sniffHeicBrand(ftypHeader('mif1'))).toBe('mif1');
  });

  it('accepts the HEVC sequence brands', () => {
    expect(sniffHeicBrand(ftypHeader('hevc'))).toBe('hevc');
    expect(sniffHeicBrand(ftypHeader('heix'))).toBe('heix');
  });

  it('rejects AVIF, which shares the container but decodes natively', () => {
    // The trap: `mif1` appears in AVIF's *compatible* brands list, so a sniff
    // that scanned compatible brands would send every AVIF through libheif.
    // Only the major brand is consulted, and AVIF's is `avif`.
    expect(sniffHeicBrand(ftypHeader('avif'))).toBeNull();
    expect(sniffHeicBrand(ftypHeader('avis'))).toBeNull();
  });

  it('rejects an MP4, which is the same container with a video brand', () => {
    expect(sniffHeicBrand(ftypHeader('isom'))).toBeNull();
  });

  it('rejects a JPEG', () => {
    expect(sniffHeicBrand(jpegHeader())).toBeNull();
  });

  it('rejects a buffer too short to hold a brand', () => {
    expect(sniffHeicBrand(ftypHeader('heic').slice(0, 11))).toBeNull();
  });

  it('rejects a buffer whose box is not `ftyp`', () => {
    const head = ftypHeader('heic');
    head.set([0x6d, 0x64, 0x61, 0x74], 4); // `mdat`
    expect(sniffHeicBrand(head)).toBeNull();
  });
});

describe('looksLikeHeic', () => {
  it('believes the bytes over a MIME type that says JPEG', () => {
    // iOS and some share paths mislabel; the container cannot lie.
    expect(looksLikeHeic({ type: 'image/jpeg', name: 'photo.jpg' }, ftypHeader('heic'))).toBe(true);
  });

  it('believes the bytes over a filename that says HEIC', () => {
    expect(looksLikeHeic({ type: '', name: 'photo.heic' }, jpegHeader())).toBe(false);
  });

  it('falls back to the MIME type when no bytes are available', () => {
    expect(looksLikeHeic({ type: 'image/heic', name: 'photo' })).toBe(true);
    expect(looksLikeHeic({ type: 'image/heif', name: 'photo' })).toBe(true);
  });

  it('falls back to the extension when the MIME type is missing', () => {
    // Windows in particular reports no MIME type at all for `.heic`, which is
    // why the extension is a signal and not just a convenience.
    expect(looksLikeHeic({ type: '', name: 'IMG_0042.HEIC' })).toBe(true);
    expect(looksLikeHeic({ type: '', name: 'IMG_0042.heif' })).toBe(true);
  });

  it('is false for an ordinary JPEG on every signal', () => {
    expect(looksLikeHeic({ type: 'image/jpeg', name: 'photo.jpg' })).toBe(false);
    expect(looksLikeHeic({ type: 'image/jpeg', name: 'photo.jpg' }, jpegHeader())).toBe(false);
  });

  it('treats an empty buffer as no evidence, not as evidence against', () => {
    // A zero-length read is a failed read, not a JPEG.
    expect(looksLikeHeic({ type: 'image/heic', name: 'photo.heic' }, new Uint8Array(0))).toBe(true);
  });
});

describe('namedLikeHeic', () => {
  // Routing and messaging are different questions. Routing decides whether to
  // spend 3 MB of WASM, so it demands the container. Messaging only decides
  // what to tell a player whose upload already failed, so it is generous:
  // someone whose file is named `.heic` is better served by the HEIC advice
  // than by "couldn't open that photo", even when the bytes are truly corrupt.
  it('is true on the name or MIME type alone, with no bytes consulted', () => {
    expect(namedLikeHeic({ type: 'image/heic', name: 'whatever' })).toBe(true);
    expect(namedLikeHeic({ type: '', name: 'IMG_0042.HEIC' })).toBe(true);
  });

  it('is false for an ordinary JPEG', () => {
    expect(namedLikeHeic({ type: 'image/jpeg', name: 'photo.jpg' })).toBe(false);
  });

  it('stays true for a corrupt file that merely claims to be HEIC', () => {
    const corrupt = { type: 'image/heic', name: 'photo.heic' };
    // The sniff refuses to route it...
    expect(looksLikeHeic(corrupt, new Uint8Array([0x6e, 0x6f, 0x70, 0x65]))).toBe(false);
    // ...but the player still gets the useful message.
    expect(namedLikeHeic(corrupt)).toBe(true);
  });
});
