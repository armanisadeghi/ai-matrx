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
// record store — a table at /data-v2/<id>, a record inside it, a crew capture sheet, the old
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
// THE ONE STAND-IN, AND IT ANNOUNCES ITSELF. Until the chair applies
// `openbyid_one_address_opens_any_id.sql` to the main database, the door is absent there. Then — and only then — this module answers with the
// organization the person is working in, which is exactly what every object page did before,
// and says so in the console with the remedy. This file is the ONE place in the object
// surfaces allowed to read the active organization, and only for that stand-in
// (`pnpm check:object-pages-read-the-objects-organization`).

import { useEffect, useState } from "react";
import type { RecordsDataSource } from "@ai-matrx/records";

import { useOrganizationRequired, type OrganizationState } from "@/features/organizations/useOrganizationRequired";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { getStoreSingleton } from "@/lib/redux/store-singleton";

/**
 * What kind of object the id is, as `custom.where_id_opens` names it: table, record, dashboard,
 * digest, form, booking, portal, rendered_document, table_part. Carried as the door's own word.
 */
export type ObjectKind = string;

/** What `custom.where_id_opens` answers (null when the person may not open it). */
interface WhereIdOpens {
  kind?: unknown;
  organization_id?: unknown;
  path?: unknown;
  live?: unknown;
  resolved_id?: unknown;
}

export type ObjectOrganizationAnswer =
  /** The store named the object's organization, and the person may open the object. */
  | {
      state: "found";
      organizationId: string;
      kind: ObjectKind;
      /** The screen the store says opens it (`/data-v2/<table>?record=…`), or null for a part with none. */
      path: string | null;
      /** False when it is in the trash — the person may still open it, to bring it back. */
      live: boolean;
      /** The id it answers as — a merged record's survivor. */
      resolvedId: string;
    }
  /** Not given to this person — or not there at all. The store does not say which, on purpose. */
  | { state: "not-given" }
  /** We could not ask. NOT an answer about the person's access. */
  | { state: "unavailable"; why: string }
  /**
   * The door is not on this database yet (the chair has not applied it). The caller does what
   * it did before this lane: it reads as the organization the person is working in.
   */
  | { state: "stand-in"; why: string };

const DOOR = "where_id_opens";

/** PostgREST's "no such function" and Postgres's "undefined function" — the door is absent. */
function doorIsAbsent(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return /could not find the function/i.test(error.message ?? "");
}

const STAND_IN_WHY =
  "custom.where_id_opens is not on this database yet, so this page is reading as the " +
  "organization you are working in, as it did before. Remedy: the chair applies " +
  "migrations/campaign/openbyid_one_address_opens_any_id.sql and openbyid_the_resolver_can_be_reached.sql.";

let standInAnnounced = false;
function announceStandIn(): void {
  if (standInAnnounced) return;
  standInAnnounced = true;
  console.warn(`[objectOrganization] STAND-IN: ${STAND_IN_WHY}`);
}

/**
 * Ask the store which organization `id` lives in. The ONE call every object page makes before
 * it calls any other door about that object.
 */
export async function resolveObjectOrganization(
  dataSource: Pick<RecordsDataSource, "rpc">,
  id: string,
): Promise<ObjectOrganizationAnswer> {
  let answered: { data: unknown; error: { code?: string | null; message?: string | null } | null };
  try {
    answered = (await dataSource.rpc(DOOR, { p_id: id }, { schema: "custom" })) as typeof answered;
  } catch (thrown) {
    return {
      state: "unavailable",
      why: thrown instanceof Error ? thrown.message : "The record store did not answer.",
    };
  }
  if (answered.error) {
    if (doorIsAbsent(answered.error)) {
      announceStandIn();
      return { state: "stand-in", why: STAND_IN_WHY };
    }
    return {
      state: "unavailable",
      why: answered.error.message ?? "The record store refused to say where this is.",
    };
  }
  const row = answered.data as WhereIdOpens | null;
  if (row === null || row === undefined) return { state: "not-given" };
  // READ STRICTLY. An answer this module cannot read is "could not ask", never a guess.
  if (typeof row !== "object" || typeof row.organization_id !== "string" || typeof row.kind !== "string") {
    return { state: "unavailable", why: "The record store answered something this page cannot read." };
  }
  return {
    state: "found",
    organizationId: row.organization_id,
    kind: row.kind,
    path: typeof row.path === "string" ? row.path : null,
    live: row.live !== false,
    resolvedId: typeof row.resolved_id === "string" ? row.resolved_id : id,
  };
}

/**
 * The stand-in's organization, for callers outside React. Null when none is picked — the
 * caller then says it could not ask, never guesses one.
 */
export function standInOrganizationId(): string | null {
  const state = getStoreSingleton()?.getState();
  return state ? selectActiveOrganizationId(state) : null;
}

/**
 * An object's organization, for a page that opens that object. Re-asked when the id changes and
 * NEVER when the person switches organization: switching must not re-decide whether this opens.
 */
export type ObjectOrganizationView =
  | { state: "resolving" }
  | Exclude<ObjectOrganizationAnswer, { state: "stand-in" }>
  | {
      state: "stand-in";
      why: string;
      /** The organization the person is working in — what the page read as before. */
      activeOrganizationId: string | null;
      organizationState: OrganizationState;
    };

export function useObjectOrganization(
  dataSource: Pick<RecordsDataSource, "rpc">,
  id: string | null,
): ObjectOrganizationView & { retry: () => void } {
  const [answer, setAnswer] = useState<ObjectOrganizationAnswer | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Read ONLY for the stand-in. It is not a dependency of the ask below.
  const { organizationId: activeOrganizationId, organizationState } = useOrganizationRequired();

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setAnswer(null);
    void resolveObjectOrganization(dataSource, id).then((next) => {
      if (alive) setAnswer(next);
    });
    return () => {
      alive = false;
    };
  }, [dataSource, id, attempt]);

  const retry = () => setAttempt((n) => n + 1);
  if (!id || answer === null) return { state: "resolving", retry };
  if (answer.state === "stand-in") {
    return { state: "stand-in", why: answer.why, activeOrganizationId, organizationState, retry };
  }
  return { ...answer, retry };
}
