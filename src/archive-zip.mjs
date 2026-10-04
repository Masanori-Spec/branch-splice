import { Inflate, deflateSync } from 'fflate';
import { fail, LIMITS, ProfileError } from './archive-errors.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function safePath(path, { directory = false } = {}) {
  if (typeof path !== 'string' || !path || encoder.encode(path).length > 512 || path !== path.normalize('NFC') ||
      /[\\\x00-\x1f\x7f:%?#<>"\x27]/u.test(path) || path.startsWith('/') || (path.endsWith('/') && !directory)) {
    fail('ZIP_PATH', `Unsafe or unsupported archive path: ${String(path).slice(0, 160)}`);
  }
  const trimmed = directory && path.endsWith('/') ? path.slice(0, -1) : path;
  const parts = trimmed.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    fail('ZIP_PATH', `Unsafe archive path: ${path.slice(0, 160)}`);
  }
  return trimmed;
}

function pathRegistry() {
  const spellings = new Map(), entries = new Set(), files = new Set(), directories = new Set();
  return (path, directory) => {
    const canonical = safePath(path, { directory });
    const segments = canonical.split('/');
    for (let i = 1; i <= segments.length; i++) {
      const prefix = segments.slice(0, i).join('/'), key = prefix.toLowerCase();
      if (spellings.has(key) && spellings.get(key) !== prefix) fail('ZIP_ALIAS', `Case-alias archive path: ${path}`);
      spellings.set(key, prefix);
      if (i < segments.length) {
        if (files.has(key)) fail('ZIP_PATH_CONFLICT', `File used as a directory: ${prefix}`);
        directories.add(key);
      }
    }
    const key = canonical.toLowerCase();
    if (entries.has(key)) fail('ZIP_DUPLICATE', `Duplicate archive entry: ${path}`);
    if (!directory && directories.has(key)) fail('ZIP_PATH_CONFLICT', `Directory used as a file: ${path}`);
    entries.add(key);
    (directory ? directories : files).add(key);
  };
}

function utf8Name(bytes, flags) {
  if (!(flags & 0x800) && bytes.some(byte => byte > 127)) fail('ZIP_ENCODING', 'Non-ASCII ZIP paths require the UTF-8 flag');
  try { return decoder.decode(bytes); } catch { fail('ZIP_ENCODING', 'ZIP path is not valid UTF-8'); }
}
function extras(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 0; at < bytes.length;) {
    if (at + 4 > bytes.length) fail('ZIP_EXTRA', 'Truncated ZIP extra field');
    const tag = view.getUint16(at, true), length = view.getUint16(at + 2, true);
    at += 4;
    if (at + length > bytes.length) fail('ZIP_EXTRA', 'Truncated ZIP extra field');
    if (tag === 1) fail('ZIP64', 'ZIP64 archives are not supported');
    // These fields cannot override the path, compression or encryption interpretation.
    if (![0x5455, 0x7875, 0x000a].includes(tag)) fail('ZIP_EXTRA', `Unsupported ZIP extra field 0x${tag.toString(16)}`);
    at += length;
  }
}
function inflateBounded(data, size, name) {
  const output = new Uint8Array(size);
  let written = 0, finished = false;
  try {
    const stream = new Inflate((chunk, final) => {
      if (written + chunk.length > size || written + chunk.length > LIMITS.file) fail('ZIP_SIZE', `Inflation exceeds the declared size: ${name}`);
      output.set(chunk, written);
      written += chunk.length;
      finished = final;
    });
    // DEFLATE's maximum expansion per compressed byte is bounded. Tiny input pushes
    // prevent a forged tiny size from first allocating an unbounded decoded chunk.
    // No one-shot untrusted unzip/inflate API is used.
    if (!data.length) stream.push(data, true);
    for (let at = 0; at < data.length; at += 256) {
      stream.push(data.subarray(at, Math.min(at + 256, data.length)), at + 256 >= data.length);
    }
    // fflate 0.8.2 exposes its stream state on the instance. Check actual BFINAL
    // and consumed bytes: its callback's final flag alone only echoes our push.
    // Keep this completion invariant covered when changing the pinned dependency.
    if (stream.s.f !== 1 || stream.s.l || stream.p.length !== (stream.s.p ? 1 : 0)) fail('ZIP_DEFLATE', `Incomplete DEFLATE stream or trailing compressed bytes: ${name}`);
  } catch (error) {
    if (error instanceof ProfileError) throw error;
    fail('ZIP_DEFLATE', `Invalid DEFLATE stream in ${name}`);
  }
  if (!finished || written !== size) fail('ZIP_SIZE', `Inflated size differs from the declaration: ${name}`);
  return output;
}

export function readZip(bytes) {
  if (!(bytes instanceof Uint8Array)) fail('ZIP_INPUT', 'Expected a Uint8Array');
  if (bytes.length > LIMITS.compressed) fail('ZIP_COMPRESSED_LIMIT', 'Input exceeds 32 MiB compressed');
  if (bytes.length < 22) fail('ZIP_FORMAT', 'The package is not a complete ZIP archive');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = at => view.getUint16(at, true), u32 = at => view.getUint32(at, true);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 65535); at--) {
    if (u32(at) === 0x06054b50 && at + 22 + u16(at + 20) === bytes.length) { end = at; break; }
  }
  if (end < 0) fail('ZIP_FORMAT', 'Missing final ZIP directory record');
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) fail('ZIP_MULTIDISK', 'Split ZIP archives are not supported');
  const count = u16(end + 10), directorySize = u32(end + 12), directoryStart = u32(end + 16);
  if (count === 0xffff || directorySize === 0xffffffff || directoryStart === 0xffffffff) fail('ZIP64', 'ZIP64 archives are not supported');
  if (!count || count > LIMITS.entries) fail('ZIP_FILE_COUNT', 'ZIP must have between 1 and 4096 entries');
  if (directoryStart + directorySize !== end) fail('ZIP_FORMAT', 'Unexpected data outside the ZIP directory');
  const entries = [], register = pathRegistry();
  let at = directoryStart, expanded = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > end || u32(at) !== 0x02014b50) fail('ZIP_FORMAT', 'Truncated central directory');
    const version = u16(at + 6), flags = u16(at + 8), method = u16(at + 10);
    const checksum = u32(at + 16), compressed = u32(at + 20), size = u32(at + 24);
    const nameLength = u16(at + 28), extraLength = u16(at + 30), commentLength = u16(at + 32);
    const disk = u16(at + 34), attributes = u32(at + 38), localOffset = u32(at + 42);
    if (compressed === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff || version >= 45) fail('ZIP64', 'ZIP64 or newer ZIP features are not supported');
    if (version > 20 || flags & ~(0x800 | 8 | 6) || (method === 0 && (flags & 6))) fail('ZIP_FLAGS', 'Encryption or unsupported ZIP flags/version');
    if (method !== 0 && method !== 8) fail('ZIP_COMPRESSION', 'Only stored and DEFLATE files are supported');
    if (disk) fail('ZIP_MULTIDISK', 'Split ZIP archives are not supported');
    if (at + 46 + nameLength + extraLength + commentLength > end) fail('ZIP_FORMAT', 'Truncated central entry');
    const nameBytes = bytes.subarray(at + 46, at + 46 + nameLength);
    const name = utf8Name(nameBytes, flags), directory = name.endsWith('/');
    register(name, directory);
    const fileType = (attributes >>> 16) & 0xf000;
    if (![0, 0x8000, 0x4000].includes(fileType) || (fileType === 0x4000 && !directory) || (fileType === 0x8000 && directory) || ((attributes & 16) && !directory)) fail('ZIP_FILE_TYPE', `Links or nonregular files are not supported: ${name}`);
    extras(bytes.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength));
    if (size > LIMITS.file || (name.endsWith('.json') && size > LIMITS.json) || (directory && size)) fail('ZIP_FILE_LIMIT', `File exceeds the supported size: ${name}`);
    expanded += size;
    if (expanded > LIMITS.expanded) fail('ZIP_EXPANDED_LIMIT', 'Archive exceeds 64 MiB expanded');
    if (compressed > LIMITS.compressed || (method === 0 && compressed !== size)) fail('ZIP_SIZE', `Invalid compressed size: ${name}`);
    entries.push({ name, nameBytes, flags, method, checksum, compressed, size, localOffset, directory });
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (at !== end) fail('ZIP_FORMAT', 'Central directory size or entry count differs');
  let next = 0;
  // Validate all local records before decompressing anything. Contiguity rejects
  // overlapped entries, hidden local files, prefix stubs and aliased local offsets.
  for (const entry of [...entries].sort((a, b) => a.localOffset - b.localOffset)) {
    const { localOffset: start, flags, method, compressed, size, checksum, nameBytes, name } = entry;
    if (start !== next || start + 30 > directoryStart || u32(start) !== 0x04034b50) fail('ZIP_LAYOUT', 'Invalid or overlapping local ZIP records');
    const localFlags = u16(start + 6), localMethod = u16(start + 8), nameLength = u16(start + 26), extraLength = u16(start + 28);
    const payload = start + 30 + nameLength + extraLength;
    if (payload + compressed > directoryStart || localFlags !== flags || localMethod !== method || u16(start + 4) > 20) fail('ZIP_HEADER', `Local and central ZIP headers disagree: ${name}`);
    const localName = bytes.subarray(start + 30, start + 30 + nameLength);
    if (localName.length !== nameBytes.length || localName.some((b, i) => b !== nameBytes[i])) fail('ZIP_HEADER', `Local ZIP path differs: ${name}`);
    extras(bytes.subarray(start + 30 + nameLength, payload));
    const values = [u32(start + 14), u32(start + 18), u32(start + 22)], expected = [checksum, compressed, size];
    if (values.some((v, i) => v !== expected[i] && (!(flags & 8) || v !== 0))) fail('ZIP_HEADER', `Local ZIP sizes or CRC disagree: ${name}`);
    next = payload + compressed;
    if (flags & 8) {
      if (next + 12 > directoryStart) fail('ZIP_DESCRIPTOR', `Missing ZIP data descriptor: ${name}`);
      if (u32(next) === 0x08074b50) next += 4;
      if (next + 12 > directoryStart || u32(next) !== checksum || u32(next + 4) !== compressed || u32(next + 8) !== size) fail('ZIP_DESCRIPTOR', `Invalid ZIP data descriptor: ${name}`);
      next += 12;
    }
    entry.payload = payload;
  }
  if (next !== directoryStart) fail('ZIP_LAYOUT', 'Unexpected data before the central directory');
  const files = new Map();
  for (const entry of entries) {
    const data = bytes.subarray(entry.payload, entry.payload + entry.compressed);
    const output = entry.method === 0 ? data.slice() : inflateBounded(data, entry.size, entry.name);
    if (crc32(output) !== entry.checksum) fail('ZIP_CRC', `CRC mismatch: ${entry.name}`);
    if (!entry.directory) files.set(entry.name, output);
  }
  return files;
}

export function writeZip(files) {
  if (!(files instanceof Map) || !files.size || files.size > LIMITS.entries) fail('ZIP_FILE_COUNT', 'Expected a Map with 1–4096 files');
  const register = pathRegistry(), encoded = [];
  let expanded = 0, offset = 0, directorySize = 0;
  for (const [name, bytes] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    register(name, false);
    if (!(bytes instanceof Uint8Array) || bytes.length > LIMITS.file || (name.endsWith('.json') && bytes.length > LIMITS.json)) fail('ZIP_FILE_LIMIT', `Unsupported output file size: ${name}`);
    expanded += bytes.length;
    if (expanded > LIMITS.expanded) fail('ZIP_EXPANDED_LIMIT', 'Output exceeds 64 MiB expanded');
    const nameBytes = encoder.encode(name), compressed = deflateSync(bytes, { level: 6 });
    const data = compressed.length < bytes.length ? compressed : bytes;
    const record = { nameBytes, bytes, data, method: data === bytes ? 0 : 8, crc: crc32(bytes), offset };
    encoded.push(record);
    offset += 30 + nameBytes.length + data.length;
    directorySize += 46 + nameBytes.length;
    if (offset + directorySize + 22 > LIMITS.compressed) fail('ZIP_COMPRESSED_LIMIT', 'Output exceeds 32 MiB compressed');
  }
  const output = new Uint8Array(offset + directorySize + 22), view = new DataView(output.buffer);
  const u16 = (at, n) => view.setUint16(at, n, true), u32 = (at, n) => view.setUint32(at, n, true);
  let directory = offset;
  for (const record of encoded) {
    const { nameBytes, bytes, data, method, crc, offset: local } = record;
    u32(local, 0x04034b50); u16(local + 4, 20); u16(local + 6, 0x800); u16(local + 8, method);
    u16(local + 12, 33); // 1980-01-01, 00:00:00: reproducible ZIP timestamps.
    u32(local + 14, crc); u32(local + 18, data.length); u32(local + 22, bytes.length); u16(local + 26, nameBytes.length);
    output.set(nameBytes, local + 30); output.set(data, local + 30 + nameBytes.length);
    u32(directory, 0x02014b50); u16(directory + 4, 20); u16(directory + 6, 20); u16(directory + 8, 0x800); u16(directory + 10, method);
    u16(directory + 14, 33); u32(directory + 16, crc); u32(directory + 20, data.length); u32(directory + 24, bytes.length);
    u16(directory + 28, nameBytes.length); u32(directory + 42, local); output.set(nameBytes, directory + 46);
    directory += 46 + nameBytes.length;
  }
  u32(directory, 0x06054b50); u16(directory + 8, encoded.length); u16(directory + 10, encoded.length);
  u32(directory + 12, directorySize); u32(directory + 16, offset);
  return output;
}
