import { parseFragment } from 'parse5';
import { fail } from './archive-errors.mjs';

// Reject-only profile: source strings are preserved byte-for-byte in parameters.
// It deliberately supports formatted text and explicit ordinary links, not media,
// embeds, scripts, SVG/MathML, arbitrary CSS or attributes with browser side effects.
const tags = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'sub', 'sup', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'pre', 'code', 'span', 'div', 'blockquote']);
const globalAttributes = new Set(['style', 'title', 'dir', 'lang']);
const encoder = new TextEncoder();
function invalid(label, reason) { fail('HTML_UNSUPPORTED', `${label}: ${reason}`); }
function safeLink(value, label) {
  if (/[\x00-\x20\x7f-\x9f\\]/u.test(value)) invalid(label, 'Link URLs cannot contain controls, spaces or backslashes');
  if (/^#[A-Za-z0-9_.:-]*$/.test(value)) return;
  if (!/^(?:https?:\/\/|mailto:)/i.test(value)) invalid(label, 'Only explicit HTTP(S), mailto, or fragment hyperlinks are supported');
  let url;
  try { url = new URL(value); } catch { invalid(label, 'Malformed hyperlink URL'); }
  if (!['http:', 'https:', 'mailto:'].includes(url.protocol) || url.username || url.password) invalid(label, 'Unsupported hyperlink scheme or embedded credentials');
}
function safeStyle(style, label) {
  if (style.length > 1024 || /[\\@{}<>!\x00-\x1f\x7f]/u.test(style) || /\/\*|\*\//.test(style)) invalid(label, 'CSS escapes, imports, comments and active syntax are not supported');
  const colour = value => /^(?:[a-z]{1,24}|#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%+\-\s]+\))$/i.test(value);
  const size = value => /^(?:xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)$/.test(value) || /^(?:0|[0-9]{1,3}(?:\.[0-9]{1,3})?)(?:px|em|rem|%)$/.test(value);
  for (const declaration of style.split(';')) {
    if (!declaration.trim()) continue;
    const colon = declaration.indexOf(':');
    if (colon < 1) invalid(label, 'Malformed inline style');
    const property = declaration.slice(0, colon).trim().toLowerCase(), value = declaration.slice(colon + 1).trim().toLowerCase();
    let allowed = false;
    if (['color', 'background-color'].includes(property)) allowed = colour(value);
    else if (property === 'font-size') allowed = size(value);
    else if (property === 'font-weight') allowed = /^(?:normal|bold|bolder|lighter|[1-9]00)$/.test(value);
    else if (property === 'font-style') allowed = /^(?:normal|italic|oblique)$/.test(value);
    else if (property === 'text-align') allowed = /^(?:left|right|center|justify|start|end)$/.test(value);
    else if (property === 'text-decoration') allowed = /^(?:none|(?:underline|line-through|overline)(?: (?:underline|line-through|overline))*)$/.test(value);
    else if (property === 'white-space') allowed = /^(?:normal|pre|pre-wrap|pre-line)$/.test(value);
    else if (property === 'margin-left' || property === 'padding-left') allowed = /^(?:0|[0-9]{1,2}(?:\.[0-9]{1,2})?px)$/.test(value);
    if (!allowed) invalid(label, `Unsupported inline CSS property or value: ${property}`);
  }
}

export function validateRichHtml(source, label) {
  if (typeof source !== 'string') invalid(label, 'Expected an HTML text string');
  if (source.length > 131072 || encoder.encode(source).length > 131072) fail('HTML_LIMIT', `${label} exceeds 128 KiB`);
  let markers = 0;
  for (const char of source) if (char === '<' && ++markers > 4096) fail('HTML_LIMIT', `${label} contains too many markup tokens`);
  let parseError = false;
  const fragment = parseFragment(source, { scriptingEnabled: false, onParseError: () => { parseError = true; } });
  if (parseError) invalid(label, 'Malformed HTML is outside the supported profile');
  let count = 0;
  const pending = fragment.childNodes.map(node => ({ node, depth: 0 }));
  while (pending.length) {
    const { node, depth } = pending.pop();
    if (++count > 4096 || depth > 32) fail('HTML_LIMIT', `${label} exceeds the supported HTML node/depth bound`);
    if (node.nodeName === '#text') continue;
    if (!tags.has(node.tagName) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml') invalid(label, `Unsupported HTML element: ${node.tagName ?? node.nodeName}`);
    for (const attribute of node.attrs) {
      const { name, value, namespace, prefix } = attribute;
      if (namespace || prefix || name.startsWith('on')) invalid(label, `Unsupported HTML attribute: ${name}`);
      const anchorAttribute = node.tagName === 'a' && ['href', 'target', 'rel'].includes(name);
      const listAttribute = ['ol', 'li'].includes(node.tagName) && ['start', 'value'].includes(name);
      if (!globalAttributes.has(name) && !anchorAttribute && !listAttribute) invalid(label, `Unsupported HTML attribute: ${name}`);
      if (name === 'style') safeStyle(value, label);
      if (name === 'href') safeLink(value, label);
      if (name === 'target' && !['_blank', '_self'].includes(value)) invalid(label, 'Unsupported hyperlink target');
      if (name === 'rel' && value.split(/\s+/).some(part => !['noopener', 'noreferrer', 'nofollow', ''].includes(part))) invalid(label, 'Unsupported hyperlink rel value');
      if (name === 'dir' && !['ltr', 'rtl', 'auto'].includes(value)) invalid(label, 'Unsupported text direction');
      if (name === 'lang' && !/^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/i.test(value)) invalid(label, 'Unsupported language tag');
      if (listAttribute && !/^-?[0-9]{1,5}$/.test(value)) invalid(label, 'Invalid ordered-list number');
    }
    for (const child of node.childNodes ?? []) pending.push({ node: child, depth: depth + 1 });
  }
}

/** Upstream dependency discovery recursively recognizes any key named library. */
export function rejectHiddenLibraries(value, allowNodeSlots = false) {
  const pending = [{ value, path: [] }];
  while (pending.length) {
    const { value: current, path } = pending.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, child] of Object.entries(current)) {
      const here = [...path, key];
      if (key === 'library' && !(allowNodeSlots && path.length === 4 && path[0] === 'branchingScenario' && path[1] === 'content' && /^[0-9]+$/.test(path[2]) && path[3] === 'type')) fail('LIBRARY_HIDDEN', `Hidden library declaration at ${here.join('.')}`);
      if (child && typeof child === 'object') pending.push({ value: child, path: here });
    }
  }
}

// The pinned H5P.Image decodes HTML to text, then feeds that decoded string to
// innerHTML to strip tags. Validate both interpretations without changing either.
export function validateImageText(source, label) {
  validateRichHtml(source, label);
  const fragment = parseFragment(source, { scriptingEnabled: false });
  const pieces = [], pending = [...fragment.childNodes].reverse();
  while (pending.length) {
    const node = pending.pop();
    if (node.nodeName === '#text') pieces.push(node.value);
    else pending.push(...[...(node.childNodes ?? [])].reverse());
  }
  validateRichHtml(pieces.join(''), `${label} (decoded image text)`);
}
