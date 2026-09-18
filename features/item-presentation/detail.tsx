"use client";

/**
 * Item Presentation → the Detail primitive's record-type map.
 *
 * THE ONE TYPE MAP. `registry.tsx` (icon, accent, label, `detailSource`,
 * `entityToken`) is the registry; this file turns one of its entries into a
 * `DetailRecordType` for `lib/detail`, so every registry-known type shows in
 * all three presentations (window / docked / page) from ONE registration and
 * never a second registry. It replaced `ItemDetailWindow.tsx` (2026-09-17):
 * the loader, the field formatting, the surface scope and the right-click
 * menu are the same behaviour, moved behind the contract.
 *
 * Unknown types still resolve (the neutral fallback config, seed-only) —
 * exactly what the old window did — so an agent-emitted type nobody has
 * registered yet renders a calm card, never an error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isEntityTypeToken } from "@ai-matrx/associations";

import { supabase } from "@/utils/supabase/client";
import { awaitOrganizationForRecordRead } from "@/features/organizations/awaitWorkspace";
import { fieldsFromRow } from "@/lib/detail/format";
import type {
  DetailLoadResult,
  DetailRecordType,
  DetailRow,
  DetailSeed,
} from "@/lib/detail/types";
import { isUuidValue, tokenFromColumnName } from "@/components/official/entity-ref/doors";

import { entityTokenForItemType, getItemConfig, type ItemTypeConfig } from "./registry";
import { ItemDetailFrame } from "./ItemDetailFrame";
import { sourceHealthProducerFor } from "./sourceHealth";

const DOORS = { tokenFromColumnName, isUuidValue };

function makeLoader(
  detailSource: NonNullable<ItemTypeConfig["detailSource"]>,
): DetailRecordType["load"] {
  return async (id, signal): Promise<DetailLoadResult<DetailRow>> => {
    // MATRX-EXCEPTION: dynamic table name → the UNtyped generic client (same
    // as the registry's fetchRow). The typed client rejects `.from(string)`
    // and blows the instantiation depth resolving the full schema union. This
    // is the deliberate generic fallback for arbitrary item types — there is
    // no single table/row shape to type against.
    const baseDb = supabase as unknown as SupabaseClient;
    const db = detailSource.schemaName ? baseDb.schema(detailSource.schemaName) : baseDb;
    const table: string = detailSource.table;
    const selectAll: string = "*";
    const { data, error } = await db
      .from(table)
      .select(selectAll)
      .eq("id", id)
      .abortSignal(signal)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { notFound: true };
    // MATRX-EXCEPTION: the untyped client's result for a runtime table.
    return { row: data as unknown as DetailRow };
  };
}

/**
 * 🚨 THE ORGANIZATION QUESTION IS ASKED FIRST, AND IT EXPLAINS AN EMPTY READ —
 * IT NEVER GATES ONE (VERIFY-R7-FIX-WAVE NEW-2, seat-proven 2026-09-18).
 *
 * From the seat, a cold load of `/detail/google_document/<id>` issued
 *
 *   +4231ms  GET …/google_document?select=*&id=eq.…
 *   +4610ms  POST …/rpc/current_personal_org_id      ← the organization question
 *
 * — the read went out before anything had asked which organization the person
 * works in, and when it came back empty the screen blamed the provider:
 * "it may have been moved, deleted, or isn't shared with you." Three
 * explanations, and the true one — "you have not chosen an organization yet" —
 * was not among them, on the surface F-82 had just made the canonical door,
 * while the in-place opener for the same record was organization-honest.
 *
 * WHAT THIS DOES, AND THE ONE THING IT DELIBERATELY DOES NOT DO. The question
 * is asked BEFORE the read is issued — it is started first, on purpose, so the
 * answer is in hand by the time the row is. It does NOT hold the read up, and it
 * does NOT refuse one, because `docs/official/db-rules.md` §6 is explicit that
 * access never depends on the ACTIVE organization: RLS scopes this row to the
 * viewer's memberships, so a person who has not picked a working organization
 * may still legitimately open a record, and gating the read on a selection would
 * be exactly the over-tightening that document calls a defect. What the answer
 * is for is the EMPTY case: a row that came back with nothing, while nothing is
 * selected, is explained by the missing selection and its remedy — never by a
 * claim about the record.
 *
 * WHY THE WRAP IS HERE AND NOT IN `makeLoader`. `refineDetail` may REPLACE the
 * loader — both Google types do, and so will the next bespoke registration — so
 * a gate inside the generic loader is a gate every refinement walks around. It
 * rides whatever `load` the FINISHED registration carries, which is the one
 * place no registration can get wrong.
 *
 * The wait is BOUNDED and issues NO request of its own: it joins the answer the
 * boot path is already fetching (`orgBootstrapGate`) and gives up on the
 * `organizations.workspace action_wait_ms` knob.
 */
function askTheOrganizationFirst(
  load: DetailRecordType["load"],
): DetailRecordType["load"] {
  if (!load) return null;
  return async (id, signal) => {
    // Started before the read, awaited only if the read finds nothing.
    const organization = awaitOrganizationForRecordRead();
    const result = await load(id, signal);
    if (!("notFound" in result)) {
      void organization.catch(() => undefined);
      return result;
    }
    const answered = await organization;
    if (answered.status !== "ready") throw new Error(answered.reason);
    return result;
  };
}

function titleFor(
  config: ItemTypeConfig,
): (row: DetailRow | null, seed: DetailSeed | null) => string {
  const titleField = config.detailSource?.titleField;
  return (row, seed) => {
    const fetched =
      titleField && row && typeof row[titleField] === "string" ? (row[titleField] as string) : null;
    return fetched?.trim() || seed?.name?.trim() || `Untitled ${config.label}`;
  };
}

const cache = new Map<string, DetailRecordType>();

/** The `DetailRecordType` for an item-presentation type. Stable per type. */
export function resolveItemDetailType(type: string): DetailRecordType | null {
  if (!type) return null;
  const hit = cache.get(type);
  if (hit) return hit;

  const { config, recognized } = getItemConfig(type);
  // NOT `type` verbatim — a few item types are spelled differently in the
  // entity registry (`table` → `dataset`, `document` → `udt_document`,
  // `picklist` → `structured_list`); the raw type would silently cost those
  // records their route, peek, associations and history.
  const doorToken = entityTokenForItemType(type);
  const entityToken = doorToken && isEntityTypeToken(doorToken) ? doorToken : null;
  const detailSource = recognized ? config.detailSource : undefined;

  const base: DetailRecordType = {
    type,
    label: config.label,
    icon: config.icon,
    accent: config.accent,
    entityToken,
    load: detailSource ? makeLoader(detailSource) : null,
    title: titleFor(config),
    fields: (row) => fieldsFromRow(row, DOORS),
    // 🚨 PLAN §4 / §5.3 — THE SOURCE HEALTH STRIP'S PRODUCER. Every registration
    // carries it; it answers null for a row that is not a mirror of a provider,
    // which is every platform-owned record, and for a SYNCED row it derives the
    // strip from the connectors' own `productHealth` over the server's recorded
    // `capability_health` — one reader, so a record and the connectors screen can
    // never disagree about the same grant. Until 2026-09-17 nothing set this
    // field, so no record could render the strip at all (VERIFY-U-P1-R4).
    health: sourceHealthProducerFor(type),
    Frame: ItemDetailFrame,
  };
  // A type that knows more about itself than a generic composition can say
  // refines the base — ONE registration still, never a second registry. See
  // `ItemTypeConfig.refineDetail`.
  const refined = recognized && config.refineDetail ? config.refineDetail(base) : base;
  // The gate rides the FINISHED registration's loader — after refinement, so a
  // bespoke `load` cannot skip the organization question (see above).
  const recordType: DetailRecordType = {
    ...refined,
    load: askTheOrganizationFirst(refined.load),
  };
  cache.set(type, recordType);
  return recordType;
}
