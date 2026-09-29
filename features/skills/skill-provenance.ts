/**
 * skill-provenance.ts
 *
 * ONE reading of where a skill came from and whether it can actually run here,
 * derived from the row's `config` stamps. Every surface that shows a skill (the
 * library list, the agent skill picker, the detail pane) reads it from here so
 * none of them can drift into presenting an outside expert's text as ours, or
 * promising tooling this platform does not have.
 *
 * The stamps are written by the shared aidream ingester
 * (`matrx_ai/skills/packs.py`) for every imported outside skill pack:
 *   config.ingested_from        "outside_pack"
 *   config.source_authors       ["Elvis Sun", "Carly Martinetti"]
 *   config.source_repo          "https://github.com/elvisun/newsjack"
 *   config.source_commit        "092d882"
 *   config.source_license       "MIT"
 *   config.tooling_not_runnable ["Medialyst (…)", …]   — any row may carry it
 *
 * And the pairing, both ways (aidream `matrx_ai/skills/library.py::link_counterparts`):
 *   config.our_version   {id, skill_id, library_set}  — on the imported original
 *   config.derived_from  {id, skill_id, pack_id, source_repo, source_authors} — on ours
 */

export const OUTSIDE_PACK_SOURCE = "outside_pack";

export interface SkillProvenance {
  /** Written by outside experts and imported, not authored by AI Matrx. */
  imported: boolean;
  authors: string[];
  sourceRepo: string | null;
  /** `github.com/owner/repo` — the repo URL without scheme, for display. */
  sourceLabel: string | null;
  commit: string | null;
  license: string | null;
  /** Tooling the body depends on that does not exist on this platform yet. */
  notRunnable: string[];
  /** On an imported original: AI Matrx's own version of it. */
  ourVersion: SkillCounterpart | null;
  /** On AI Matrx's own version: the imported original it was derived from. */
  derivedFrom: (SkillCounterpart & { sourceName: string | null; authors: string[] }) | null;
}

export interface SkillCounterpart {
  /** `skill.definition.id` of the other row. */
  id: string;
  skillId: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function counterpart(value: unknown): SkillCounterpart | null {
  const r = record(value);
  const id = str(r?.id);
  const skillId = str(r?.skill_id);
  return id && skillId ? { id, skillId } : null;
}

/** `https://github.com/elvisun/newsjack` → `newsjack`. */
function repoName(url: string | null): string | null {
  if (!url) return null;
  const last = url.replace(/\/+$/, "").split("/").pop();
  return last ? last.replace(/\.git$/, "") : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function getSkillProvenance(skill: {
  config: Record<string, unknown> | null | undefined;
}): SkillProvenance {
  const cfg = skill.config ?? {};
  const imported = cfg.ingested_from === OUTSIDE_PACK_SOURCE;
  const sourceRepo = imported ? str(cfg.source_repo) : null;
  return {
    imported,
    authors: imported ? stringList(cfg.source_authors) : [],
    sourceRepo,
    sourceLabel: sourceRepo ? sourceRepo.replace(/^https?:\/\//, "").replace(/\/$/, "") : null,
    commit: imported ? str(cfg.source_commit) : null,
    license: imported ? str(cfg.source_license) : null,
    notRunnable: stringList(cfg.tooling_not_runnable),
    ourVersion: imported ? counterpart(cfg.our_version) : null,
    derivedFrom: derivedFrom(cfg.derived_from),
  };
}

function derivedFrom(value: unknown): SkillProvenance["derivedFrom"] {
  const base = counterpart(value);
  if (!base) return null;
  const r = record(value);
  return {
    ...base,
    sourceName: repoName(str(r?.source_repo)),
    authors: stringList(r?.source_authors),
  };
}

/** "Elvis Sun and Carly Martinetti" / "A, B, and C". */
export function formatAuthors(authors: string[]): string {
  if (authors.length <= 2) return authors.join(" and ");
  return `${authors.slice(0, -1).join(", ")}, and ${authors[authors.length - 1]}`;
}

/**
 * One plain sentence for a list row, naming the row's counterpart when it has one:
 * "By X and Y · imported from github.com/o/r · our version: matrx-…" on an original,
 * "AI Matrx version · derived from newsjack's angle-generator (X and Y)" on ours.
 */
export function attributionLine(p: SkillProvenance): string | null {
  if (p.derivedFrom) {
    const d = p.derivedFrom;
    const from = d.sourceName ? `${d.sourceName}'s ${d.skillId}` : d.skillId;
    const by = d.authors.length ? ` (${formatAuthors(d.authors)})` : "";
    return `AI Matrx version · derived from ${from}${by}`;
  }
  if (!p.imported) return null;
  const parts: string[] = [];
  if (p.authors.length) parts.push(`By ${formatAuthors(p.authors)}`);
  parts.push(p.sourceLabel ? `imported from ${p.sourceLabel}` : "imported outside skill");
  if (p.ourVersion) parts.push(`our version: ${p.ourVersion.skillId}`);
  return parts.join(" · ");
}

/** Tooltip / screen-reader text for the not-runnable badge. */
export function notRunnableSummary(p: SkillProvenance): string | null {
  if (p.notRunnable.length === 0) return null;
  return `Parts of this skill need tooling that is not in AI Matrx yet: ${p.notRunnable.join("; ")}. Those steps are the spec for a native rebuild and cannot run here.`;
}
