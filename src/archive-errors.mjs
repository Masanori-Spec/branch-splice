export class ProfileError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'ProfileError';
    this.code = code;
    this.detail = detail;
  }
}
export function fail(code, detail) { throw new ProfileError(code, detail); }
export const LIMITS = Object.freeze({
  compressed: 32 * 1024 * 1024,
  expanded: 64 * 1024 * 1024,
  file: 16 * 1024 * 1024,
  json: 2 * 1024 * 1024,
  entries: 4096,
  nodes: 60,
  routes: 512,
  dimension: 8192,
  pixels: 16 * 1024 * 1024
});
