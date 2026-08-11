/**
 * HEIC detection (Track 1).
 *
 * Pure and DOM-free, same standard as `src/play/photo.ts` — no File, no Blob,
 * no fetch. `heic-client.ts` owns reading the bytes and running the decoder;
 * this module only answers "is this a HEIC."
 *
 * ## Why three signals
 *
 * HEIC is what an iPhone shoots by default and what no browser decodes, so
 * getting this answer wrong means either a sideways failure the player can't
 * explain, or loading a 2.7 MB WASM decoder to convert a JPEG. Neither the
 * MIME type nor the extension is reliable on its own:
 *
 * - Windows frequently reports no MIME type at all for a `.heic` file.
 * - iOS and some share paths transcode to JPEG while keeping the `.heic` name,
 *   or hand over `image/jpeg` for bytes that are still HEIC.
 *
 * So the container is sniffed, and **the container wins**. The name and the
 * MIME type are only consulted when no bytes are available.
 */

/**
 * How many leading bytes `sniffHeicBrand` needs: a 4-byte box size, the
 * literal `ftyp`, and the 4-byte major brand. Rounded up to 16 because a
 * partial read of a Blob is no cheaper at 12.
 */
export const HEIC_HEAD_BYTES = 16;

/**
 * ISO-BMFF major brands that mean "HEIF still image, and a browser will not
 * decode it."
 *
 * **Only the major brand is consulted, deliberately.** `mif1` is the generic
 * HEIF brand and it also appears in the *compatible* brands list of every
 * AVIF file — so a sniff that scanned compatible brands would route every
 * AVIF through libheif, despite AVIF decoding natively everywhere we ship.
 * AVIF's major brand is `avif`/`avis`, which is not in this set.
 */
const HEIC_MAJOR_BRANDS: ReadonlySet<string> = new Set([
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

function ascii(bytes: Uint8Array, at: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[at + i] ?? 0);
  return out;
}

/**
 * The HEIF major brand of `head`, or `null` if these bytes are not a HEIF
 * still image. `head` should be the first `HEIC_HEAD_BYTES` bytes of the file.
 */
export function sniffHeicBrand(head: Uint8Array): string | null {
  if (head.length < 12) return null;
  if (ascii(head, 4, 4) !== 'ftyp') return null;
  const brand = ascii(head, 8, 4);
  return HEIC_MAJOR_BRANDS.has(brand) ? brand : null;
}

/** The parts of a `File` this module needs — kept structural so it stays DOM-free. */
export interface HeicNameHints {
  /** `File.type`. May be empty or wrong. */
  type: string;
  /** `File.name`. May carry the wrong extension. */
  name: string;
}

/**
 * Whether the *name or MIME type* claims HEIC. Bytes are never consulted.
 *
 * This is the messaging question, not the routing one — see `looksLikeHeic`.
 * A player whose upload failed and whose file is called `IMG_0042.HEIC` is
 * better served by the HEIC advice than by "couldn't open that photo", even
 * when the bytes turn out to be truly corrupt rather than HEIC.
 */
export function namedLikeHeic(file: HeicNameHints): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type.includes('heic') ||
    type.includes('heif') ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

/**
 * Whether `file` should be handed to the HEIC decoder.
 *
 * This is the routing question, and it is the expensive one — a false positive
 * costs a ~3 MB WASM download. So when `head` carries readable bytes they are
 * the only signal that counts, and a lying MIME type and a lying extension are
 * both overruled. When the read failed or was not attempted (`undefined`, or a
 * zero-length buffer), `namedLikeHeic` is the fallback: an empty buffer is a
 * *failed read*, not evidence that the file is not HEIC.
 */
export function looksLikeHeic(file: HeicNameHints, head?: Uint8Array | null): boolean {
  if (head && head.length > 0) return sniffHeicBrand(head) !== null;
  return namedLikeHeic(file);
}
