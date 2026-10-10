/**
 * MAY THIS VIEWER OPEN WHAT A RELATION POINTS AT? — asked through each token's own door, batched.
 *
 * KINDS-GLUE wave 4 §A.3.4 (B6). Every relation chip drawn in one render tick joins one batch:
 *  - `record` with a table: `custom.read_records_by_ids` — ONE call per table (the store's own
 *    read ladder, as the viewer);
 *  - `record` with no table, or one the active organization's door does not know:
 *    `platform.resolve_id` (the `/o/<id>` door), which answers in its own sentence;
 *  - every other token: ONE `custom.entity_reference_words` call for all of them — the store
 *    withholds the label of a thing this person may not open.
 * A chip is drawn as a link ONLY after its door said yes. A token with no door says so.
 */

import { useEffect, useState } from "react";
import { storeDoors } from "@ai-matrx/records/core";
import { createClient } from "@/utils/supabase/client";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { pickListSourceRefusal } from "@/features/content-ir/kinds/record-primitives";

export interface RelationRef {
  token: string;
  id: string;
  tableId?: string | null;
}

export type Openability =
  | { state: "checking" }
  | { state: "open" }
  | { state: "closed"; sentence: string };

/** The doors, injectable so the guard can count calls. */
export interface OpenabilityDoors {
  /**
   * Ids of `ids` the viewer may read in `tableId`; null when the door refused the whole call. The
   * table's OWN organization is asked (never the active one, which is not a read filter);
   * `organizationId` is used only when the table's cannot be found.
   */
  readRecords(organizationId: string | null, tableId: string, ids: string[]): Promise<Set<string> | null>;
  /** The table's own document (display, kept_for, name), read as the viewer; null when refused. */
  tableDocument(tableId: string): Promise<Record<string, unknown> | null>;
  /** The `/o/<id>` door: open, or its own sentence. */
  resolveId(id: string): Promise<{ open: boolean; says: string | null }>;
  /** `{token:id → label|null}` (null = withheld); null when the call failed. */
  entityWords(organizationId: string, refs: RelationRef[]): Promise<Map<string, string | null> | null>;
  hasDoor(token: string): boolean;
}

export const CANT_OPEN_RECORD = "You can't open this record. It may be in the trash, or not shared with you.";
export const CANT_OPEN_THING = "You can't open this. It may be deleted, or not shared with you.";
export const NO_DOOR = "Can't open this here.";
export const DOOR_FAILED = "This couldn't be checked right now.";
export const CANT_OPEN_LIST = "You can't open the Pick list these choices come from.";

const keyOf = (r: RelationRef) => `${r.token}:${r.id}`;

export function supabaseOpenabilityDoors(): OpenabilityDoors {
  const supabase = createClient();
  const doors = storeDoors(supabase);
  const tableOrgs = new Map<string, Promise<string | null>>();
  const tableOrg = (tableId: string) => {
    let known = tableOrgs.get(tableId);
    if (!known) {
      known = Promise.resolve(supabase.schema("platform").rpc("resolve_id", { p_id: tableId })).then(({ data }) => {
        const org = (data as { organization_id?: string } | null)?.organization_id;
        return typeof org === "string" ? org : null;
      });
      tableOrgs.set(tableId, known);
    }
    return known;
  };
  let kernel: Promise<string | null> | null = null;
  const tableKernel = () =>
    (kernel ??= Promise.resolve(doors.tableKernelId()).then(({ data }) =>
      typeof data === "string" ? data : null,
    ));
  return {
    async tableDocument(tableId) {
      const [owner, kernelId] = await Promise.all([tableOrg(tableId), tableKernel()]);
      if (!owner || !kernelId) return null;
      const { data, error } = await doors.readRecordsByIds(owner, kernelId, [tableId]);
      if (error) return null;
      const row = ((data ?? []) as Array<{ id: string; document: unknown }>).find((r) => r.id === tableId);
      return row && typeof row.document === "object" && row.document !== null
        ? (row.document as Record<string, unknown>)
        : null;
    },
    async readRecords(organizationId, tableId, ids) {
      const owner = (await tableOrg(tableId)) ?? organizationId;
      if (!owner) return null;
      const { data, error } = await doors.readRecordsByIds(owner, tableId, ids);
      if (error) return null;
      return new Set(((data ?? []) as Array<{ id: string }>).map((row) => row.id));
    },
    async resolveId(id) {
      const { data, error } = await supabase.schema("platform").rpc("resolve_id", { p_id: id });
      if (error || !data) return { open: false, says: null };
      const answer = data as { state?: string; says?: string };
      // The door's states: opens | in_trash | not_yours | no_screen | no_such_side. Only `opens` opens.
      return { open: answer.state === "opens", says: answer.says ?? null };
    },
    async entityWords(organizationId, refs) {
      const { data, error } = await doors.entityReferenceWords(organizationId, refs);
      if (error) return null;
      const out = new Map<string, string | null>();
      for (const row of (data ?? []) as Array<{ token: string; id: string; label: string | null }>) {
        out.set(`${row.token}:${row.id}`, row.label ?? null);
      }
      return out;
    },
    hasDoor: (token) => token === "record" || tryGetEntityInfo(token) !== null,
  };
}

/** One batcher per (doors, organization): collects a tick's asks, one call per door group. */
export function createOpenabilityBatcher(doors: OpenabilityDoors, organizationId: string | null) {
  const answers = new Map<string, Promise<Openability>>();
  let pending: Array<{ ref: RelationRef; settle: (o: Openability) => void }> = [];
  let scheduled = false;

  async function flush(): Promise<void> {
    const batch = pending;
    pending = [];
    scheduled = false;
    const settleAll = (refs: RelationRef[], o: (r: RelationRef) => Openability) => {
      for (const item of batch) if (refs.includes(item.ref)) item.settle(o(item.ref));
    };
    const refs = batch.map((b) => b.ref);
    const noDoor = refs.filter((r) => !doors.hasDoor(r.token));
    settleAll(noDoor, () => ({ state: "closed", sentence: NO_DOOR }));

    const records = refs.filter((r) => r.token === "record");
    const toResolve: RelationRef[] = records.filter((r) => !r.tableId);
    const byTable = new Map<string, RelationRef[]>();
    for (const r of records) {
      if (r.tableId) byTable.set(r.tableId, [...(byTable.get(r.tableId) ?? []), r]);
    }
    const tableWork = [...byTable.entries()].map(async ([tableId, group]) => {
      const readable = await doors.readRecords(organizationId, tableId, [...new Set(group.map((g) => g.id))]);
      if (readable === null) {
        toResolve.push(...group);
        return;
      }
      settleAll(group, (r) => (readable.has(r.id) ? { state: "open" } : { state: "closed", sentence: CANT_OPEN_RECORD }));
    });

    const entities = refs.filter((r) => r.token !== "record" && doors.hasDoor(r.token));
    const entityWork = (async () => {
      if (entities.length === 0) return;
      const words = organizationId ? await doors.entityWords(organizationId, entities) : null;
      settleAll(entities, (r) => {
        if (words === null) return { state: "closed", sentence: DOOR_FAILED };
        return words.get(keyOf(r)) ? { state: "open" } : { state: "closed", sentence: CANT_OPEN_THING };
      });
    })();

    await Promise.all(tableWork);
    await Promise.all(
      toResolve.map(async (r) => {
        const answer = await doors.resolveId(r.id);
        settleAll([r], () => (answer.open ? { state: "open" } : { state: "closed", sentence: answer.says ?? CANT_OPEN_RECORD }));
      }),
    );
    await entityWork;
  }

  return {
    ask(ref: RelationRef): Promise<Openability> {
      const key = `${keyOf(ref)}:${ref.tableId ?? ""}`;
      const known = answers.get(key);
      if (known) return known;
      const promise = new Promise<Openability>((settle) => {
        pending.push({ ref, settle });
        if (!scheduled) {
          scheduled = true;
          queueMicrotask(() => {
            void flush().catch(() => {
              for (const item of pending) item.settle({ state: "closed", sentence: DOOR_FAILED });
            });
          });
        }
      });
      answers.set(key, promise);
      return promise;
    },
  };
}

type Batcher = ReturnType<typeof createOpenabilityBatcher>;
const batchers = new Map<string, Batcher>();
let sharedDoors: OpenabilityDoors | null = null;

/** Test seam: replace the doors (and forget every cached answer). */
export function setOpenabilityDoorsForTests(doors: OpenabilityDoors | null): void {
  sharedDoors = doors;
  batchers.clear();
}

function openabilityDoors(): OpenabilityDoors {
  sharedDoors ??= supabaseOpenabilityDoors();
  return sharedDoors;
}

function batcherFor(organizationId: string | null): Batcher {
  const key = organizationId ?? "";
  let batcher = batchers.get(key);
  if (!batcher) {
    batcher = createOpenabilityBatcher(openabilityDoors(), organizationId);
    batchers.set(key, batcher);
  }
  return batcher;
}

/** A ref's identity as one string (`token:id:tableId`), and back — the hooks' effect key. */
const signatureOf = (r: RelationRef) => `${r.token}:${r.id}:${r.tableId ?? ""}`;
function refOfSignature(signature: string): RelationRef {
  const [token = "", id = "", tableId = ""] = signature.split(":");
  return { token, id, tableId: tableId || null };
}

/** The openability of each ref, by `token:id`; "checking" until its door answers. */
export function useOpenability(refs: RelationRef[], organizationId: string | null): Map<string, Openability> {
  const signature = refs.map(signatureOf).join("|");
  const [answers, setAnswers] = useState<Map<string, Openability>>(new Map());
  useEffect(() => {
    if (!signature) return;
    let live = true;
    const batcher = batcherFor(organizationId);
    for (const ref of signature.split("|").map(refOfSignature)) {
      void batcher.ask(ref).then((answer) => {
        if (live) setAnswers((prev) => new Map(prev).set(keyOf(ref), answer));
      });
    }
    return () => {
      live = false;
    };
  }, [signature, organizationId]);
  const out = new Map<string, Openability>();
  for (const ref of refs) out.set(keyOf(ref), answers.get(keyOf(ref)) ?? { state: "checking" });
  return out;
}

export type ListMembership =
  | { state: "checking" }
  | { state: "read"; members: Set<string> }
  | { state: "refused"; sentence: string };

/**
 * WHICH OF THESE IDS ARE RECORDS OF THIS PICK LIST — one read of the list's own records, as the
 * viewer (chair V2). No fallback door: a record of another table is never a member.
 */
export function usePickListMembership(
  organizationId: string | null,
  listId: string | null,
  ids: string[],
): ListMembership {
  const signature = [...new Set(ids)].join("|");
  const [answer, setAnswer] = useState<ListMembership>({ state: "checking" });
  useEffect(() => {
    if (!listId || !signature) {
      setAnswer({ state: "refused", sentence: CANT_OPEN_LIST });
      return;
    }
    let live = true;
    setAnswer({ state: "checking" });
    const doors = openabilityDoors();
    void (async () => {
      // Chair V2: the table must BE a Pick list before its records are offered as choices.
      const refusal = pickListSourceRefusal(await doors.tableDocument(listId));
      if (refusal) return { state: "refused", sentence: refusal } as const;
      const members = await doors.readRecords(organizationId, listId, signature.split("|"));
      return members === null ? ({ state: "refused", sentence: CANT_OPEN_LIST } as const) : ({ state: "read", members } as const);
    })()
      .then((next) => {
        if (live) setAnswer(next);
      })
      .catch(() => {
        if (live) setAnswer({ state: "refused", sentence: CANT_OPEN_LIST });
      });
    return () => {
      live = false;
    };
  }, [organizationId, listId, signature]);
  return answer;
}
