/**
 * Title Case a label while preserving:
 *  - all-caps tokens (acronyms: KOLs, GI, HER2, CRC, HNSCC, TNBC)
 *  - tokens with internal capitals (HER2+, HER2-positive)
 *  - tokens that contain digits (TNBC, HER2)
 */
export function toTitleCase(input: string): string {
  return input.replace(/([A-Za-z][A-Za-z0-9+\-]*)/g, (word) => {
    if (/[A-Z]/.test(word.slice(1))) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}