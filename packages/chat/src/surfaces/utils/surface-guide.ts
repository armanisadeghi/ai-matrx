/**
 * Surface GUIDES — the runtime "how to work on this page" doc a surface ships
 * for in-app agents (`SurfaceManifest.guide`).
 *
 * A guide is a markdown file in the repo (`features/surfaces/guides/<slug>.md`).
 * Manifest sync upserts it as a normal platform skill (`skill.definition`,
 * skill_id `surface-guide-<slug>`) so the agent `skill` tool can `get` and
 * `search` it, and appends ONE pointer line to the stored `ui_surface.intro`
 * so the agent learns the guide exists the moment it lands on the page.
 *
 * Pure helpers only (no fs) — safe for any bundle. The file read and the SQL
 * live in `scripts/emit-surface-sync-sql.ts`.
 */

export const SURFACE_GUIDE_DIR = "features/surfaces/guides";

/** The part of the surface name after the first `/` (`matrx-user/education-classes` → `education-classes`). */
export function surfaceGuideSlug(surfaceName: string): string {
  const slash = surfaceName.indexOf("/");
  return slash < 0 ? surfaceName : surfaceName.slice(slash + 1);
}

/** The conventional guide path for a surface. */
export function surfaceGuidePath(surfaceName: string): string {
  return `${SURFACE_GUIDE_DIR}/${surfaceGuideSlug(surfaceName)}.md`;
}

/** The platform skill id a surface's guide is stored under. */
export function surfaceGuideSkillId(surfaceName: string): string {
  return `surface-guide-${surfaceGuideSlug(surfaceName)}`;
}

/** The ONE line appended to the stored intro of a surface with a guide. */
export function surfaceGuideIntroLine(surfaceName: string): string {
  return `For the full guide to this page, load skill \`${surfaceGuideSkillId(surfaceName)}\` (skill tool, action get) before writing.`;
}

/**
 * The intro as stored in `ui_surface.intro`: the authored intro plus the guide
 * pointer. The line goes inside a closing `</surface_intro>` tag when there is
 * one, so the intro stays a single block. Idempotent.
 */
export function introWithGuidePointer(
  intro: string | null | undefined,
  surfaceName: string,
): string {
  const line = surfaceGuideIntroLine(surfaceName);
  const base = intro?.trim() ?? "";
  if (base.includes(line)) return base;
  if (!base) return line;
  const close = "</surface_intro>";
  if (base.endsWith(close)) {
    return `${base.slice(0, -close.length).trimEnd()}\n\n${line}\n${close}`;
  }
  return `${base}\n\n${line}`;
}

/** Skill label and description for a surface guide (fixed wording). */
export function surfaceGuideSkillText(m: {
  label: string;
  urlPattern?: string | null;
}): { label: string; description: string } {
  const route = m.urlPattern ? ` (${m.urlPattern})` : "";
  return {
    label: `${m.label} — how to work on this page`,
    description: `Guide for agents working on the ${m.label} page${route}: what each value means, which write target does what, the rules and pitfalls. Load it before writing on this page.`,
  };
}
