"use client";

// features/unified-data/objectOrganization.ts — LANE ACCESS-IS-PERSONAL
//
// WHICH ORGANIZATION DOES THIS OBJECT LIVE IN — READ FROM THE OBJECT, NEVER FROM THE PERSON.
//
// THE OWNER'S LAW (2026-09-23): "The permission is to the person, not the org. ALWAYS. If I,
// a person, have access to something, it doesn't matter how I got that access; the access is
// mine. My active org has no impact on what I can see … For any RECORD I try to see, the
// active org is meaningless."
//
// 🚨 THE DEFECT THIS CLOSES (VERIFIER-15 M8, VERIFIER-16 verdict 2). Every object page in the
// record store — a table at /data/<id>, a record inside it, a crew capture sheet, the old
// /data/<id> link — mounted the store for the organization the person had PICKED, and every
// store door (`custom.read_record(p_organization_id, …)` and its siblings) decides the
// organization wall first. So a member of Rincon Plumbing Co working in her franchise group
// opened a Rincon table and read "This table is not in the organization you are working in …
// or it may have been deleted" — the door refused the organization the PAGE chose, not her.
//
// THE DOORS KEEP THEIR SHAPE; THE CALLER CHANGES. Every door still takes the organization and
// still checks it first. What changes is who chooses it: the object page asks this module,
// which asks `custom.where_id_opens(p_id)` — the store's ONE door that reads an object's
// organization from the object's own id (a Table, a record, a dashboard, a digest, a form or
// booking page, a portal, a rendered document), answering only when the person could already
// open it (the organization wall, then the ladder) — and hands the doors THAT organization.
// It is the same door `platform.resolve_id` and `/o/<id>` stand on (lane ROUTE-RESOLVER); this
// lane briefly had a second door answering the same question and removed it, because two
// answers to one question is the defect this whole lane exists to close.
//
// THE ANSWER IS THE PERSON'S. Zero rows means "you have not been given this" and "this does
// not exist" alike (the store will not tell a guessed id apart from a real one), and the page
// says exactly that. "We could not ask" is a third answer and is never folded into either.
//
// NO STAND-IN. `custom.where_id_opens` is live on the database, so there is no fallback to the
// organization the person is working in: a miss says so in a sentence ("unavailable", with the
// remedy) and the page holds. The active organization is never read in this file
// (`pnpm check:object-pages-read-the-objects-organization`).

import { createKeptAnswers } from "@/lib/kept-answer/keptAnswer";
import { useTablePageSeed } from "@/features/unified-data/page-seed/tablePageSeedContext";
import type { RecordsDataSource } from "@ai-matrx/records";

// THE READER AND THE DOOR LIVE IN `@ai-matrx/records` (step 10, 2026-10-08): `resolveObjectOrganization`,
// `readObjectOrganizationAnswer` and the answer type are the store's "which organization owns this record"
// port. This file is the website's implementation of that port: answers kept per object for the session and
// seeded from the server render.
import {
  readObjectOrganizationAnswer,
  resolveObjectOrganization,
  type ObjectKind,
  type ObjectOrganizationAnswer,
  type RecordOrganizationPort,
} from "@ai-matrx/records";
export { readObjectOrganizationAnswer, resolveObjectOrganization };
export type { ObjectKind, ObjectOrganizationAnswer };

/** The website's `RecordOrganizationPort` (`createRecords({ organizationOf })`): kept answers, asked once. */
export function keptObjectOrganizationPort(dataSource: Pick<RecordsDataSource, "rpc">): RecordOrganizationPort {
  return {
    async organizationOf(id) {
      return (await ensureObjectOrganization(dataSource, id)) ?? { state: "unavailable", why: "The record store did not answer." };
    },
  };
}

/**
 * An object's organization, for a page that opens that object. Re-asked when the id changes and
 * NEVER when the person switches organization: switching must not re-decide whether this opens.
 *
 * 🚨 KEPT PER OBJECT FOR THE SESSION, NEVER BLANKED (lane REMOUNT-SAFETY, 2026-10-02). The answer
 * lives in one module store keyed by the object's id (`lib/kept-answer`), not in this component.
 * A page or Board tile that remounts — or wakes from sleep, which re-runs every effect — reads
 * the last answer synchronously and keeps drawing what it drew; the door is re-asked in the
 * background only once the answer is stale, and the screen moves only when the answer CHANGED.
 * Until 2026-10-02 the answer was `useState` set back to null at the top of the effect, so every
 * remount and wake showed "Opening the table…" and UNMOUNTED the grid behind it (scroll,
 * selection, a half-typed cell, column state — gone), then re-read every row. `retry()` re-asks
 * without blanking. "Could not ask" is shown but never kept fresh. Forgotten on sign-out.
 */
export type ObjectOrganizationView = { state: "resolving" } | ObjectOrganizationAnswer;

const objectOrganizations = createKeptAnswers<ObjectOrganizationAnswer>({
  keep: (answer) => answer.state !== "unavailable",
});

/**
 * HAND THE PAGE AN ANSWER ALREADY BEING ASKED ELSEWHERE (lane PAGE-BUNDLE-2): the server render
 * asked `custom.where_id_opens` as the same person. Kept as this id's in-flight question, so the
 * page's `useObjectOrganization` waits on it and asks nothing. A fresh kept answer wins.
 */
export function primeObjectOrganization(id: string, answer: Promise<ObjectOrganizationAnswer>): void {
  void objectOrganizations.ensure(id, () => answer);
}

/** The kept answer for `id`, asked only when none is fresh or in flight — what `useObjectOrganization` waits on. */
export function ensureObjectOrganization(
  dataSource: Pick<RecordsDataSource, "rpc">,
  id: string,
): Promise<ObjectOrganizationAnswer | null> {
  return objectOrganizations.ensure(id, () => resolveObjectOrganization(dataSource, id));
}

/** Tests only: forget every kept answer. */
export function forgetObjectOrganizations(): void {
  objectOrganizations.forget();
}

export function useObjectOrganization(
  dataSource: Pick<RecordsDataSource, "rpc">,
  id: string | null,
): ObjectOrganizationView & { retry: () => void } {
  const { answer, retry } = objectOrganizations.useAnswer(id, () => resolveObjectOrganization(dataSource, id ?? ""));
  // THE SERVER ALREADY ASKED (lane SSR-ROWS): on a table page whose server seed answered where this
  // id lives, that answer is drawn in the first pass — on the server and while hydrating — so the
  // table mounts in the server's HTML. The kept store holds the same answer once its prime lands.
  const seeded = useTablePageSeed();
  if (id && answer === null && seeded && seeded.tableId === id && !seeded.where.error) {
    return { ...readObjectOrganizationAnswer(seeded.where, id), retry };
  }
  if (!id || answer === null) return { state: "resolving", retry };
  return { ...answer, retry };
}
