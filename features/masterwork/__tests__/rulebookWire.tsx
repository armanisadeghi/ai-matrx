/**
 * THE SHARED RULEBOOK TEST WIRE — the fake transport, and only the transport.
 *
 * Two guards drive the REAL Rulebook lane scaffold, the REAL page components
 * and the REAL services across a Rulebook→Rulebook navigation in ONE mounted
 * app:
 *
 *   - `a-write-lands-on-the-rulebook-on-screen.test.tsx`
 *     the id a write CARRIES is the Rulebook on screen;
 *   - `a-rulebook-page-never-carries-the-previous-rulebooks-words.test.tsx`
 *     the words a page SHOWS are the Rulebook on screen's own.
 *
 * Both need the same thing from this file and nothing more: a supabase-js
 * shaped query builder that serves real row shapes and RECORDS which row id
 * each statement addressed, the knob ladder's values, and the fixtures. No
 * component, no service and no decision about a record id lives here — every
 * one of those stays real in the guards, or the guards prove nothing.
 *
 * This file is NOT a test (`jest.config.ts` matches only `*.test.ts(x)`), and
 * it holds no assertions on purpose: a helper that asserts is a guard nobody
 * runs.
 */
import type { RulebookRow } from "@/features/masterwork/types";

// Two Rulebooks with near-identical names — the cold walk's actual confusion.
export const RULEBOOK_A = "f1375ab5-1111-4111-8111-111111111111";
export const RULEBOOK_B = "a84d1c5e-2222-4222-8222-222222222222";
export const ORG_ID = "0e3f1c90-3333-4333-8333-333333333333";
export const USER_ID = "7c2b6d41-4444-4444-8444-444444444444";
export const CONVERSATION_A = "c0111111-5555-4555-8555-555555555555";
export const CONVERSATION_B = "c0222222-6666-4666-8666-666666666666";

/**
 * One interview per Rulebook, keyed off the Rulebook — because that is where
 * the real panel's conversation comes from too: `useAgentLauncher` mints it
 * INSIDE the lane's subtree, so the conversation and the Rulebook it belongs
 * to always come out of the same render.
 */
export const CONVERSATION_FOR: Record<string, string> = {
  [RULEBOOK_A]: CONVERSATION_A,
  [RULEBOOK_B]: CONVERSATION_B,
};

export interface Statement {
  schema: string;
  table: string;
  op: "select" | "update";
  filters: Array<{ column: string; value: unknown }>;
  payload?: Record<string, unknown>;
}

/** Every UPDATE the real service code sent, in order. */
export const updates: Statement[] = [];
/** Every association edge `linkInterviewConversation` asked for, in order. */
export const associationAdds: Array<{
  sourceId: string;
  targetId: string;
  role?: string;
}> = [];

export const rulebookRows = new Map<string, RulebookRow>();

export function filterValue(statement: Statement, column: string): unknown {
  const hit = statement.filters.find((f) => f.column === column);
  return hit ? hit.value : undefined;
}

/**
 * The `platform.approach` row the plan schedules against. Typed and complete in
 * the columns `fetchDistillationApproaches` selects. (A live row could not be
 * captured: that session's Supabase MCP connector refused the read — the shape
 * is taken from the select list in `features/masterwork/browse/approaches.ts`
 * and the posture map in `capture-plan/methods.ts`.)
 */
export const APPROACH_ROWS = [
  {
    id: "9a0b1c2d-7777-4777-8777-777777777777",
    key: "monologue",
    label: "Talk for five minutes",
    blurb: "Say one thing you did this week, out loud.",
    what_it_needs: "Five minutes and your voice.",
    cost_time_shape: "start now — rules within minutes",
    mandate_key: "masterwork.monologue_distiller",
    intake_query: { conduct: "1" },
    sort_order: 10,
    enabled: true,
    metadata: { availability: "available" },
  },
];

function resolve(statement: Statement): { data: unknown; error: null } {
  const { schema, table, op } = statement;
  if (schema === "platform" && table === "approach") {
    return { data: APPROACH_ROWS, error: null };
  }
  if (schema === "workflow" && table === "definition") {
    return { data: [], error: null };
  }
  if (schema === "chat" && table === "conversation") {
    // The interview title pass. No row → the real code returns without writing.
    return { data: null, error: null };
  }
  if (schema === "platform" && table === "rulebook") {
    const id = filterValue(statement, "id");
    const row = typeof id === "string" ? rulebookRows.get(id) : undefined;
    if (op === "select") return { data: row ?? null, error: null };
    updates.push(statement);
    if (!row) return { data: null, error: null };
    // The real compare-and-swap must still be honoured, or a conflict retry
    // would silently look like a success.
    if (filterValue(statement, "version") !== row.version) {
      return { data: null, error: null };
    }
    const next = {
      ...row,
      ...(statement.payload ?? {}),
      version: row.version + 1,
    } as RulebookRow;
    rulebookRows.set(next.id, next);
    return { data: next, error: null };
  }
  throw new Error(
    `The test wire was asked for ${schema}.${table}, which it does not serve. ` +
      "Serve it deliberately rather than letting it read as empty.",
  );
}

export class QueryBuilder implements PromiseLike<{ data: unknown; error: null }> {
  private statement: Statement;

  constructor(schema: string, table: string) {
    this.statement = { schema, table, op: "select", filters: [] };
  }

  select() {
    return this;
  }
  update(payload: Record<string, unknown>) {
    this.statement.op = "update";
    this.statement.payload = payload;
    return this;
  }
  eq(column: string, value: unknown) {
    this.statement.filters.push({ column, value });
    return this;
  }
  is(column: string, value: unknown) {
    this.statement.filters.push({ column, value });
    return this;
  }
  in(column: string, value: unknown) {
    this.statement.filters.push({ column, value });
    return this;
  }
  order() {
    return this;
  }
  maybeSingle() {
    return Promise.resolve(resolve(this.statement));
  }
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => resolve(this.statement))
      .then(onfulfilled, onrejected);
  }
}

/** The supabase-js surface the real services call, and nothing else. */
export const supabaseWire = {
  supabase: {
    schema: (schema: string) => ({
      from: (table: string) => new QueryBuilder(schema, table),
    }),
    from: (table: string) => new QueryBuilder("public", table),
  },
};

/** The `assoc_add` chokepoint, recorded. */
export const associationsWire = {
  associationsService: {
    add: (args: { sourceId: string; targetId: string; role?: string }) => {
      associationAdds.push({
        sourceId: args.sourceId,
        targetId: args.targetId,
        role: args.role,
      });
      return Promise.resolve({ ok: true, data: null });
    },
  },
};

export const KNOB_VALUES: Record<string, unknown> = {
  "masterwork.capture_plan.session_minutes": 15,
  "masterwork.capture_plan.sessions_per_day": 1,
  "masterwork.capture_plan.cadence": "daily",
  "masterwork.capture_plan.reminder_channel": "in_app",
  "masterwork.capture_plan.reminder_lead_minutes": 15,
  "masterwork.capture_plan.reminder_horizon_hours": 48,
  "masterwork.capture_plan.methods_allowed": "all",
  "masterwork.capture_plan.stop_rule": "either",
  "masterwork.capture_plan.flatten_window": 3,
  "masterwork.capture_plan.horizon_days": 14,
  "masterwork.capture_plan.target_rules": 40,
  "masterwork.capture_plan.voice_default_on": false,
};

/** The knob ladder's transport. An unseeded knob REFUSES rather than defaults. */
export const knobWire = {
  ensureEffectiveKnob: (
    _org: string,
    _user: string | null,
    key: string,
  ): Promise<unknown> => {
    if (!(key in KNOB_VALUES)) {
      return Promise.reject(new Error(`unseeded knob ${key}`));
    }
    return Promise.resolve(KNOB_VALUES[key]);
  },
};

export function rulebookRow(id: string, name: string): RulebookRow {
  return {
    assurance_level: null,
    created_at: "2026-09-16T20:00:00.000Z",
    created_by: USER_ID,
    custom_fields: {},
    deleted_at: null,
    description: `How I decide what to do about ${name}.`,
    id,
    industry_id: null,
    metadata: {},
    name,
    organization_id: ORG_ID,
    rules: [],
    sections: {},
    slug: name.toLowerCase().replace(/\W+/g, "-"),
    source: {},
    source_authority: null,
    source_rulebook_id: null,
    source_synced_at: null,
    source_version: null,
    status: "draft",
    updated_at: "2026-09-16T20:00:00.000Z",
    updated_by: null,
    version: 1,
    visibility: "personal",
  } satisfies RulebookRow;
}

/** jsdom ships no matchMedia; the shell's mobile hook calls it on first paint. */
export function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
