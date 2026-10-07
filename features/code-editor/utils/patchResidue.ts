/**
 * Patch residue — the lines of a SEARCH/REPLACE patch (`SEARCH:`, `REPLACE:`, a bare `<<<` / `>>>`
 * or git conflict marker) that must never end up inside stored code. A patch whose lazy block match
 * swallowed its neighbour left them in an Applet's component_code and the Applet stopped compiling
 * ("Unexpected token (7:0)", feedback 02a11ba3). One definition, used by the applier (refuse the
 * edit) and by every door that writes code to storage (refuse the save).
 */
const RESIDUE_LINE = /^[ \t]*(SEARCH:|REPLACE:|<{3,}|>{3,}|={7}|<{7}[^\n]*|>{7}[^\n]*)[ \t]*$/;

/** The first residue line of `text` (1-based line number + the line), or null when clean. */
export function findPatchResidue(
  text: string,
): { line: number; text: string } | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (RESIDUE_LINE.test(lines[i].replace(/\r$/, ""))) {
      return { line: i + 1, text: lines[i].trim() };
    }
  }
  return null;
}

/**
 * Residue that `after` carries and `before` did not — what an edit INTRODUCED. A body that already
 * had a marker line on purpose (a doc string quoting the format) is not blamed on the edit.
 */
export function introducedPatchResidue(
  before: string,
  after: string,
): { line: number; text: string } | null {
  const found = findPatchResidue(after);
  if (!found) return null;
  const count = (s: string, needle: string) => s.split("\n").filter((l) => l.trim() === needle).length;
  return count(after, found.text) > count(before, found.text) ? found : null;
}
