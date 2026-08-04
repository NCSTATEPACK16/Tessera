/**
 * Splice a minimal APP1/Exif segment carrying one Orientation tag into a JPEG.
 *
 * Little-endian ("II"), one IFD0 entry: tag 0x0112 (Orientation), type 3
 * (SHORT), count 1. Everything else a real Exif block carries is optional for
 * this purpose, and omitting it keeps the fixture legible.
 */
export function withExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write('II', 0, 'ascii'); // little-endian
  tiff.writeUInt16LE(42, 2); // magic
  tiff.writeUInt32LE(8, 4); // offset to IFD0
  tiff.writeUInt16LE(1, 8); // one entry
  tiff.writeUInt16LE(0x0112, 10); // Orientation
  tiff.writeUInt16LE(3, 12); // SHORT
  tiff.writeUInt32LE(1, 14); // count
  tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt32LE(0, 22); // no next IFD

  const header = Buffer.from('Exif\0\0', 'ascii');
  const payload = Buffer.concat([header, tiff]);
  const segment = Buffer.alloc(4);
  segment.writeUInt16BE(0xffe1, 0); // APP1
  segment.writeUInt16BE(payload.length + 2, 2); // length includes itself

  // After SOI (the first two bytes), before everything else.
  return Buffer.concat([jpeg.subarray(0, 2), segment, payload, jpeg.subarray(2)]);
}
