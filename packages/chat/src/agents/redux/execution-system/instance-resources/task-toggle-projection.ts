// When the ONLY difference between two answer texts is task-list boxes ticked
// or unticked (`- [ ]` ⇄ `- [x]`), the change is an interaction, not an edit:
// the chip should say what the person did ("I checked off: 2 cups flour, 2 tbsp
// sugar"), never a raw "- [ ] → + [x]" diff. Pure; used by the edit stager so
// every door that toggles a box (rendered checkbox, source adapter) gets it.

const TASK_LINE = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\]([ \t]+|$)(.*)$/;

function itemName(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`=]|\[\[|\]\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A box's name in a few words: parentheticals and anything after a colon dropped, three words, short. */
function compactName(name: string): string {
  const head = name.replace(/\([^)]*\)/g, " ").split(/:|\s[—–-]\s/)[0] ?? name;
  const words = head.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, 3).join(" ");
  const clean = words || name;
  return clean.length > 30 ? `${clean.slice(0, 29).trimEnd()}…` : clean;
}

function toggledItems(before: string, after: string): { checked: string[]; unchecked: string[] } | null {
  if (before === after) return null;
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length !== b.length) return null;
  const checked: string[] = [];
  const unchecked: string[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const ma = TASK_LINE.exec(a[i] ?? "");
    const mb = TASK_LINE.exec(b[i] ?? "");
    if (!ma || !mb) return null;
    if (ma[1] !== mb[1] || ma[3] !== mb[3] || ma[4] !== mb[4]) return null;
    const was = ma[2] !== " ";
    const now = mb[2] !== " ";
    if (was === now) return null;
    (now ? checked : unchecked).push(itemName(ma[4] ?? "") || "an item");
  }
  return checked.length || unchecked.length ? { checked, unchecked } : null;
}

export function taskToggleProjection(before: string, after: string): string | null {
  const items = toggledItems(before, after);
  if (!items) return null;
  const { checked, unchecked } = items;
  const parts: string[] = [];
  if (checked.length) parts.push(`I checked off: ${checked.join(", ")}`);
  if (unchecked.length) parts.push(`I unchecked: ${unchecked.join(", ")}`);
  return parts.length ? `${parts.join(". ")}.`.replace(/\.\.$/, ".") : null;
}

/**
 * The chip's label for a task-toggle edit: how many and which, compactly
 * ("Checked 2: Venue, Permits"). The full item names stay in the projection the
 * model reads; the label only has to fit a chip.
 */
export function taskToggleChipTitle(before: string, after: string): string | null {
  const items = toggledItems(before, after);
  if (!items) return null;
  const say = (verb: string, names: string[]): string => {
    const shown = names.slice(0, 2).map(compactName).join(", ");
    return `${verb} ${names.length}: ${shown}${names.length > 2 ? ` +${names.length - 2}` : ""}`;
  };
  const parts: string[] = [];
  if (items.checked.length) parts.push(say("Checked", items.checked));
  if (items.unchecked.length) parts.push(say("Unchecked", items.unchecked));
  return parts.join(" · ");
}
