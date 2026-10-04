import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { deflateSync } from 'fflate';
import { readModule, writeArchive, sha256, ProfileError } from '../src/archive.mjs';
import { readZip, crc32 } from '../src/archive-zip.mjs';
import { parseJson } from '../src/archive-json.mjs';
import { validateParams } from '../src/archive-params.mjs';
import { inspectImage } from '../src/archive-images.mjs';
import { LIMITS } from '../src/archive-errors.mjs';
import profile from '../src/library-profile.mjs';
import { validatePackageMetadata, validateNodeMetadata, validateCopyright } from '../src/archive-metadata.mjs';

const encode = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
const options = { id: 'test', filename: 'test.h5p' };
const isCode = code => error => error instanceof ProfileError && error.code === code;
const rejects = (fn, code) => assert.rejects(fn, isCode(code));
const throws = (fn, code) => assert.throws(fn, isCode(code));
const loaded = new Map();
async function fixture(id = 'B') {
  if (!loaded.has(id)) {
    const bytes = new Uint8Array(await fs.readFile(new URL(`../fixtures/h5p/module-${id}.h5p`, import.meta.url)));
    const files = readZip(bytes);
    loaded.set(id, { bytes, files, params: parseJson(files.get('content/content.json'), 'fixture') });
  }
  return loaded.get(id);
}

// Independent test-only ZIP emitter. Options deliberately produce hostile records
// that the production writer correctly refuses to create.
function hostileZip(entries, { descriptor = false } = {}) {
  let offset = 0, dirSize = 0;
  const records = entries.map(entry => {
    const bytes = entry.bytes ?? encode('ok'), name = encode(entry.name), localName = encode(entry.localName ?? entry.name);
    const method = entry.method ?? 0, data = entry.data ?? (method === 8 ? deflateSync(bytes) : bytes);
    const result = { bytes, name, localName, method, data, size: entry.size ?? bytes.length, compressed: entry.compressed ?? data.length, crc: entry.crc ?? crc32(bytes), offset, flags: entry.flags ?? (0x800 | (descriptor ? 8 : 0)), attrs: entry.attrs ?? 0, extra: entry.extra ?? new Uint8Array(), version: entry.version ?? 20 };
    offset += 30 + localName.length + result.extra.length + data.length + (descriptor ? 16 : 0);
    dirSize += 46 + name.length + result.extra.length;
    return result;
  });
  const out = new Uint8Array(offset + dirSize + 22), view = new DataView(out.buffer);
  const u16 = (at, value) => view.setUint16(at, value, true), u32 = (at, value) => view.setUint32(at, value, true);
  let directory = offset;
  for (const r of records) {
    const at = r.offset;
    u32(at, 0x04034b50); u16(at + 4, r.version); u16(at + 6, r.flags); u16(at + 8, r.method);
    u32(at + 14, descriptor ? 0 : r.crc); u32(at + 18, descriptor ? 0 : r.compressed); u32(at + 22, descriptor ? 0 : r.size);
    u16(at + 26, r.localName.length); u16(at + 28, r.extra.length); out.set(r.localName, at + 30); out.set(r.extra, at + 30 + r.localName.length);
    const dataStart = at + 30 + r.localName.length + r.extra.length;
    out.set(r.data, dataStart);
    if (descriptor) { const dd = dataStart + r.data.length; u32(dd, 0x08074b50); u32(dd + 4, r.crc); u32(dd + 8, r.compressed); u32(dd + 12, r.size); }
    u32(directory, 0x02014b50); u16(directory + 4, 20); u16(directory + 6, r.version); u16(directory + 8, r.flags); u16(directory + 10, r.method);
    u32(directory + 16, r.crc); u32(directory + 20, r.compressed); u32(directory + 24, r.size); u16(directory + 28, r.name.length); u16(directory + 30, r.extra.length);
    u32(directory + 38, r.attrs); u32(directory + 42, at); out.set(r.name, directory + 46); out.set(r.extra, directory + 46 + r.name.length);
    directory += 46 + r.name.length + r.extra.length;
  }
  u32(directory, 0x06054b50); u16(directory + 8, records.length); u16(directory + 10, records.length); u32(directory + 12, dirSize); u32(directory + 16, offset);
  return out;
}
function storedFiles(files) { return hostileZip([...files].map(([name, bytes]) => ({ name, bytes }))); }
async function modifiedPackage(mutate, id = 'B') {
  const base = await fixture(id), files = new Map(base.files), params = structuredClone(base.params);
  const h5p = parseJson(files.get('h5p.json'), 'h5p');
  mutate({ files, params, h5p });
  files.set('content/content.json', encode(params)); files.set('h5p.json', encode(h5p));
  return readModule(storedFiles(files), options);
}
async function changedParams(mutate) {
  const params = structuredClone((await fixture()).params);
  mutate(params.branchingScenario, params);
  return () => validateParams(params);
}

test('all three actual upstream-editor-authored native fixtures are accepted without rewriting parameters', async () => {
  for (const id of ['A', 'B', 'C']) {
    const original = await fixture(id), module = await readModule(original.bytes, { id, filename: `module-${id}.h5p` });
    assert.deepEqual(module.params, original.params);
    assert.equal(module.libraries.size, 70); assert.equal(module.params.branchingScenario.content.length, 4);
    assert.deepEqual(module.routes.map(route => route.nodes), [[0, 1, 2], [0, 1, 3]]);
    assert.equal(module.inputHash, await sha256(original.bytes)); assert.equal(module.sizeBytes, original.bytes.length);
    assert.equal(module.assets.size, id === 'A' ? 0 : 1);
    if (id !== 'A') { const asset = module.assets.get('images/map.png'); assert.equal(asset.mime, 'image/png'); assert.equal(asset.width, 96); assert.equal(asset.height, 64); }
  }
});

test('writer round-trips a real native package and is deterministic', async () => {
  const base = await fixture();
  const written = await writeArchive(base.files), second = await writeArchive(base.files);
  assert.deepEqual(written, second); assert(written.length < 10 * 1024 * 1024);
  const module = await readModule(written, options);
  assert.deepEqual(module.params, base.params);
  for (const [path, bytes] of base.files) assert.deepEqual(module.files.get(path), bytes, path);
});

test('ZIP accepts stored, deflated, empty and data-descriptor entries', () => {
  for (const descriptor of [false, true]) for (const method of [0, 8]) {
    const bytes = encode('hello'.repeat(1000));
    const zip = hostileZip([{ name: 'hello.txt', bytes, method }, { name: 'empty', bytes: new Uint8Array(), method }], { descriptor });
    assert.deepEqual(readZip(zip).get('hello.txt'), bytes); assert.equal(readZip(zip).get('empty').length, 0);
  }
});

test('ZIP rejects traversal, absolute paths, encoded paths, temporary suffixes and platform aliases', () => {
  for (const name of ['../x', 'content/../x', '/x', 'C:/x', 'content\\x', 'content//x', 'content/./x', 'content/x.', 'content/x ', 'content/%2e%2e/x', 'content/a#tmp', 'content/con.png', 'x\0y']) {
    throws(() => readZip(hostileZip([{ name }])), 'ZIP_PATH');
  }
  throws(() => readZip(hostileZip([{ name: 'content/a' }, { name: 'content/a' }])), 'ZIP_DUPLICATE');
  throws(() => readZip(hostileZip([{ name: 'Content/a' }, { name: 'content/b' }])), 'ZIP_ALIAS');
  throws(() => readZip(hostileZip([{ name: 'content/a' }, { name: 'content/A' }])), 'ZIP_ALIAS');
  throws(() => readZip(hostileZip([{ name: 'content' }, { name: 'content/a' }])), 'ZIP_PATH_CONFLICT');
  throws(() => readZip(hostileZip([{ name: 'content/a' }, { name: 'content' }])), 'ZIP_PATH_CONFLICT');
});

test('ZIP rejects local-header lies, encryption, symlinks, unsupported compression, ZIP64 and malformed extras', () => {
  throws(() => readZip(hostileZip([{ name: 'safe', localName: 'evil' }])), 'ZIP_HEADER');
  throws(() => readZip(hostileZip([{ name: 'x', flags: 0x801 }])), 'ZIP_FLAGS');
  throws(() => readZip(hostileZip([{ name: 'x', attrs: 0xa1ff0000 }])), 'ZIP_FILE_TYPE');
  throws(() => readZip(hostileZip([{ name: 'x', method: 99 }])), 'ZIP_COMPRESSION');
  throws(() => readZip(hostileZip([{ name: 'x', size: 0xffffffff }])), 'ZIP64');
  throws(() => readZip(hostileZip([{ name: 'x', extra: new Uint8Array([1, 0, 0, 0]) }])), 'ZIP64');
  throws(() => readZip(hostileZip([{ name: 'x', extra: new Uint8Array([0x75, 0x70, 0, 0]) }])), 'ZIP_EXTRA');
  throws(() => readZip(hostileZip([{ name: 'x', extra: new Uint8Array([1]) }])), 'ZIP_EXTRA');
  const zip = hostileZip([{ name: 'x' }]); new DataView(zip.buffer).setUint16(zip.length - 18, 1, true);
  throws(() => readZip(zip), 'ZIP_MULTIDISK');
});

test('ZIP rejects bad CRC, truncated/unfinished DEFLATE, and compressed trailing bytes', () => {
  throws(() => readZip(hostileZip([{ name: 'x', crc: 123 }])), 'ZIP_CRC');
  throws(() => readZip(hostileZip([{ name: 'x', bytes: new Uint8Array(), method: 8, data: new Uint8Array() }])), 'ZIP_DEFLATE');
  throws(() => readZip(hostileZip([{ name: 'x', bytes: new Uint8Array(), method: 8, data: new Uint8Array([2, 0]) }])), 'ZIP_DEFLATE');
  const bytes = encode('hello'), compressed = deflateSync(bytes), trailing = new Uint8Array(compressed.length + 2); trailing.set(compressed);
  throws(() => readZip(hostileZip([{ name: 'x', bytes, method: 8, data: trailing }])), 'ZIP_DEFLATE');
  const zip = hostileZip([{ name: 'x' }]);
  throws(() => readZip(zip.subarray(0, zip.length - 1)), 'ZIP_FORMAT');
});

test('ZIP enforces compressed, expanded, per-file, JSON, entry-count and actual inflation limits', () => {
  throws(() => readZip(new Uint8Array(LIMITS.compressed + 1)), 'ZIP_COMPRESSED_LIMIT');
  throws(() => readZip(hostileZip([{ name: 'x', method: 8, size: LIMITS.file + 1 }])), 'ZIP_FILE_LIMIT');
  throws(() => readZip(hostileZip([{ name: 'x.json', method: 8, size: LIMITS.json + 1 }])), 'ZIP_FILE_LIMIT');
  throws(() => readZip(hostileZip(Array.from({ length: 5 }, (_, i) => ({ name: `x${i}`, method: 8, size: LIMITS.file })))), 'ZIP_EXPANDED_LIMIT');
  throws(() => readZip(hostileZip(Array.from({ length: LIMITS.entries + 1 }, (_, i) => ({ name: `x${i}` })))), 'ZIP_FILE_COUNT');
  // A tiny declared size must be enforced during inflation, not after allocating the bomb.
  throws(() => readZip(hostileZip([{ name: 'bomb', bytes: new Uint8Array(1024 * 1024), method: 8, size: 1 }])), 'ZIP_SIZE');
});

test('strict JSON rejects duplicates, prototype keys, non-finite numbers and excess nesting', () => {
  throws(() => parseJson(encode('{"a":1,"a":2}'), 'test'), 'JSON_DUPLICATE');
  throws(() => parseJson(encode('{"__proto__":{}}'), 'test'), 'JSON_KEY');
  throws(() => parseJson(encode('1e999'), 'test'), 'JSON_NUMBER');
  throws(() => parseJson(encode('['.repeat(66) + '0' + ']'.repeat(66)), 'test'), 'JSON_DEPTH');
  throws(() => parseJson(new Uint8Array([0xff]), 'test'), 'JSON_ENCODING');
  throws(() => parseJson(encode('{"a":1,}'), 'test'), 'JSON_FORMAT');
  throws(() => parseJson(encode('true false'), 'test'), 'JSON_FORMAT');
  assert.deepEqual(parseJson(encode('{"x":[null,true,false,-12.5e2,"\\\"\\n"]}'), 'test'), { x: [null, true, false, -1250, '"\n'] });
});

test('graph rejects invalid/missing targets, duplicate UUIDs, cycles and unreachable content', async () => {
  for (const target of [-2, 4, 1.5, '2', null]) throws(await changedParams(s => { s.content[2].nextContentId = target; }), 'GRAPH_TARGET');
  throws(await changedParams(s => { delete s.content[2].nextContentId; }), 'GRAPH_TARGET');
  throws(await changedParams(s => { s.content[1].nextContentId = -1; }), 'GRAPH_TARGET');
  throws(await changedParams(s => { s.content[2].type.subContentId = s.content[0].type.subContentId; }), 'SUBCONTENT_DUPLICATE');
  throws(await changedParams(s => { s.content[3].nextContentId = 0; }), 'GRAPH_CYCLE');
  throws(await changedParams(s => { s.content[1].type.params.branchingQuestion.alternatives[1].nextContentId = 2; }), 'GRAPH_UNREACHABLE');
});

test('graph rejects >60 nodes and >512 complete routes, including paths with a shared suffix', async () => {
  const base = (await fixture()).params;
  const params = structuredClone(base), nodes = [];
  for (let i = 0; i < 10; i++) {
    const node = structuredClone(base.branchingScenario.content[1]);
    node.type.subContentId = `00000000-0000-4000-8000-${i.toString().padStart(12, '0')}`;
    for (const choice of node.type.params.branchingQuestion.alternatives) choice.nextContentId = i === 9 ? -1 : i + 1;
    nodes.push(node);
  }
  params.branchingScenario.content = nodes;
  throws(() => validateParams(params), 'GRAPH_ROUTE_LIMIT');
  params.branchingScenario.content = Array.from({ length: 61 }, () => structuredClone(nodes[0]));
  throws(() => validateParams(params), 'GRAPH_NODE_LIMIT');
});

test('profile rejects scoring, backwards navigation, forced completion, randomization and unsupported structures', async () => {
  throws(await changedParams(s => { s.scoringOptionGroup.scoringOption = 'dynamic-score'; }), 'SCORING_UNSUPPORTED');
  for (const field of ['enableBackwardsNavigation', 'forceContentFinished', 'randomizeBranchingQuestions']) throws(await changedParams(s => { s.behaviour[field] = true; }), 'BEHAVIOUR_UNSUPPORTED');
  for (const field of ['forceContentFinished', 'contentBehaviour']) throws(await changedParams(s => { s.content[0][field] = 'enabled'; }), 'BEHAVIOUR_UNSUPPORTED');
  throws(await changedParams(s => { s.content[2].feedback.endScreenScore = 0; }), 'SCORING_UNSUPPORTED');
  throws(await changedParams(s => { s.content[1].type.params.branchingQuestion.alternatives[0].feedback.endScreenScore = 0; }), 'SCORING_UNSUPPORTED');
  throws(await changedParams(s => { s.content[0].type.library = 'H5P.Video 1.6'; }), 'NODE_LIBRARY');
  throws(await changedParams(s => { s.content[0].type.params.video = {}; }), 'PARAMS_UNSUPPORTED');
  throws(await changedParams(s => { s.endScreens.push(structuredClone(s.endScreens[0])); }), 'ENDING_UNSUPPORTED');
});

test('typed image refs include original/start/end/node/choice images, preserve custom feedback and never search text', async () => {
  const params = structuredClone((await fixture()).params), s = params.branchingScenario, image = structuredClone(s.content[0].type.params.file);
  s.content[0].type.params.file.originalImage = structuredClone(image);
  s.startScreen.startScreenImage = structuredClone(image); s.endScreens[0].endScreenImage = structuredClone(image);
  s.content[2].feedback = { title: 'Custom title', subtitle: '<p>images/map.png</p>', image: structuredClone(image) };
  s.content[1].type.params.branchingQuestion.alternatives[0].feedback.image = structuredClone(image);
  s.content[2].type.params.text = '<p>images/map.png content/images/map.png</p>';
  const before = structuredClone(params), validated = validateParams(params);
  assert.equal(validated.typedImageRefs.length, 6); assert.deepEqual(params, before);
  assert(validated.typedImageRefs.some(ref => ref.pointer.at(-1) === 'originalImage'));
  assert(!validated.typedImageRefs.some(ref => ref.pointer.includes('text')));
});

test('typed images reject external/temp/SVG paths and inconsistent metadata', async () => {
  for (const path of ['https://example.test/x.png', '//example.test/x.png', 'images/map.png#tmp', '../map.png', 'images/map.svg']) {
    const fn = await changedParams(s => { s.content[0].type.params.file.path = path; });
    assert.throws(fn, error => error instanceof ProfileError && ['ZIP_PATH', 'IMAGE_PATH'].includes(error.code));
  }
  await rejects(() => modifiedPackage(({ params }) => { params.branchingScenario.content[0].type.params.file.width = 99; }), 'IMAGE_DIMENSION');
  await rejects(() => modifiedPackage(({ params }) => { params.branchingScenario.content[0].type.params.file.mime = 'image/jpeg'; }), 'IMAGE_MIME');
});

test('package rejects missing, changed, unknown or incomplete libraries and runtime dependency lies', async () => {
  await rejects(() => modifiedPackage(({ files }) => { files.delete('H5P.AdvancedText-1.1/text.js'); }), 'LIBRARY_MISSING');
  await rejects(() => modifiedPackage(({ files }) => { files.set('H5P.AdvancedText-1.1/text.js', encode('alert(1)')); }), 'LIBRARY_BYTES');
  await rejects(() => modifiedPackage(({ files }) => { files.set('H5P.AdvancedText-1.1/injected.js', encode('bad')); }), 'LIBRARY_FILE');
  await rejects(() => modifiedPackage(({ files }) => { files.set('H5P.Unknown-1.0/library.json', encode({})); }), 'LIBRARY_UNKNOWN');
  await rejects(() => modifiedPackage(({ h5p }) => { h5p.preloadedDependencies[0].minorVersion = 99; }), 'LIBRARY_UNKNOWN');
  await rejects(() => modifiedPackage(({ h5p }) => { h5p.preloadedDependencies.pop(); }), 'LIBRARY_DEPENDENCY');
  await rejects(() => modifiedPackage(({ files }) => { const path = 'H5P.AdvancedText-1.1/library.json'; const lib = parseJson(files.get(path), path); lib.patchVersion++; files.set(path, encode(lib)); }), 'LIBRARY_BYTES');
});

test('all raw official and exact native-export compact library.json encodings are accepted; other whitespace encodings fail', async () => {
  // The official AdvancedText 1.1.14 library.json is two-space JSON without a final newline.
  const raw = encode(JSON.stringify(profile['H5P.AdvancedText-1.1'].metadata, null, 2));
  assert.equal(await sha256(raw), profile['H5P.AdvancedText-1.1'].files['library.json']);
  const module = await modifiedPackage(({ files }) => { files.set('H5P.AdvancedText-1.1/library.json', raw); });
  assert.equal(module.libraries.get('H5P.AdvancedText-1.1').patchVersion, 14);
  await rejects(() => modifiedPackage(({ files }) => { files.set('H5P.AdvancedText-1.1/library.json', encode(JSON.stringify(profile['H5P.AdvancedText-1.1'].metadata, null, 3))); }), 'LIBRARY_BYTES');
});

test('package rejects missing media, untyped media and mismatched raster bytes', async () => {
  await rejects(() => modifiedPackage(({ files }) => { files.delete('content/images/map.png'); }), 'ASSET_MISSING');
  await rejects(() => modifiedPackage(({ files }) => { files.set('content/unknown.txt', encode('unused')); }), 'ASSET_UNREFERENCED');
  await rejects(() => modifiedPackage(({ files }) => { files.set('content/images/map.png', encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')); }), 'IMAGE_FORMAT');
});

test('PNG structure, checksums, dimensions and animation are bounded', async () => {
  const png = (await fixture()).files.get('content/images/map.png');
  assert.deepEqual(inspectImage(png, 'x.png'), { mime: 'image/png', width: 96, height: 64 });
  const broken = png.slice(); broken[20] ^= 1;
  throws(() => inspectImage(broken, 'x.png'), 'IMAGE_FORMAT');
  const huge = png.slice(), view = new DataView(huge.buffer);
  view.setUint32(16, 0xffffffff); view.setUint32(29, crc32(huge.subarray(12, 29)));
  throws(() => inspectImage(huge, 'x.png'), 'IMAGE_DIMENSION');
  const truncated = png.subarray(0, png.length - 1);
  throws(() => inspectImage(truncated, 'x.png'), 'IMAGE_FORMAT');
  const animation = new Uint8Array(png.length + 20); animation.set(png.subarray(0, 33));
  const av = new DataView(animation.buffer); av.setUint32(33, 8); animation.set(encode('acTL'), 37); av.setUint32(45, 1); av.setUint32(49, crc32(animation.subarray(37, 49))); animation.set(png.subarray(33), 53);
  throws(() => inspectImage(animation, 'x.png'), 'IMAGE_FORMAT');
});

test('known tiny GIF/JPEG/WebP headers are inspected without a browser decoder', () => {
  const gif = new Uint8Array(Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'));
  assert.deepEqual(inspectImage(gif, 'x.gif'), { mime: 'image/gif', width: 1, height: 1 });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0, 0xff, 0xd9]);
  assert.deepEqual(inspectImage(jpeg, 'x.jpg'), { mime: 'image/jpeg', width: 1, height: 1 });
  const webp = new Uint8Array(26), view = new DataView(webp.buffer);
  webp.set(encode('RIFF')); view.setUint32(4, 18, true); webp.set(encode('WEBPVP8L'), 8); view.setUint32(16, 5, true); webp[20] = 0x2f;
  assert.deepEqual(inspectImage(webp, 'x.webp'), { mime: 'image/webp', width: 1, height: 1 });
  const webpBad = webp.slice(); new DataView(webpBad.buffer).setUint32(4, 17, true);
  throws(() => inspectImage(webpBad, 'x.webp'), 'IMAGE_FORMAT');
});

test('rich HTML preserves safe formatting and links exactly, rejects active/untyped content without sanitizing', async () => {
  const safe = '<p style="text-align:center"><span style="font-size:18px;color:#123456;background-color:rgb(240, 240, 240)">A &amp; B</span><br><strong>Bold</strong> <a href="https://example.test/path?q=1&amp;v=2" target="_blank" rel="noopener noreferrer">Link</a></p><ul><li><em>item</em></li></ul>';
  const accepted = await changedParams(s => { s.content[2].type.params.text = safe; });
  assert.doesNotThrow(accepted);
  const payloads = [
    '<script>alert(1)</script>', '<iframe src="https://example.test"></iframe>', '<img src="images/map.png">',
    '<video src="x"></video>', '<audio src="x"></audio>', '<object data="x"></object>', '<svg><script>alert(1)</script></svg>',
    '<math><mtext><img src=x onerror=alert(1)></mtext></math>', '<p onclick="alert(1)">X</p>', '<a href="javascript:alert(1)">x</a>',
    '<a href="jav&#x61;script:alert(1)">x</a>', '<a href="java&#10;script:alert(1)">x</a>', '<a href="data:text/html,x">x</a>',
    '<a href="file:///etc/passwd">x</a>', '<a href="blob:https://example.test/x">x</a>', '<a href="//example.test">x</a>',
    '<p style="background-image:url(https://example.test/x)">x</p>', '<p style="color:expression(alert(1))">x</p>',
    '<p style="color:r\\65 d">x</p>', '<p style="@import url(x)">x</p>', '<p style="color:red;behavior:url(x)">x</p>',
    '<p style="color:red/*hidden*/">x</p>', '<a href="https://example.test" ping="https://evil.test">x</a>',
    '<form action="https://example.test"><input></form>', '<p id="location">x</p>', '<p data-library="evil">x</p>',
    '<a href="https://example.test" href="javascript:alert(1)">x</a>', '<!--[if IE]><script>alert(1)</script><![endif]-->'
  ];
  for (const html of payloads) throws(await changedParams(s => { s.content[2].type.params.text = html; }), 'HTML_UNSUPPORTED');
  const params = structuredClone((await fixture()).params); params.branchingScenario.content[2].type.params.text = safe;
  const before = JSON.stringify(params); validateParams(params); assert.equal(JSON.stringify(params), before);
});

test('all rendered question/feedback/start/end fields and choice labels use the same HTML gate', async () => {
  const payload = '<img src=x onerror=alert(1)>';
  const mutations = [
    s => { s.content[1].type.params.branchingQuestion.question = payload; },
    s => { s.content[1].type.params.branchingQuestion.alternatives[0].text = payload; },
    s => { s.content[1].type.params.branchingQuestion.alternatives[0].feedback.title = payload; },
    s => { s.content[2].feedback.subtitle = payload; },
    s => { s.startScreen.startScreenTitle = payload; },
    s => { s.startScreen.startScreenSubtitle = payload; },
    s => { s.endScreens[0].endScreenTitle = payload; },
    s => { s.endScreens[0].endScreenSubtitle = payload; }
  ];
  for (const mutation of mutations) throws(await changedParams(mutation), 'HTML_UNSUPPORTED');
});

test('rich HTML has source-size, node-count and depth limits', async () => {
  throws(await changedParams(s => { s.content[2].type.params.text = 'x'.repeat(131073); }), 'HTML_LIMIT');
  throws(await changedParams(s => { s.content[2].type.params.text = '<br>'.repeat(4097); }), 'HTML_LIMIT');
  throws(await changedParams(s => { s.content[2].type.params.text = '<div>'.repeat(35) + 'x' + '</div>'.repeat(35); }), 'HTML_LIMIT');
});

test('hidden library keys in metadata/copyright/package data are rejected; ordinary metadata stays unchanged', async () => {
  throws(await changedParams(s => { s.content[0].type.metadata.extra = { nested: [{ library: 'H5P.Video 1.6' }] }; }), 'LIBRARY_HIDDEN');
  throws(await changedParams(s => { s.content[0].type.params.file.copyright.library = 'H5P.Video 1.6'; }), 'LIBRARY_HIDDEN');
  await rejects(() => modifiedPackage(({ h5p }) => { h5p.custom = { library: 'H5P.Video 1.6' }; }), 'LIBRARY_HIDDEN');
  const params = structuredClone((await fixture()).params);
  params.branchingScenario.content[0].type.metadata = { title: 'Rights remain untouched', license: 'CC BY', authors: [{ name: 'Author', role: 'Author' }], source: 'https://example.test/work', changes: [] };
  const original = structuredClone(params); validateParams(params); assert.deepEqual(params, original);
});

test('native decorative image alt:null is preserved only when decorative is true', async () => {
  const params = structuredClone((await fixture()).params);
  const image = params.branchingScenario.content[0].type.params; image.decorative = true; image.alt = null;
  assert.doesNotThrow(() => validateParams(params)); assert.equal(image.alt, null);
  image.decorative = false; throws(() => validateParams(params), 'PARAMS_TYPE');
});

test('pinned consumer title/button HTML sinks and double-parsed Image text cannot carry active payloads', async () => {
  const active = '<img src=x onerror=alert(1)>', encoded = '&lt;img src=x onerror=alert(1)&gt;';
  const mutations = [
    s => { s.title = active; }, s => { s.content[2].proceedButtonText = active; },
    s => { s.content[2].type.metadata.title = active; }, s => { s.content[2].type.metadata.extraTitle = active; },
    s => { s.content[0].type.params.alt = active; }, s => { s.content[0].type.params.title = active; },
    s => { s.content[0].type.params.alt = encoded; }, s => { s.content[0].type.params.title = encoded; }
  ];
  for (const mutate of mutations) throws(await changedParams(mutate), 'HTML_UNSUPPORTED');
  await rejects(() => modifiedPackage(({ h5p }) => { h5p.title = active; }), 'HTML_UNSUPPORTED');
  await rejects(() => modifiedPackage(({ h5p }) => { h5p.extraTitle = active; }), 'HTML_UNSUPPORTED');
  assert.doesNotThrow(await changedParams(s => { s.content[0].type.params.alt = 'Registration &amp; event map'; }));
});

test('bounded ZIP mutation sweep returns data or a structured ProfileError, never an unchecked parser exception', async () => {
  const original = await writeArchive(new Map([['content/content.json', encode('{"branchingScenario":{}}')], ['x', new Uint8Array(300).fill(42)]]));
  for (let trial = 1; trial <= 3000; trial++) {
    const zip = original.slice(); let seed = trial;
    for (let i = 0; i < 1 + (trial % 5); i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const at = seed % zip.length;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; zip[at] ^= (seed & 255) || 1;
    }
    try { readZip(zip); } catch (error) { assert(error instanceof ProfileError, `Unexpected error at mutation ${trial}: ${error}`); }
  }
});


test('native-required feedback objects reject absent/null slots on every node and choice without synthesis', async () => {
  for (const absent of [true, false]) {
    for (const nodeIndex of [0, 1, 2, 3]) {
      throws(await changedParams(s => {
        if (absent) delete s.content[nodeIndex].feedback;
        else s.content[nodeIndex].feedback = null;
      }), 'PARAMS_TYPE');
    }
    for (const alternativeIndex of [0, 1]) {
      throws(await changedParams(s => {
        const alternative = s.content[1].type.params.branchingQuestion.alternatives[alternativeIndex];
        if (absent) delete alternative.feedback;
        else alternative.feedback = null;
      }), 'PARAMS_TYPE');
    }
    for (const kind of ['node', 'choice']) {
      await rejects(() => modifiedPackage(({ params }) => {
        const scenario = params.branchingScenario;
        const owner = kind === 'node' ? scenario.content[2] : scenario.content[1].type.params.branchingQuestion.alternatives[0];
        if (absent) delete owner.feedback;
        else owner.feedback = null;
      }), 'PARAMS_TYPE');
    }
  }
  const params = structuredClone((await fixture()).params);
  delete params.branchingScenario.content[2].feedback;
  const before = structuredClone(params);
  throws(() => validateParams(params), 'PARAMS_TYPE');
  assert.deepEqual(params, before);
  assert.equal(Object.hasOwn(params.branchingScenario.content[2], 'feedback'), false);
});


test('package metadata rejects every independent native-schema reproducer and unknown record data', async () => {
  const cases = [
    [({ h5p }) => { delete h5p.language; }, 'METADATA_REQUIRED'],
    [({ h5p }) => { delete h5p.embedTypes; }, 'METADATA_REQUIRED'],
    [({ h5p }) => { h5p.license = { unexpected: 'object' }; }, 'METADATA_TYPE'],
    [({ h5p }) => { h5p.title = 'a'.repeat(256); }, 'METADATA_LIMIT'],
    [({ h5p }) => { h5p.learnerRecords = { syntheticRecords: [] }; }, 'METADATA_FIELD'],
    [({ params }) => { params.branchingScenario.content[0].type.metadata.learnerRecords = { syntheticRecords: [] }; }, 'METADATA_FIELD']
  ];
  for (const [mutate, code] of cases) await rejects(() => modifiedPackage(mutate), code);
});

test('package metadata has bounded exact native types, lengths, enums and nested known-key records', async () => {
  const base = parseJson((await fixture()).files.get('h5p.json'), 'h5p.json');
  const invalid = [
    [h => { h.language = 1; }, 'METADATA_TYPE'], [h => { h.language = 'en_US'; }, 'METADATA_VALUE'],
    [h => { h.embedTypes = 'iframe'; }, 'METADATA_TYPE'], [h => { h.embedTypes = []; }, 'METADATA_VALUE'],
    [h => { h.embedTypes = ['iframe', 'iframe']; }, 'METADATA_VALUE'], [h => { h.embedTypes = ['object']; }, 'METADATA_VALUE'],
    [h => { h.license = 'Unspecified License'; }, 'METADATA_VALUE'], [h => { h.licenseVersion = '9.0'; }, 'METADATA_VALUE'],
    [h => { h.title = 'a\nb'; }, 'METADATA_VALUE'], [h => { h.authors = {}; }, 'METADATA_TYPE'],
    [h => { h.authors = [{ name: 'Author', role: 'Owner' }]; }, 'METADATA_VALUE'],
    [h => { h.authors = [{ name: 'Author', role: 'Author', records: [] }]; }, 'METADATA_FIELD'],
    [h => { h.changes = [{ date: '2026-10-04', author: 'Author', log: 'A change' }]; }, 'METADATA_VALUE'],
    [h => { h.changes = [{ date: '26-10-04 12:00:00', author: 'Author' }]; }, 'METADATA_REQUIRED'],
    [h => { h.changes = [{ date: '26-10-04 12:00:00', author: 'Author', log: 'A change', learnerRecords: [] }]; }, 'METADATA_FIELD'],
    [h => { h.yearsFrom = 2020; }, 'METADATA_VALUE'], [h => { h.yearFrom = '2020'; }, 'METADATA_VALUE'],
    [h => { h.w = 800; }, 'METADATA_VALUE'], [h => { h.authorComments = 'a'.repeat(5001); }, 'METADATA_LIMIT'],
    [h => { h.authors = Array.from({ length: 65 }, () => ({ name: 'Author', role: 'Author' })); }, 'METADATA_LIMIT'],
    [h => { h.changes = Array.from({ length: 257 }, () => ({ date: '26-10-04 12:00:00', author: 'Author', log: 'Change' })); }, 'METADATA_LIMIT']
  ];
  for (const [mutate, code] of invalid) { const h = structuredClone(base); mutate(h); throws(() => validatePackageMetadata(h), code); }
  const intact = structuredClone(base); validatePackageMetadata(intact); assert.deepEqual(intact, base);
});

test('approved package/node/copyright rights metadata is retained exactly without coercion or synthesis', async () => {
  const packageRights = {
    contentType: 'Branching Scenario', a11yTitle: 'Accessible course', author: 'Legacy Author',
    authors: [{ name: 'Original Author', role: 'Author' }, { name: 'Editor', role: 'Editor' }],
    source: 'https://example.test/rights?work=1&edition=2', license: 'CC BY', licenseVersion: '4.0',
    licenseExtras: 'Attribution retained.\nSecond line.', authorComments: 'Review notes stay intact.',
    yearsFrom: '2020', yearsTo: '2026', yearFrom: 2020, yearTo: 2026, w: '800', h: '600',
    metaKeywords: 'event, training', metaDescription: 'Original package description',
    changes: [{ date: '26-10-04 12:00:00', author: 'Editor', log: 'Kept the original rights.' }]
  };
  const nodeRights = {
    title: 'Original image', extraTitle: 'Original image search title', contentType: 'Image', a11yTitle: 'Image description',
    license: 'CC BY-SA', licenseVersion: '4.0', yearFrom: -100, yearTo: 2026,
    source: 'https://example.test/original', authors: [{ name: 'Creator', role: 'Originator' }],
    licenseExtras: 'Keep attribution.', authorComments: 'Editorial note.',
    changes: [{ date: '2026-10-04', author: 'Editor', log: 'Cropped image.\nKept the source.' }]
  };
  const copyright = { title: 'Original raster', author: 'Creator', year: '2020–2026', source: 'https://example.test/image', license: 'CC BY', version: '4.0' };
  const module = await modifiedPackage(({ h5p, params }) => {
    Object.assign(h5p, packageRights); params.branchingScenario.content[0].type.metadata = structuredClone(nodeRights);
    params.branchingScenario.content[0].type.params.file.copyright = structuredClone(copyright);
  });
  for (const [key, value] of Object.entries(packageRights)) assert.deepEqual(module.h5p[key], value, key);
  assert.deepEqual(module.params.branchingScenario.content[0].type.metadata, nodeRights);
  assert.deepEqual(module.params.branchingScenario.content[0].type.params.file.copyright, copyright);
  assert.equal(typeof module.h5p.yearsFrom, 'string'); assert.equal(typeof module.h5p.yearFrom, 'number');
  const empty = { title: 'Native default', license: 'U', authors: [], changes: [] };
  const before = structuredClone(empty); validateNodeMetadata(empty, 'metadata'); assert.deepEqual(empty, before);
  const undisclosed = { license: 'U' }; validateCopyright(undisclosed, 'copyright'); assert.deepEqual(undisclosed, { license: 'U' });
});

test('copyright rejects unknown nested data, wrong types and nonnative license-version combinations', async () => {
  const cases = [
    [{ license: 'U', learnerRecords: [] }, 'METADATA_FIELD'],
    [{ title: { learnerRecords: [] } }, 'METADATA_TYPE'],
    [{ author: ['Author'] }, 'METADATA_TYPE'],
    [{ year: 2026 }, 'METADATA_TYPE'],
    [{ license: {} }, 'METADATA_TYPE'],
    [{ license: 'MIT' }, 'METADATA_VALUE'],
    [{ license: 'CC BY', version: 'v3' }, 'METADATA_VALUE'],
    [{ license: 'GNU GPL', version: '4.0' }, 'METADATA_VALUE']
  ];
  for (const [data, code] of cases) throws(() => validateCopyright(data, 'copyright'), code);
  assert.doesNotThrow(() => validateCopyright({ license: 'GNU GPL', version: 'v3' }, 'copyright'));
  assert.doesNotThrow(() => validateCopyright({ license: 'PD', version: 'CC0 1.0' }, 'copyright'));
  await rejects(() => modifiedPackage(({ params }) => { params.branchingScenario.content[0].type.params.file.copyright.extra = { learners: [] }; }), 'METADATA_FIELD');
});

test('native copyright HTML and thumbnail serialization reject active metadata and attribute breakouts', async () => {
  const active = '<img src=x onerror=alert(1)>';
  for (const field of ['title', 'author', 'year']) throws(() => validateCopyright({ [field]: active }, 'copyright'), 'HTML_UNSUPPORTED');
  for (const data of [
    { authors: [{ name: active, role: 'Author' }] },
    { changes: [{ date: '2026-10-04', author: 'Author', log: active }] },
    { licenseExtras: active }, { authorComments: active }, { contentType: active }
  ]) throws(() => validateNodeMetadata(data, 'metadata'), 'HTML_UNSUPPORTED');
  for (const source of ['javascript:alert(1)', 'data:text/html,x', 'https://example.test/x" onmouseover="alert(1)', 'https://example.test/<img>', 'https://example.test/a\nb', 'https://user:password@example.test']) {
    throws(() => validateCopyright({ source }, 'copyright'), source.includes('\n') ? 'METADATA_VALUE' : 'METADATA_URL');
  }
  throws(await changedParams(s => { s.content[0].type.params.alt = 'x" onerror="alert(1)'; }), 'HTML_UNSUPPORTED');
  for (const path of ['images/x" onerror="alert(1).png', "images/x'quoted.png", 'images/<tag>.png']) {
    throws(() => readZip(hostileZip([{ name: `content/${path}` }])), 'ZIP_PATH');
    throws(await changedParams(s => { s.content[0].type.params.file.path = path; }), 'ZIP_PATH');
  }
});


test('native node-only optional author/changelog fields remain unchanged while package records stay strict', () => {
  const metadata = { title: 'Native partial rights', license: 'U', authors: [{ role: 'Author' }, { name: '', role: 'Editor' }], changes: [{}, { date: '', author: '', log: '' }] };
  const before = structuredClone(metadata); validateNodeMetadata(metadata, 'metadata'); assert.deepEqual(metadata, before);
  for (const invalid of [{ authors: [{ name: [], role: 'Author' }] }, { changes: [{ log: {} }] }]) throws(() => validateNodeMetadata(invalid, 'metadata'), 'METADATA_TYPE');
});
