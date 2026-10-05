/**
 * The plain-text slots of a public resource page — the <h1>, the <title>, the
 * Open Graph / Twitter meta — read a resource's title and description through
 * the one kind-aware label (K7, kind-never-raw round 7): a title or
 * description holding kind JSON reads as the kind's words, never the JSON.
 * The rich description body keeps the pipeline (RichContentStaticInline).
 */
import { kindTextLabel } from "@/features/content-ir/surfaces/kind-text-label";
import { displayTitle } from "@/components/markdown-core/plain-title";

/** A resource title for a plain-text slot. */
export function publicResourceTitle(title: string | null | undefined): string {
  return kindTextLabel(displayTitle(title), 200);
}

/** A resource description for a meta tag (plain text, one line). */
export function publicResourceDescription(description: string | null | undefined): string | undefined {
  return description ? kindTextLabel(description, 300) || undefined : undefined;
}
