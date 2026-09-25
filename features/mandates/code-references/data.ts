"use client";

// features/mandates/code-references/data.ts
//
// THE ONE CLIENT READER of the code scan's latest references
// (`mandate.v_reference_latest` — one row per reference identity, latest
// deployed else latest candidate; the same collapse aidream's
// `services/mandates/references.py` board uses). Direct supabase-js read,
// admins only: the view is `security_invoker`, so `mandate.reference` RLS
// decides (migrations/mandate_reference_latest_admin_read_2026_09_25.sql).
//
// Three consumers, one reader:
//   * /administration/mandates/unconverted-preview — `fetchUnconvertedCalls`
//   * /administration/mandates/health-preview     — `fetchReferenceFindings`
//   * the admin mandate list's Declared-in / Called-from columns
//                                                  — `fetchMandateSourceFacts`
//
// Nothing here re-derives a scanner verdict: the flag is the scanner's. What
// this module adds is the plain-words sentence for each flag and the link to
// the exact line on GitHub.

import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { runWithSessionRetry } from "@/lib/supabase/authRetry";

/** The columns every reader here needs — never `*`. */
const REFERENCE_COLUMNS =
  "identity_hash,mandate_key,reference_type_id,repo_slug,package_name,language,file_path,symbol,line,revision,revision_kind,presence,flag";

export interface LatestReference {
  identity_hash: string;
  mandate_key: string | null;
  reference_type_id: string | null;
  repo_slug: string | null;
  package_name: string | null;
  language: string | null;
  file_path: string | null;
  symbol: string | null;
  line: number | null;
  revision: string | null;
  revision_kind: string | null;
  presence: string | null;
  flag: string | null;
}

type ReferenceFilter = {
  /** Only these reference types (category slugs). */
  types?: string[];
  /** Exclude these reference types. */
  excludeTypes?: string[];
  /** Only rows with a non-ok flag or a non-present presence. */
  problemsOnly?: boolean;
  /** Only these mandate keys. */
  keys?: string[];
};

let typeIdsBySlug: Promise<Map<string, string>> | null = null;

/** `platform.categories` (dimension `mandate_reference_type`) slug → id. */
export function referenceTypeIds(): Promise<Map<string, string>> {
  if (!typeIdsBySlug) {
    typeIdsBySlug = (async () => {
      const { data, error } = await runWithSessionRetry(() =>
        supabase
          .schema("platform")
          .from("categories")
          .select("id,slug")
          .eq("dimension", "mandate_reference_type")
          .is("deleted_at", null),
      );
      if (error) throw new Error(`Reference types: ${error.message}`);
      return new Map((data ?? []).map((row) => [row.slug as string, row.id as string]));
    })().catch((error: unknown) => {
      typeIdsBySlug = null;
      throw error;
    });
  }
  return typeIdsBySlug;
}

async function readLatestReferences(filter: ReferenceFilter): Promise<LatestReference[]> {
  const ids = await referenceTypeIds();
  const idsFor = (slugs: string[]) =>
    slugs.map((slug) => {
      const id = ids.get(slug);
      if (!id) throw new Error(`Reference type "${slug}" is not registered.`);
      return id;
    });
  const include = filter.types ? idsFor(filter.types) : null;
  const exclude = filter.excludeTypes ? idsFor(filter.excludeTypes) : null;

  return readAllRows<LatestReference>(
    ({ from, to }) =>
      runWithSessionRetry(() => {
        let query = supabase
          .schema("mandate")
          .from("v_reference_latest")
          .select(REFERENCE_COLUMNS, { count: "exact" });
        if (include) query = query.in("reference_type_id", include);
        if (exclude) query = query.not("reference_type_id", "in", `(${exclude.join(",")})`);
        if (filter.problemsOnly) query = query.or("flag.neq.ok,presence.neq.present");
        if (filter.keys) query = query.in("mandate_key", filter.keys);
        return query.order("identity_hash", { ascending: true }).range(from, to);
      }).then((result) => ({
        data: (result.data ?? null) as LatestReference[] | null,
        count: "count" in result && typeof result.count === "number" ? result.count : null,
        error: result.error ? { message: result.error.message ?? "read failed" } : null,
      })),
    { label: "mandate.v_reference_latest", pageSize: 1000, maxRows: 50_000 },
  );
}

// ── Repositories (for the GitHub link) ─────────────────────────────────────

let reposPromise: Promise<Map<string, string | null>> | null = null;

/** Active `platform.repo` slug → GitHub full name. */
export function repoGithubNames(): Promise<Map<string, string | null>> {
  if (!reposPromise) {
    reposPromise = (async () => {
      const { data, error } = await runWithSessionRetry(() =>
        supabase.schema("platform").from("repo").select("slug,github_full_name"),
      );
      if (error) throw new Error(`Repositories: ${error.message}`);
      return new Map((data ?? []).map((row) => [row.slug as string, row.github_full_name]));
    })().catch((error: unknown) => {
      reposPromise = null;
      throw error;
    });
  }
  return reposPromise;
}

/**
 * The exact scanned line on GitHub — pinned to the scanned revision so the
 * line number is the line the scanner saw. `null` when the repo has no GitHub
 * name or the row has no file.
 */
export function githubLineUrl(
  githubFullName: string | null | undefined,
  revision: string | null | undefined,
  filePath: string | null | undefined,
  line: number | null | undefined,
): string | null {
  if (!githubFullName || !filePath) return null;
  const ref = revision && /^[0-9a-f]{7,40}$/i.test(revision) ? revision : "main";
  const path = filePath.split("/").map(encodeURIComponent).join("/");
  const anchor = typeof line === "number" && line > 0 ? `#L${line}` : "";
  return `https://github.com/${githubFullName}/blob/${ref}/${path}${anchor}`;
}

/** `repo/path/file.ts:120` — the one copyable location string. */
export function locationText(ref: {
  repo_slug: string | null;
  file_path: string | null;
  line: number | null;
  symbol?: string | null;
}): string {
  const file = ref.file_path?.trim();
  if (!file) return [ref.repo_slug, ref.symbol].filter(Boolean).join(": ") || "Not recorded";
  const base = ref.repo_slug ? `${ref.repo_slug}/${file}` : file;
  return typeof ref.line === "number" && ref.line > 0 ? `${base}:${ref.line}` : base;
}

export function languageLabel(language: string | null | undefined): string {
  switch ((language ?? "").toLowerCase()) {
    case "typescript":
      return "TypeScript";
    case "javascript":
      return "JavaScript";
    case "python":
      return "Python";
    case "config":
      return "Config";
    case "":
      return "";
    default:
      return language!.charAt(0).toUpperCase() + language!.slice(1);
  }
}

// ── 1. Unconverted AI calls (bypass references) ─────────────────────────────

export type UnconvertedStatus = "waiting" | "broken";

export interface UnconvertedCall {
  id: string;
  repo: string;
  file: string;
  line: number | null;
  language: string;
  /** What the site reaches for: a provider SDK, an API host. `""` = not recorded. */
  calls: string;
  /** How it reaches it: "Import" | "API host" | "". */
  via: string;
  status: UnconvertedStatus;
  location: string;
  codeUrl: string | null;
  revision: string;
  /** "Deployed" | "Latest commit" */
  revisionLabel: string;
}

export const UNCONVERTED_STATUS_LABEL: Record<UnconvertedStatus, string> = {
  waiting: "Waiting to convert",
  broken: "Broken",
};

/** `import anthropic` → anthropic / Import; `host api.x.ai` → api.x.ai / API host. */
export function parseCallTarget(symbol: string | null | undefined): { calls: string; via: string } {
  const text = (symbol ?? "").trim();
  if (!text || text === "<module>") return { calls: "", via: "" };
  if (text.startsWith("import ")) return { calls: text.slice(7).trim(), via: "Import" };
  if (text.startsWith("from ")) return { calls: text.slice(5).split(" import ")[0].trim(), via: "Import" };
  if (text.startsWith("host ")) return { calls: text.slice(5).trim(), via: "API host" };
  return { calls: text, via: "" };
}

function revisionLabel(kind: string | null): string {
  return kind === "deployed" ? "Deployed" : "Latest commit";
}

export async function fetchUnconvertedCalls(): Promise<UnconvertedCall[]> {
  const [rows, repos] = await Promise.all([
    readLatestReferences({ types: ["bypass"] }),
    repoGithubNames(),
  ]);
  return rows
    .filter((row) => row.presence === "present")
    .map((row): UnconvertedCall => {
      const { calls, via } = parseCallTarget(row.symbol);
      return {
        id: row.identity_hash,
        repo: row.repo_slug ?? "",
        file: row.file_path ?? "",
        line: row.line,
        language: languageLabel(row.language),
        calls,
        via,
        status: row.flag === "conversion_pending" ? "waiting" : "broken",
        location: locationText(row),
        codeUrl: githubLineUrl(repos.get(row.repo_slug ?? ""), row.revision, row.file_path, row.line),
        revision: row.revision ?? "",
        revisionLabel: revisionLabel(row.revision_kind),
      };
    });
}

// ── 2. Scan findings (for Mandate health) ───────────────────────────────────

/** Plain words per scanner flag: what is wrong, and what fixes it. */
export const FLAG_WORDS: Record<
  string,
  { problem: string; fix: string; severity: "high" | "medium" | "low" }
> = {
  broken: {
    problem: "This reference does not work today",
    fix: "Repair the code at this line",
    severity: "high",
  },
  unresolved: {
    problem: "The scan cannot read which mandate this line calls",
    fix: "Pass the mandate as a declared constant, not a computed string",
    severity: "medium",
  },
  orphaned: {
    problem: "The code or the mandate behind this reference is gone",
    fix: "Restore the declaration, or record the rename",
    severity: "medium",
  },
  absent: {
    problem: "The latest scan no longer finds this reference",
    fix: "Restore the code, or record the rename",
    severity: "low",
  },
};

export interface ReferenceFinding {
  id: string;
  mandateKey: string;
  flag: string;
  repo: string;
  file: string;
  line: number | null;
  language: string;
  location: string;
  codeUrl: string | null;
}

/**
 * Every open scan finding on a MANDATE reference. Bypass sites (AI running
 * outside any mandate) are excluded on purpose — they are the Unconverted AI
 * calls page, not a mandate's health.
 */
export async function fetchReferenceFindings(): Promise<ReferenceFinding[]> {
  const [rows, repos] = await Promise.all([
    readLatestReferences({ excludeTypes: ["bypass"], problemsOnly: true }),
    repoGithubNames(),
  ]);
  return rows.map((row) => ({
    id: row.identity_hash,
    mandateKey: row.mandate_key ?? "",
    flag: row.flag && row.flag !== "ok" ? row.flag : "absent",
    repo: row.repo_slug ?? "",
    file: row.file_path ?? "",
    line: row.line,
    language: languageLabel(row.language),
    location: locationText(row),
    codeUrl: githubLineUrl(repos.get(row.repo_slug ?? ""), row.revision, row.file_path, row.line),
  }));
}

// ── 3. Per-mandate source facts (for the admin mandate list) ────────────────

const DECLARATION_TYPES = new Set(["declaration", "family_declaration"]);

export interface MandateSourceFacts {
  mandateKey: string;
  /** Repos holding a declaration of this mandate, sorted. */
  declaredIn: string[];
  /** Repos holding a call site (anything not a declaration), sorted. */
  calledFrom: string[];
  /** Languages across every reference, display words, sorted. */
  languages: string[];
  /** Call sites (non-declaration references), all repos. */
  callSites: number;
  /** References carrying a scanner flag (broken / unresolved / orphaned / absent). */
  flagged: number;
}

/**
 * Where each mandate is declared and called, by repo and language — one entry
 * per key that has at least one reference. Pass `keys` to read only those
 * mandates (one page of a list); omit to read the whole fleet.
 *
 * A key with no entry has NO reference in any scan — which means "nobody
 * looked" until every repo has a complete scan, never "unused".
 */
export async function fetchMandateSourceFacts(
  keys?: readonly string[],
): Promise<Map<string, MandateSourceFacts>> {
  if (keys && keys.length === 0) return new Map();
  const ids = await referenceTypeIds();
  const slugById = new Map([...ids.entries()].map(([slug, id]) => [id, slug]));
  const rows = await readLatestReferences({
    excludeTypes: ["bypass", "unclassified"],
    keys: keys ? [...keys] : undefined,
  });
  const out = new Map<string, MandateSourceFacts>();
  const sets = new Map<string, { declared: Set<string>; called: Set<string>; langs: Set<string> }>();
  for (const row of rows) {
    const key = row.mandate_key?.trim();
    if (!key) continue;
    let facts = out.get(key);
    let set = sets.get(key);
    if (!facts || !set) {
      facts = { mandateKey: key, declaredIn: [], calledFrom: [], languages: [], callSites: 0, flagged: 0 };
      set = { declared: new Set(), called: new Set(), langs: new Set() };
      out.set(key, facts);
      sets.set(key, set);
    }
    const repo = row.repo_slug ?? "";
    const type = slugById.get(row.reference_type_id ?? "") ?? "";
    if (DECLARATION_TYPES.has(type)) {
      if (repo) set.declared.add(repo);
    } else {
      facts.callSites += 1;
      if (repo) set.called.add(repo);
    }
    const lang = languageLabel(row.language);
    if (lang) set.langs.add(lang);
    if ((row.flag && row.flag !== "ok") || row.presence !== "present") facts.flagged += 1;
  }
  for (const [key, facts] of out) {
    const set = sets.get(key)!;
    facts.declaredIn = [...set.declared].sort();
    facts.calledFrom = [...set.called].sort();
    facts.languages = [...set.langs].sort();
  }
  return out;
}
