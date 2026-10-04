import { fail, LIMITS, ProfileError } from './archive-errors.mjs';
const decoder = new TextDecoder('utf-8', { fatal: true });

/** Strict JSON, bounded depth, duplicate-key detection, and no prototype keys. */
export function parseJson(bytes, name) {
  if (!(bytes instanceof Uint8Array) || bytes.length > LIMITS.json) fail('JSON_LIMIT', `${name} exceeds 2 MiB`);
  let source;
  try { source = decoder.decode(bytes); } catch { fail('JSON_ENCODING', `${name} is not UTF-8`); }
  let at = 0;
  const ws = () => { while (at < source.length && /[\x20\x09\x0a\x0d]/.test(source[at])) at++; };
  function string() {
    const start = at++;
    for (; at < source.length; at++) {
      if (source[at] === '\\') { at++; continue; }
      if (source[at] === '"') return JSON.parse(source.slice(start, ++at));
    }
    fail('JSON_FORMAT', `Unterminated string in ${name}`);
  }
  function value(depth) {
    if (depth > 64) fail('JSON_DEPTH', `${name} is nested too deeply`);
    ws();
    const char = source[at];
    if (char === '"') return string();
    if (char === '{') {
      at++; ws();
      const object = {}, keys = new Set();
      if (source[at] === '}') { at++; return object; }
      while (true) {
        ws();
        if (source[at] !== '"') fail('JSON_FORMAT', `Expected an object key in ${name}`);
        const key = string();
        if (keys.has(key)) fail('JSON_DUPLICATE', `Duplicate JSON property ${key} in ${name}`);
        if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('JSON_KEY', `Unsafe JSON property ${key} in ${name}`);
        keys.add(key); ws();
        if (source[at++] !== ':') fail('JSON_FORMAT', `Expected a colon in ${name}`);
        object[key] = value(depth + 1); ws();
        const separator = source[at++];
        if (separator === '}') return object;
        if (separator !== ',') fail('JSON_FORMAT', `Expected an object separator in ${name}`);
      }
    }
    if (char === '[') {
      at++; ws();
      const array = [];
      if (source[at] === ']') { at++; return array; }
      while (true) {
        array.push(value(depth + 1)); ws();
        const separator = source[at++];
        if (separator === ']') return array;
        if (separator !== ',') fail('JSON_FORMAT', `Expected an array separator in ${name}`);
      }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (source.startsWith(literal, at)) { at += literal.length; return result; }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(at));
    if (!match) fail('JSON_FORMAT', `Invalid JSON value in ${name}`);
    at += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) fail('JSON_NUMBER', `Non-finite number in ${name}`);
    return number;
  }
  try {
    const result = value(0); ws();
    if (at !== source.length) fail('JSON_FORMAT', `Unexpected trailing JSON in ${name}`);
    return result;
  } catch (error) {
    if (error instanceof ProfileError) throw error;
    fail('JSON_FORMAT', `Invalid JSON in ${name}`);
  }
}
