// features/acquisition-console/service.ts
//
// THE FIVE READS behind the Acquisition Console, straight to Supabase with RLS —
// the way every client read on this platform works (root CLAUDE.md: clients never
// route DB reads through the Python server; the server is for work a client
// cannot do, and counting rows you are already allowed to see is not that).
//
// 🚨 THE ORGANIZATION IS PASSED, NEVER DEFAULTED. Four of these five registers
// carry `organization_id` and every one of them is filtered by the id the caller
// hands in. RLS is the fence; the explicit filter is the ANSWER TO THE QUESTION
// — "what does THIS workspace have" — and a read that leaned on RLS alone would
// quietly answer "everything you can see anywhere", which is a different screen.
// `users.integration_connections` is the exception and says so below.
//
// 🚨 EVERY READ IS BOUNDED AND SAYS SO. A page that silently stops at a cap is
// a page that lies about a total. Where a cap is reached the loader pushes a
// sentence onto `problems`, which the screen prints beside the table.

import { supabase } from "@/utils/supabase/client";
import {
  parseBlocks,
  parseConnections,
  parseHandoffs,
  parseLibraries,
  parseRulebookSources,
  rollUpLibraries,
  rollUpRulebookSources,
  sortHaveRows,
  type RulebookSourceFacts,
} from "./contract";
import type { BlockedRow, ConnectedRow, HaveRow } from "./types";

/** How many rows a section will read before it stops and says it stopped. */
const CAP = 2000;

/** A Rulebook a person can narrow the console to. */
export interface RulebookChoice {
  id: string;
  name: string;
  sourceCount: number;
}

/** Everything the console renders, in one value, with every problem named. */
export interface ConsoleData {
  have: HaveRow[];
  connected: ConnectedRow[];
  blocked: BlockedRow[];
  rulebooks: RulebookChoice[];
  /** One plain sentence per row this screen refused to render, plus any cap hit. */
  problems: string[];
}

function capSentence(register: string, cap: number): string {
  return (
    `This workspace has more ${register} than this screen reads in one go, so ` +
    `the numbers below count the most recent ${cap.toLocaleString()} and no more. ` +
    `Nothing has been hidden — open the register itself for the full list.`
  );
}

async function readLibraries(organizationId: string) {
  const { data, error } = await supabase
    .schema("media")
    .from("source_library")
    .select("id,adapter,name,item_count,last_synced_at,updated_at,metrics,visibility,created_by")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(CAP);
  if (error) throw error;
  const items = data ?? [];
  const parsed = parseLibraries(items);
  if (items.length >= CAP) parsed.problems.push(capSentence("Libraries", CAP));
  return parsed;
}

async function readRulebookSources(organizationId: string, rulebookId: string | null) {
  let builder = supabase
    .schema("platform")
    .from("masterwork_source")
    .select("id,rulebook_id,medium,turn_count,word_count,captured_at,created_at")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (rulebookId) builder = builder.eq("rulebook_id", rulebookId);

  const { data, error } = await builder
    .order("created_at", { ascending: false })
    .limit(CAP);
  if (error) throw error;
  const items = data ?? [];
  const parsed = parseRulebookSources(items);
  if (items.length >= CAP) {
    parsed.problems.push(capSentence("Sources kept on Rulebooks", CAP));
  }
  return parsed;
}

/**
 * The Rulebooks this workspace's Sources actually hang off, with their names.
 *
 * A Rulebook whose name this seat cannot read still appears — by its own id —
 * rather than vanishing from the filter. A missing option is indistinguishable
 * from "there is no such Rulebook", and that is a screen telling a lie by omission.
 */
async function readRulebookChoices(
  sources: RulebookSourceFacts[],
): Promise<RulebookChoice[]> {
  const counts = new Map<string, number>();
  for (const source of sources) {
    if (!source.rulebookId) continue;
    counts.set(source.rulebookId, (counts.get(source.rulebookId) ?? 0) + 1);
  }
  const ids = [...counts.keys()];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .schema("platform")
    .from("rulebook")
    .select("id,name")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) throw error;

  const names = new Map<string, string>();
  for (const row of (data ?? []) as { id?: unknown; name?: unknown }[]) {
    if (typeof row.id === "string") {
      names.set(row.id, typeof row.name === "string" ? row.name : row.id);
    }
  }

  return ids
    .map((id) => ({
      id,
      name: names.get(id) ?? `Rulebook ${id.slice(0, 8)} (name not readable here)`,
      sourceCount: counts.get(id) ?? 0,
    }))
    .sort((a, b) => b.sourceCount - a.sourceCount || a.name.localeCompare(b.name));
}

/**
 * 🚨 THE ONE READ THAT IS NOT ORGANIZATION-FILTERED, and why.
 *
 * `users.integration_connections` holds two kinds of row: a workspace's own
 * connection (`owner_type = 'organization'`, stamped with the organization) and a
 * PERSON's connection (`owner_type = 'user'`, whose `organization_id` is NULL in
 * the live database — verified 2026-09-19). Filtering on the organization alone
 * would drop every personal connection, and a console that shows an expert's
 * Google as missing while they are signed in through it is worse than useless.
 *
 * So this reads both halves explicitly and labels each row with which it is.
 * RLS already limits it to the person's own rows plus their organizations'.
 */
async function readConnections(organizationId: string, userId: string) {
  const { data, error } = await supabase
    .schema("users")
    .from("integration_connections")
    .select(
      "id,provider,owner_type,status,account_email,account_name,last_verified_at,last_error,organization_id,owner_user_id",
    )
    .or(`organization_id.eq.${organizationId},owner_user_id.eq.${userId}`)
    .is("deleted_at", null)
    .order("last_verified_at", { ascending: false, nullsFirst: false })
    .limit(CAP);
  if (error) throw error;
  return parseConnections(data ?? []);
}

async function readBlocks(organizationId: string) {
  const { data, error } = await supabase
    .schema("platform")
    .from("acquisition_block")
    .select(
      "id,input_ref,input_label,error_class,error_sentence,unblock_note,lawful_route,first_seen_at,last_seen_at,occurrence_count,status",
    )
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    // A resolved block is not a block. It stays in the ledger and leaves here.
    .neq("status", "resolved")
    .order("last_seen_at", { ascending: false })
    .limit(CAP);
  if (error) throw error;
  const items = data ?? [];
  const parsed = parseBlocks(items);
  if (items.length >= CAP) parsed.problems.push(capSentence("blocks", CAP));
  return parsed;
}

async function readHandoffs(organizationId: string) {
  const { data, error } = await supabase
    .schema("media")
    .from("capture_handoff")
    .select(
      "id,url,title,reason,what_to_do,attempt_count,status,created_at,updated_at",
    )
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    // Only the ones still waiting on a person. A captured hand-off is not a block.
    .in("status", ["waiting", "claimed", "failed"])
    .order("created_at", { ascending: false })
    .limit(CAP);
  if (error) throw error;
  const items = data ?? [];
  const parsed = parseHandoffs(items);
  if (items.length >= CAP) parsed.problems.push(capSentence("hand-offs", CAP));
  return parsed;
}

/**
 * Load the whole console for one workspace, optionally narrowed to one Rulebook.
 *
 * The five reads run together: they are independent registers and nothing on this
 * screen is derived from more than one of them, so serialising them would only
 * make the page slower.
 */
export async function loadConsole(
  organizationId: string,
  userId: string,
  rulebookId: string | null,
): Promise<ConsoleData> {
  const [libraries, rulebookSources, connections, blocks, handoffs] =
    await Promise.all([
      readLibraries(organizationId),
      readRulebookSources(organizationId, rulebookId),
      readConnections(organizationId, userId),
      readBlocks(organizationId),
      readHandoffs(organizationId),
    ]);

  // The Rulebook choices are built from the UNFILTERED source list, so choosing a
  // Rulebook never removes the other Rulebooks from the control that chose it.
  const choiceSource = rulebookId
    ? await readRulebookSources(organizationId, null)
    : rulebookSources;
  const rulebooks = await readRulebookChoices(choiceSource.rows);

  const have = sortHaveRows([
    // A Rulebook filter narrows what is KEPT on Rulebooks. It cannot narrow a
    // Library, which belongs to the workspace and not to any one Rulebook — so
    // when a Rulebook is chosen, the Library rows leave rather than stay and
    // pretend to be about it. The header says exactly this, out loud.
    ...(rulebookId ? [] : rollUpLibraries(libraries.rows, userId)),
    ...rollUpRulebookSources(rulebookSources.rows),
  ]);

  const blocked = [...blocks.rows, ...handoffs.rows].sort((a, b) =>
    a.since < b.since ? 1 : a.since > b.since ? -1 : 0,
  );

  return {
    have,
    connected: connections.rows,
    blocked,
    rulebooks,
    problems: [
      ...libraries.problems,
      ...rulebookSources.problems,
      ...connections.problems,
      ...blocks.problems,
      ...handoffs.problems,
    ],
  };
}
