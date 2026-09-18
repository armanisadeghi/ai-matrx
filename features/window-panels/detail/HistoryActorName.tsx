// features/window-panels/detail/HistoryActorName.tsx
//
// 🚨 NEW-23 (VERIFY-U-P1-R5) — "Changed by 8f3cb2a1-…" IS NOT AN ANSWER.
//
// Every history row on every record printed a bare 36-character uuid under
// "Changed by": nothing was silent, but nothing was readable either, and the
// person reading it is a brilliant NON-technical expert. An identity the UI names
// that opens nothing and says nothing is the no-dead-ends class.
//
// This is the host's half of `@ai-matrx/detail`'s `history.ActorName` port, and it
// is THE existing resolver, not a second one: `useRecordActors` (the reusable
// org-members read behind the official record stamps) plus `resolveUserName` from
// `components/user/UserIdentity`, which is the ONE way this app turns a user-
// shaped object into a name. Nothing new is read and nothing new is written.
//
// When the directory cannot name the person the id stays, under a title that says
// why — honest rather than pretending, and never a blank.

"use client";

import { useRecordActors } from "@/components/official/record-stamps/useRecordActors";
import { resolveUserName } from "@/components/user/UserIdentity";
import type { DetailRow } from "@/lib/detail/types";

/**
 * The organization whose members are the directory we may legitimately read: the
 * record's own, when the row carries it. A row that does not is resolved against
 * nothing and falls back to the id — never against a guessed org.
 */
function organizationOf(row: DetailRow | null): string | null {
  const value = row?.["organization_id"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function HistoryActorName({
  actorId,
  row,
}: {
  actorId: string;
  row: DetailRow | null;
}) {
  const resolve = useRecordActors(organizationOf(row), [actorId]);
  const actor = resolve(actorId);
  const resolved = actor?.user ? resolveUserName(actor.user) : null;
  // `resolveUserName` answers "Unknown user" for a row it cannot name; that is a
  // stand-in, so it falls through to the id (which at least the developer can use)
  // rather than printing a sentence that claims to be a person.
  const name = resolved && resolved !== "Unknown user" ? resolved : null;
  if (name) return <span className="text-foreground">{name}</span>;
  if (actor?.loading) {
    return (
      <span className="text-muted-foreground" aria-busy="true">
        someone in this organization
      </span>
    );
  }
  return (
    <span
      className="font-mono text-[10px]"
      title="We could not find the person behind this id — they are not a member of this record's organization."
    >
      {actorId}
    </span>
  );
}
