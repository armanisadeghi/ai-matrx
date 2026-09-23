/**
 * Term lists — one org resource behind translation glossaries, TTS
 * pronunciation, STT known terms and house terms for chat models.
 *
 * Table `agent.term_list` (token `agent_term_list`). The server validator is
 * `aidream/services/term_lists/shapes.py`; `validateEntries` below mirrors it
 * so the editor refuses exactly what the server would.
 */

export const TERM_LIST_TOKEN = "agent_term_list" as const;
export const TERM_LIST_ROLE = "term_list" as const;

export const ENTRY_KINDS = [
  "translate",
  "do_not_translate",
  "pronounce",
  "spell_as",
  "boost",
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const MODALITIES = [
  "translation",
  "pronunciation",
  "transcription",
  "house_terms",
] as const;
export type Modality = (typeof MODALITIES)[number];

export const KIND_LABELS: Record<EntryKind, string> = {
  translate: "Translate as",
  do_not_translate: "Never translate",
  pronounce: "Pronounce as",
  spell_as: "Spell as",
  boost: "Recognize",
};

/** What the Value column means for each kind (placeholder text). */
export const KIND_VALUE_HINT: Record<EntryKind, string> = {
  translate: "Translation",
  do_not_translate: "",
  pronounce: "Spoken as",
  spell_as: "Correct spelling",
  boost: "",
};

export const MODALITY_LABELS: Record<Modality, string> = {
  translation: "Translation",
  pronunciation: "Pronunciation",
  transcription: "Transcription",
  house_terms: "House terms",
};

const VALUE_REQUIRED: ReadonlySet<EntryKind> = new Set([
  "translate",
  "pronounce",
  "spell_as",
]);

export interface TermEntry {
  term: string;
  value?: string;
  kind: EntryKind;
  language?: string;
  case_sensitive?: boolean;
}

export interface TermList {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  modalities: Modality[];
  context: string | null;
  source_language: string | null;
  entries: TermEntry[];
  version: number;
  updated_at: string;
}

export function isEntryKind(value: unknown): value is EntryKind {
  return (
    typeof value === "string" &&
    (ENTRY_KINDS as readonly string[]).includes(value)
  );
}

export function isModality(value: unknown): value is Modality {
  return (
    typeof value === "string" &&
    (MODALITIES as readonly string[]).includes(value)
  );
}

export function kindNeedsValue(kind: EntryKind): boolean {
  return VALUE_REQUIRED.has(kind);
}

export interface EntryProblem {
  row: number;
  message: string;
}

/** Row-numbered problems (1-based), or [] when every entry is valid. */
export function validateEntries(entries: TermEntry[]): EntryProblem[] {
  const problems: EntryProblem[] = [];
  entries.forEach((entry, index) => {
    const row = index + 1;
    // A fully blank row is dropped on save, never a problem.
    if (!entry.term.trim() && !(entry.value ?? "").trim()) return;
    if (!entry.term.trim()) {
      problems.push({ row, message: "Term is empty" });
    }
    if (kindNeedsValue(entry.kind) && !(entry.value ?? "").trim()) {
      problems.push({
        row,
        message: `${KIND_LABELS[entry.kind]} needs a value`,
      });
    }
  });
  return problems;
}

/** Drop blank rows and trim; the shape written to the database. */
export function normalizeEntries(entries: TermEntry[]): TermEntry[] {
  return entries
    .filter((e) => e.term.trim() || (e.value ?? "").trim())
    .map((e) => {
      const out: TermEntry = { term: e.term.trim(), kind: e.kind };
      const value = (e.value ?? "").trim();
      const language = (e.language ?? "").trim();
      if (value && kindNeedsValue(e.kind)) out.value = value;
      if (language) out.language = language;
      if (e.case_sensitive) out.case_sensitive = true;
      return out;
    });
}

/** Parse a stored `entries` jsonb value, dropping anything malformed. */
export function entriesFromJson(raw: unknown): TermEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: TermEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.term !== "string" || !isEntryKind(r.kind)) continue;
    out.push({
      term: r.term,
      kind: r.kind,
      value: typeof r.value === "string" ? r.value : undefined,
      language: typeof r.language === "string" ? r.language : undefined,
      case_sensitive: r.case_sensitive === true,
    });
  }
  return out;
}

// ── paste from CSV ──────────────────────────────────────────────────────────

/** Split one CSV/TSV line, honouring double quotes. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

const KIND_ALIASES: Record<string, EntryKind> = {
  translate: "translate",
  translation: "translate",
  do_not_translate: "do_not_translate",
  "do not translate": "do_not_translate",
  "never translate": "do_not_translate",
  dnt: "do_not_translate",
  keep: "do_not_translate",
  pronounce: "pronounce",
  pronunciation: "pronounce",
  "pronounce as": "pronounce",
  spell_as: "spell_as",
  "spell as": "spell_as",
  spelling: "spell_as",
  boost: "boost",
  recognize: "boost",
  keyterm: "boost",
};

export interface CsvParseResult {
  entries: TermEntry[];
  skipped: { line: number; reason: string }[];
}

/**
 * Pasted rows → entries. Columns: term, value, kind, language (value, kind and
 * language optional). Tab-separated when the paste holds tabs (a spreadsheet
 * copy), else comma-separated. A header row naming "term" is skipped. A row
 * with no kind takes `defaultKind`.
 */
export function parseTermCsv(
  text: string,
  defaultKind: EntryKind = "translate",
): CsvParseResult {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const delimiter = text.includes("\t") ? "\t" : ",";
  const entries: TermEntry[] = [];
  const skipped: CsvParseResult["skipped"] = [];

  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const [term = "", value = "", kindRaw = "", language = ""] = splitLine(
      line,
      delimiter,
    );
    if (index === 0 && term.toLowerCase() === "term") return;
    if (!term) {
      skipped.push({ line: index + 1, reason: "no term" });
      return;
    }
    const kindKey = kindRaw.toLowerCase();
    const kind = kindKey ? KIND_ALIASES[kindKey] : defaultKind;
    if (!kind) {
      skipped.push({ line: index + 1, reason: `unknown kind "${kindRaw}"` });
      return;
    }
    const entry: TermEntry = { term, kind };
    if (value) entry.value = value;
    if (language) entry.language = language;
    if (kindNeedsValue(kind) && !value) {
      skipped.push({ line: index + 1, reason: `${KIND_LABELS[kind]} needs a value` });
      return;
    }
    entries.push(entry);
  });

  return { entries, skipped };
}
