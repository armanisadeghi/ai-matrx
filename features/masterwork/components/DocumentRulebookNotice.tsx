"use client";

/**
 * DocumentRulebookNotice — one row at the top of a document that IS a Rulebook
 * source, saying what the document is for and how to get back.
 *
 * ─── WHY ────────────────────────────────────────────────────────────────────
 * Cold walk 18 (2026-09-21): inside her own Rulebook, an Expert clicks
 * "Add more → New document", names it, and lands in a full word processor in a
 * NEW TAB — Bold/Italic/Arial/11pt and a page ruler — with "not one sentence
 * saying what this is or how what she types gets back into her rules". The
 * document was genuinely attached to the Rulebook on the way out
 * (`AssociationCaptureToolbar` calls the host's `attach` with the new
 * document's id before it opens anything), so the connection is real; the
 * screen simply never said so, and the new tab has no Back.
 *
 * ─── WHY THE ASSOCIATION AND NOT A QUERY PARAM ──────────────────────────────
 * The obvious fix is `?from=rulebook&rulebook_id=…` on the opened URL. It is
 * the weaker one: it only tells the truth for the one tab that was opened from
 * the toolbar, and it is a CLAIM in a URL rather than a fact about the data —
 * reopen the document from `/documents`, share it, or bookmark it, and the
 * sentence disappears even though the Rulebook is still learning from every
 * word. The edge is already in `platform.associations` (role
 * `distillation_source`), so this reads the real thing, the same way
 * `ResearchUsedBy` reads the reverse of research lineage. One canonical
 * association read, the shared title resolver, the entity registry's door.
 *
 * Renders NOTHING when the document belongs to no Rulebook, so it costs the
 * ordinary `/documents/[id]` visitor one row of nothing.
 */

import Link from "next/link";
import { BookOpen } from "lucide-react";

import { CalloutBanner } from "@/components/official/CalloutBanner";
import { Button } from "@/components/ui/button";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";

import { DUMP_ROLE } from "../sourceLinks";

/** The entity token a cloud document is attached as. */
const DOCUMENT_TOKEN = "udt_document";
/** The container token a Rulebook is. */
const RULEBOOK_TOKEN = "rulebook";

export interface DocumentRulebookNoticeProps {
  documentId: string | null;
  className?: string;
}

/**
 * Every Rulebook this document is a source of. Exported so the test drives the
 * same reducer the component does rather than a copy of it.
 */
export function rulebooksLearningFrom(
  edges: readonly {
    otherType: string;
    otherId: string;
    role: string | null;
  }[],
): { token: string; id: string }[] {
  const matches = edges.filter(
    (edge) => edge.otherType === RULEBOOK_TOKEN && edge.role === DUMP_ROLE,
  );
  const seen = new Set<string>();
  const unique: { token: string; id: string }[] = [];
  for (const edge of matches) {
    if (seen.has(edge.otherId)) continue;
    seen.add(edge.otherId);
    unique.push({ token: RULEBOOK_TOKEN, id: edge.otherId });
  }
  return unique;
}

export function DocumentRulebookNotice({
  documentId,
  className,
}: DocumentRulebookNoticeProps) {
  const assoc = useAssociations({ type: DOCUMENT_TOKEN, id: documentId });
  const rulebooks = rulebooksLearningFrom(assoc.edges);
  const titles = useEntityTitles(rulebooks);

  if (!documentId || rulebooks.length === 0) return null;

  const first = rulebooks[0]!;
  const href = getEntityInfo(RULEBOOK_TOKEN).hrefFor?.(first.id);
  // While the title is still resolving the row still says the true thing —
  // it just says "your Rulebook" instead of naming it. A row that waits for a
  // name is a row that is absent exactly when the person needs it most.
  const name = titles.loading ? null : titles.titleFor(first);
  const named = name && !titles.isUnresolved(first) ? `“${name}”` : "your Rulebook";
  const alsoOthers =
    rulebooks.length > 1
      ? ` and ${rulebooks.length - 1} other Rulebook${rulebooks.length > 2 ? "s" : ""}`
      : "";

  return (
    <CalloutBanner
      tone="info"
      icon={BookOpen}
      className={className}
      title={`Everything you write here becomes material ${named}${alsoOthers} learns from, and it saves as you type.`}
      actions={
        href ? (
          <Button asChild size="sm" variant="outline" className="h-7">
            <Link href={href}>Back to the Rulebook</Link>
          </Button>
        ) : undefined
      }
    />
  );
}
