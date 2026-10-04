import profile from './library-profile.mjs';
import { ProfileError, fail } from './archive-errors.mjs';
import { readZip, writeZip } from './archive-zip.mjs';
import { parseJson } from './archive-json.mjs';
import { validateParams, object } from './archive-params.mjs';
import { inspectImage } from './archive-images.mjs';
import { rejectHiddenLibraries } from './archive-html.mjs';
import { validatePackageMetadata } from './archive-metadata.mjs';

export { ProfileError };
const encoder = new TextEncoder();
export async function sha256(bytes) {
  if (!(bytes instanceof Uint8Array)) fail('HASH_INPUT', 'Expected a Uint8Array');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function dependencyFolder(dependency) {
  object(dependency, 'library dependency');
  if (Object.keys(dependency).some(key => !['machineName', 'majorVersion', 'minorVersion'].includes(key)) ||
      typeof dependency.machineName !== 'string' || !Number.isInteger(dependency.majorVersion) || !Number.isInteger(dependency.minorVersion)) fail('LIBRARY_DEPENDENCY', 'Malformed or unsupported dependency declaration');
  const folder = `${dependency.machineName}-${dependency.majorVersion}.${dependency.minorVersion}`;
  if (!own(profile, folder)) fail('LIBRARY_UNKNOWN', `Library is outside the pinned official profile: ${folder}`);
  return folder;
}
function closure(roots, kinds) {
  const result = new Set(), pending = [...roots];
  while (pending.length) {
    const folder = pending.pop();
    if (result.has(folder)) continue;
    if (!own(profile, folder)) fail('LIBRARY_UNKNOWN', `Unknown library: ${folder}`);
    result.add(folder);
    for (const kind of kinds) for (const dependency of profile[folder].metadata[kind] ?? []) pending.push(dependencyFolder(dependency));
  }
  return result;
}
let compactHashes;
function acceptedCompactHashes() {
  compactHashes ??= Promise.all(Object.entries(profile).map(async ([folder, entry]) => [folder, await sha256(encoder.encode(JSON.stringify(entry.metadata)))])).then(entries => new Map(entries));
  return compactHashes;
}

export async function readModule(bytes, { id, filename } = {}) {
  if (typeof id !== 'string' || !id || typeof filename !== 'string' || !filename) fail('MODULE_ID', 'A nonempty module id and filename are required');
  const files = readZip(bytes);
  if (!files.has('h5p.json') || !files.has('content/content.json')) fail('PACKAGE_REQUIRED', 'The package needs h5p.json and content/content.json');
  const h5p = object(parseJson(files.get('h5p.json'), 'h5p.json'), 'h5p.json');
  rejectHiddenLibraries(h5p);
  if (h5p.mainLibrary !== 'H5P.BranchingScenario') fail('PACKAGE_MAIN', 'Only native H5P.BranchingScenario packages are supported');
  validatePackageMetadata(h5p);
  if (!Array.isArray(h5p.preloadedDependencies)) fail('LIBRARY_DEPENDENCY', 'Missing package preloadedDependencies');
  for (const key of ['dynamicDependencies', 'editorDependencies']) if (h5p[key] !== undefined && (!Array.isArray(h5p[key]) || h5p[key].length)) fail('LIBRARY_DEPENDENCY', `Nonempty package ${key} is unsupported`);
  const params = parseJson(files.get('content/content.json'), 'content/content.json');
  const { typedImageRefs, routes, usedLibraries } = validateParams(params);
  const runtimeLibraries = closure(usedLibraries, ['preloadedDependencies', 'dynamicDependencies']);
  const declared = h5p.preloadedDependencies.map(dependencyFolder);
  if (new Set(declared).size !== declared.length) fail('LIBRARY_DEPENDENCY', 'Duplicate runtime dependency declaration');
  if (declared.length !== runtimeLibraries.size || declared.some(folder => !runtimeLibraries.has(folder))) fail('LIBRARY_DEPENDENCY', 'Package runtime dependencies must exactly match the used content libraries and their pinned runtime closure');
  const requiredLibraries = closure(usedLibraries, ['preloadedDependencies', 'dynamicDependencies', 'editorDependencies']);
  const compact = await acceptedCompactHashes(), libraries = new Map(), assets = new Map(), actualByLibrary = new Map();
  const referencedPaths = new Set(typedImageRefs.map(reference => reference.path));
  // Check the inventory before hashing any library or parsing media.
  for (const [path, content] of files) {
    if (path === 'h5p.json' || path === 'content/content.json') continue;
    if (path.startsWith('content/')) {
      const relative = path.slice('content/'.length);
      if (!referencedPaths.has(relative)) fail('ASSET_UNREFERENCED', `Content contains an unreferenced or untyped file: ${relative}`);
      continue;
    }
    const slash = path.indexOf('/'), folder = path.slice(0, slash), relative = path.slice(slash + 1);
    if (slash < 1 || !own(profile, folder) || !requiredLibraries.has(folder)) fail('LIBRARY_UNKNOWN', `Unexpected library or root file: ${path}`);
    if (!own(profile[folder].files, relative)) fail('LIBRARY_FILE', `Unexpected library file: ${path}`);
    if (!actualByLibrary.has(folder)) actualByLibrary.set(folder, new Map());
    actualByLibrary.get(folder).set(relative, content);
  }
  for (const folder of requiredLibraries) {
    const inventory = actualByLibrary.get(folder), expected = profile[folder].files;
    if (!inventory || inventory.size !== Object.keys(expected).length || Object.keys(expected).some(path => !inventory.has(path))) fail('LIBRARY_MISSING', `Incomplete pinned library: ${folder}`);
    const metadata = parseJson(inventory.get('library.json'), `${folder}/library.json`);
    // Byte hashes are authoritative. The only second accepted encoding is the
    // upstream Lumi export's JSON.stringify(profile.metadata), with no edits.
    for (const [relative, content] of inventory) {
      const hash = await sha256(content);
      if (hash !== expected[relative] && !(relative === 'library.json' && hash === compact.get(folder))) fail('LIBRARY_BYTES', `Library bytes differ from the pinned official profile: ${folder}/${relative}`);
    }
    libraries.set(folder, metadata);
  }
  for (const path of referencedPaths) {
    const content = files.get(`content/${path}`);
    if (!content) fail('ASSET_MISSING', `Missing typed image asset: ${path}`);
    const info = inspectImage(content, path);
    const extension = path.split('.').pop().toLowerCase(), mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[extension];
    if (info.mime !== mime) fail('IMAGE_MIME', `Image extension disagrees with its bytes: ${path}`);
    assets.set(path, { bytes: content, sha256: await sha256(content), ...info });
  }
  for (const reference of typedImageRefs) {
    const descriptor = reference.pointer.reduce((value, key) => value[key], params), asset = assets.get(reference.path);
    if (descriptor.mime !== undefined && descriptor.mime !== asset.mime) fail('IMAGE_MIME', `Image metadata MIME differs from its bytes: ${reference.path}`);
    for (const dimension of ['width', 'height']) if (descriptor[dimension] !== undefined && descriptor[dimension] !== asset[dimension]) fail('IMAGE_DIMENSION', `Image metadata ${dimension} differs from its bytes: ${reference.path}`);
  }
  return { id, filename, inputHash: await sha256(bytes), sizeBytes: bytes.length, h5p, params, files, libraries, assets, typedImageRefs, routes };
}
export async function writeArchive(files) { return writeZip(files); }
