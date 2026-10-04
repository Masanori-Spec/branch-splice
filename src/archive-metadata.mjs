import { fail } from './archive-errors.mjs';
import { validateRichHtml } from './archive-html.mjs';

// Explicit bounded profile derived from Lumi 10.0.4's h5p-schema.json,
// defaultMetadataSemantics.json and defaultCopyrightSemantics.json. Native
// defaultLanguage/extraTitle are retained. Unknown fields are rejected, never
// stripped; this shape boundary cannot identify private data inside allowed text.
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const licenses = ['CC BY', 'CC BY-SA', 'CC BY-ND', 'CC BY-NC', 'CC BY-NC-SA', 'CC BY-NC-ND', 'CC0 1.0', 'GNU GPL', 'PD', 'ODC PDDL', 'CC PDM', 'U', 'C'];
const ccVersions = ['1.0', '2.0', '2.5', '3.0', '4.0'];
const nodeKeys = ['title', 'extraTitle', 'a11yTitle', 'license', 'licenseVersion', 'yearFrom', 'yearTo', 'source', 'authors', 'licenseExtras', 'changes', 'authorComments', 'contentType'];
const packageKeys = [...nodeKeys, 'language', 'defaultLanguage', 'preloadedDependencies', 'dynamicDependencies', 'editorDependencies', 'mainLibrary', 'embedTypes', 'author', 'yearsFrom', 'yearsTo', 'w', 'h', 'metaKeywords', 'metaDescription'];

function object(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('METADATA_TYPE', `${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail('METADATA_FIELD', `Unsupported metadata field: ${label}.${key}`);
}
function required(value, keys, label) {
  for (const key of keys) if (!own(value, key)) fail('METADATA_REQUIRED', `Required metadata field is missing: ${label}.${key}`);
}
function text(value, label, { min = 0, max = 255, multiline = false, html = true } = {}) {
  if (typeof value !== 'string') fail('METADATA_TYPE', `${label} must be a string`);
  const length = Array.from(value).length;
  if (length < min || length > max) fail('METADATA_LIMIT', `${label} must contain ${min}–${max} characters`);
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value) || (!multiline && /[\r\n\u2028\u2029]/u.test(value))) fail('METADATA_VALUE', `Unsupported control or newline in ${label}`);
  if (html) validateRichHtml(value, label);
}
function enumeration(value, values, label) {
  if (typeof value !== 'string') fail('METADATA_TYPE', `${label} must be a string`);
  if (!values.includes(value)) fail('METADATA_VALUE', `Unsupported ${label}: ${value}`);
}
function sourceUrl(value, label, allowEmpty) {
  text(value, label, { min: allowEmpty ? 0 : 1, max: 2048, html: false });
  if (allowEmpty && value === '') return;
  // Core MediaCopyright inserts this exact string into href and visible HTML.
  // URL normalization alone would hide literal attribute-breakout characters.
  if (!(allowEmpty ? /^https?:\/\//i : /^https?:\/\//).test(value) || /[\x00-\x20\x7f-\x9f\\<>"']/u.test(value)) fail('METADATA_URL', `${label} requires an explicit safe HTTP(S) URL`);
  let url;
  try { url = new URL(value); } catch { fail('METADATA_URL', `Malformed URL in ${label}`); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) fail('METADATA_URL', `Unsupported URL in ${label}`);
}
function list(value, label, max) {
  if (!Array.isArray(value)) fail('METADATA_TYPE', `${label} must be an array`);
  if (value.length > max) fail('METADATA_LIMIT', `${label} exceeds ${max} entries`);
}
function rights(value, label, packageLevel) {
  for (const field of ['title', 'extraTitle', 'contentType']) if (own(value, field)) text(value[field], `${label}.${field}`, { min: 1 });
  if (own(value, 'a11yTitle')) text(value.a11yTitle, `${label}.a11yTitle`, { multiline: true });
  if (own(value, 'license')) enumeration(value.license, licenses, `${label}.license`);
  if (own(value, 'licenseVersion')) enumeration(value.licenseVersion, ccVersions, `${label}.licenseVersion`);
  for (const field of ['yearFrom', 'yearTo']) if (own(value, field) && (!Number.isInteger(value[field]) || value[field] < -9999 || value[field] > 9999)) fail('METADATA_VALUE', `${label}.${field} must be an integer between -9999 and 9999`);
  if (own(value, 'source')) sourceUrl(value.source, `${label}.source`, !packageLevel);
  for (const field of ['licenseExtras', 'authorComments']) if (own(value, field)) text(value[field], `${label}.${field}`, { min: packageLevel ? 1 : 0, max: 5000, multiline: true });
  if (own(value, 'authors')) {
    list(value.authors, `${label}.authors`, 64);
    value.authors.forEach((author, i) => {
      const name = `${label}.authors[${i}]`;
      object(author, name, ['name', 'role']); required(author, packageLevel ? ['name', 'role'] : ['role'], name);
      if (own(author, 'name')) text(author.name, `${name}.name`, { min: packageLevel ? 1 : 0 });
      enumeration(author.role, ['Author', 'Editor', 'Licensee', 'Originator'], `${name}.role`);
    });
  }
  if (own(value, 'changes')) {
    list(value.changes, `${label}.changes`, 256);
    value.changes.forEach((change, i) => {
      const name = `${label}.changes[${i}]`;
      object(change, name, ['date', 'author', 'log']);
      if (packageLevel) required(change, ['date', 'author', 'log'], name);
      if (own(change, 'date')) text(change.date, `${name}.date`, { min: packageLevel ? 1 : 0, max: 64 });
      if (packageLevel && !/^[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{1,2}:[0-9]{2}:[0-9]{2}$/.test(change.date)) fail('METADATA_VALUE', `${name}.date must match the pinned package changelog date format`);
      if (own(change, 'author')) text(change.author, `${name}.author`, { min: packageLevel ? 1 : 0 });
      if (own(change, 'log')) text(change.log, `${name}.log`, { min: packageLevel ? 1 : 0, max: 5000, multiline: true });
    });
  }
}

export function validatePackageMetadata(metadata) {
  const label = 'h5p.json';
  object(metadata, label, packageKeys);
  required(metadata, ['title', 'language', 'preloadedDependencies', 'mainLibrary', 'embedTypes'], label);
  rights(metadata, label, true);
  if (!metadata.title.trim()) fail('METADATA_VALUE', 'h5p.json.title cannot be blank');
  for (const field of ['language', 'defaultLanguage']) if (own(metadata, field)) {
    text(metadata[field], `${label}.${field}`, { min: 1, max: 10, html: false });
    if (!/^[-a-zA-Z]{1,10}$/.test(metadata[field])) fail('METADATA_VALUE', `${label}.${field} is outside the native language-code profile`);
  }
  text(metadata.mainLibrary, `${label}.mainLibrary`, { min: 2, max: 255, html: false });
  if (!/^[$a-zA-Z_][0-9a-zA-Z_.$]{1,254}$/.test(metadata.mainLibrary)) fail('METADATA_VALUE', 'Invalid package mainLibrary name');
  list(metadata.embedTypes, `${label}.embedTypes`, 2);
  if (!metadata.embedTypes.length || new Set(metadata.embedTypes).size !== metadata.embedTypes.length) fail('METADATA_VALUE', 'embedTypes needs one or two distinct supported embed modes');
  for (const mode of metadata.embedTypes) enumeration(mode, ['iframe', 'div'], `${label}.embedTypes`);
  for (const field of ['preloadedDependencies', 'dynamicDependencies', 'editorDependencies']) if (own(metadata, field)) {
    list(metadata[field], `${label}.${field}`, 71);
    if (field === 'preloadedDependencies' && !metadata[field].length) fail('LIBRARY_DEPENDENCY', 'Package preloadedDependencies cannot be empty');
    // Exact numeric dependency versions and matching pinned closure are checked by readModule.
  }
  if (own(metadata, 'author')) text(metadata.author, `${label}.author`, { min: 1 });
  for (const field of ['yearsFrom', 'yearsTo', 'w', 'h']) if (own(metadata, field)) {
    if (typeof metadata[field] !== 'string' || !/^[0-9]{1,4}$/.test(metadata[field])) fail('METADATA_VALUE', `${label}.${field} must retain its native 1–4 digit string representation`);
  }
  for (const field of ['metaKeywords', 'metaDescription']) if (own(metadata, field)) text(metadata[field], `${label}.${field}`, { min: 1, max: 5000 });
}

export function validateNodeMetadata(metadata, label) {
  object(metadata, label, nodeKeys);
  rights(metadata, label, false);
}

export function validateCopyright(copyright, label) {
  object(copyright, label, ['title', 'author', 'year', 'source', 'license', 'version']);
  for (const field of ['title', 'author', 'year']) if (own(copyright, field)) text(copyright[field], `${label}.${field}`);
  if (own(copyright, 'source')) sourceUrl(copyright.source, `${label}.source`, true);
  if (own(copyright, 'license')) enumeration(copyright.license, ['U', 'CC BY', 'CC BY-SA', 'CC BY-ND', 'CC BY-NC', 'CC BY-NC-SA', 'CC BY-NC-ND', 'GNU GPL', 'PD', 'C'], `${label}.license`);
  if (own(copyright, 'version')) {
    const versions = copyright.license?.startsWith('CC BY') ? ccVersions : copyright.license === 'GNU GPL' ? ['v1', 'v2', 'v3'] : copyright.license === 'PD' ? ['-', 'CC0 1.0', 'CC PDM'] : [];
    enumeration(copyright.version, versions, `${label}.version`);
  }
}
