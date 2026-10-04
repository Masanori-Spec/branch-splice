import { fail, LIMITS } from './archive-errors.mjs';
import { crc32 } from './archive-zip.mjs';
const ascii = (bytes, offset, count) => String.fromCharCode(...bytes.subarray(offset, offset + count));
function dimensions(width, height, name) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > LIMITS.dimension || height > LIMITS.dimension || width * height > LIMITS.pixels) fail('IMAGE_DIMENSION', `Image exceeds the 8192-side / 16-megapixel bound: ${name}`);
  return { width, height };
}
function invalid(name, reason) { fail('IMAGE_FORMAT', `${reason}: ${name}`); }

/** Inspect raster structure only. Never execute library code, HTML or SVG. */
export function inspectImage(bytes, name) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 10 || bytes.length > LIMITS.file) invalid(name, 'Invalid raster file size');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const be32 = at => view.getUint32(at, false), le32 = at => view.getUint32(at, true), le16 = at => view.getUint16(at, true);
  if (bytes.length >= 33 && bytes.subarray(0, 8).every((b, i) => b === [137, 80, 78, 71, 13, 10, 26, 10][i])) {
    let at = 8, size, hasData = false, ended = false, palette = false;
    while (at < bytes.length) {
      if (at + 12 > bytes.length) invalid(name, 'Truncated PNG chunk');
      const length = be32(at), type = ascii(bytes, at + 4, 4);
      if (length > LIMITS.file || at + 12 + length > bytes.length || !/^[A-Za-z]{4}$/.test(type)) invalid(name, 'Invalid PNG chunk');
      if (crc32(bytes.subarray(at + 4, at + 8 + length)) !== be32(at + 8 + length)) invalid(name, 'PNG chunk checksum mismatch');
      if (!size && type !== 'IHDR') invalid(name, 'PNG must begin with IHDR');
      if (type === 'IHDR') {
        if (size || length !== 13) invalid(name, 'Invalid PNG IHDR');
        size = dimensions(be32(at + 8), be32(at + 12), name);
        const depth = bytes[at + 16], colour = bytes[at + 17];
        const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
        if (!depths[colour]?.includes(depth) || bytes[at + 18] !== 0 || bytes[at + 19] !== 0 || bytes[at + 20] > 1) invalid(name, 'Unsupported PNG encoding');
        size.colour = colour;
      } else if (type === 'PLTE') {
        if (palette || hasData || !length || length > 768 || length % 3) invalid(name, 'Invalid PNG palette');
        palette = true;
      } else if (type === 'IDAT') {
        if (size.colour === 3 && !palette) invalid(name, 'Indexed PNG is missing its palette');
        hasData = true;
      } else if (type === 'IEND') {
        if (length || !hasData || at + 12 !== bytes.length) invalid(name, 'Invalid PNG ending');
        ended = true;
      } else if (['acTL', 'fcTL', 'fdAT'].includes(type)) {
        invalid(name, 'Animated PNG is outside the bounded image profile');
      } else if (type[0] === type[0].toUpperCase()) invalid(name, 'Unknown critical PNG chunk');
      at += length + 12;
    }
    if (!ended) invalid(name, 'PNG is missing IEND');
    return { mime: 'image/png', width: size.width, height: size.height };
  }
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') {
    if (bytes.length < 14) invalid(name, 'Truncated GIF header');
    const size = dimensions(le16(6), le16(8), name);
    let at = 13, frames = 0, ended = false;
    if (bytes[10] & 128) at += 3 * (1 << ((bytes[10] & 7) + 1));
    const blocks = () => {
      while (at < bytes.length) {
        const count = bytes[at++];
        if (!count) return;
        if (at + count > bytes.length) invalid(name, 'Truncated GIF subblock');
        at += count;
      }
      invalid(name, 'Unterminated GIF subblocks');
    };
    while (at < bytes.length) {
      const marker = bytes[at++];
      if (marker === 0x3b) { ended = true; break; }
      if (marker === 0x21) {
        if (at >= bytes.length) invalid(name, 'Truncated GIF extension');
        at++; blocks();
      } else if (marker === 0x2c) {
        if (++frames > 1) invalid(name, 'Animated GIF is outside the bounded image profile');
        if (at + 9 > bytes.length) invalid(name, 'Truncated GIF frame');
        const left = le16(at), top = le16(at + 2), width = le16(at + 4), height = le16(at + 6), flags = bytes[at + 8];
        dimensions(width, height, name);
        if (left + width > size.width || top + height > size.height) invalid(name, 'GIF frame exceeds its canvas');
        at += 9;
        if (flags & 128) at += 3 * (1 << ((flags & 7) + 1));
        if (at >= bytes.length || bytes[at] < 2 || bytes[at] > 8) invalid(name, 'Invalid GIF LZW code size');
        at++; blocks();
      } else invalid(name, 'Invalid GIF record');
    }
    if (!ended || at !== bytes.length || frames !== 1) invalid(name, 'Invalid GIF ending or missing frame');
    return { mime: 'image/gif', ...size };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2, size, scan = false, hadScan = false, ended = false;
    while (at < bytes.length) {
      if (scan) {
        while (at < bytes.length && bytes[at] !== 0xff) at++;
        if (at >= bytes.length) invalid(name, 'Missing JPEG ending');
      } else if (bytes[at] !== 0xff) invalid(name, 'Invalid JPEG marker');
      while (at < bytes.length && bytes[at] === 0xff) at++;
      if (at >= bytes.length) invalid(name, 'Truncated JPEG marker');
      const marker = bytes[at++];
      if (scan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
      scan = false;
      if (marker === 0xd9) { ended = true; break; }
      if (marker === 0 || marker === 0xd8 || marker === 0xdc || (marker >= 0xd0 && marker <= 0xd7)) invalid(name, 'Unsupported JPEG marker');
      if (marker === 1) continue;
      if (at + 2 > bytes.length) invalid(name, 'Truncated JPEG segment');
      const length = view.getUint16(at, false);
      if (length < 2 || at + length > bytes.length) invalid(name, 'Invalid JPEG segment size');
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (size || length < 8 || bytes[at + 2] !== 8) invalid(name, 'Unsupported JPEG frame');
        size = dimensions(view.getUint16(at + 5, false), view.getUint16(at + 3, false), name);
        const components = bytes[at + 7];
        if (![1, 3, 4].includes(components) || length !== 8 + components * 3) invalid(name, 'Invalid JPEG components');
      } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) invalid(name, 'Unsupported JPEG coding profile');
      if (marker === 0xda) {
        if (!size || length < 6) invalid(name, 'JPEG scan precedes its dimensions');
        hadScan = scan = true;
      }
      at += length;
    }
    if (!size || !hadScan || !ended || at !== bytes.length) invalid(name, 'Incomplete JPEG');
    return { mime: 'image/jpeg', ...size };
  }
  if (bytes.length >= 20 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    if (le32(4) !== bytes.length - 8) invalid(name, 'Invalid WebP RIFF size');
    let at = 12, size, canvas, frames = 0;
    while (at < bytes.length) {
      if (at + 8 > bytes.length) invalid(name, 'Truncated WebP chunk');
      const type = ascii(bytes, at, 4), length = le32(at + 4), data = at + 8;
      if (length > LIMITS.file || data + length + (length & 1) > bytes.length) invalid(name, 'Invalid WebP chunk size');
      if (type === 'VP8X') {
        if (canvas || frames || length !== 10 || (bytes[data] & 0xc3) || bytes[data + 1] || bytes[data + 2] || bytes[data + 3]) invalid(name, 'Unsupported or animated WebP canvas');
        const width = 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16);
        const height = 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16);
        canvas = dimensions(width, height, name);
      } else if (type === 'VP8 ') {
        if (++frames > 1 || length < 10 || (bytes[data] & 1) || bytes[data + 3] !== 0x9d || bytes[data + 4] !== 1 || bytes[data + 5] !== 0x2a) invalid(name, 'Invalid WebP VP8 frame');
        size = dimensions(le16(data + 6) & 0x3fff, le16(data + 8) & 0x3fff, name);
      } else if (type === 'VP8L') {
        if (++frames > 1 || length < 5 || bytes[data] !== 0x2f || (bytes[data + 4] & 0xe0)) invalid(name, 'Invalid WebP lossless frame');
        const packed = le32(data + 1);
        size = dimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1, name);
      } else if (!['ALPH', 'ICCP', 'EXIF', 'XMP '].includes(type)) invalid(name, 'Unsupported or animated WebP chunk');
      at = data + length + (length & 1);
    }
    if (!size || frames !== 1 || (canvas && (canvas.width !== size.width || canvas.height !== size.height))) invalid(name, 'Missing or inconsistent WebP dimensions');
    return { mime: 'image/webp', ...size };
  }
  invalid(name, 'Only structurally bounded PNG/JPEG/GIF/WebP rasters are supported');
}
