export const HANDLE_RE = /^@?[A-Za-z0-9_]{1,15}$/;
export const HASHTAG_RE = /^#?[A-Za-z0-9_]{1,100}$/;

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@/, "");
}

export function normalizeHashtag(input: string): string {
  return input.trim().replace(/^#/, "");
}

export function isValidHandle(input: string): boolean {
  return HANDLE_RE.test(input.trim());
}

export function isValidHashtag(input: string): boolean {
  return HASHTAG_RE.test(input.trim());
}