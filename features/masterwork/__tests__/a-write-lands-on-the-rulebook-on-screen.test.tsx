/**
 * A WRITE ISSUED FROM A RULEBOOK PAGE CARRIES *THAT PAGE'S* RULEBOOK ID.
 *
 * The cold walk of 2026-09-16 reported that filling in the Capture Plan form on
 * one Rulebook created the session on a DIFFERENT, previously-opened Rulebook.
 * Run down against the live rows, that claim was disproven — the plan landed on
 * the correct Rulebook and the stray interview edge predated it by six minutes;
 * the walker had navigated onto the near-identically-named other Rulebook
 * without noticing. There is no bug. This is the guard that keeps it that way,
 * because the class it names is real and cheap to reintroduce: the id a write
 * carries coming from a module-level register, a "current rulebook" cache, a
 * recency read, or a stale closure instead of from the page the Expert is on.
 *
 * THE PRODUCTION CHANGE THAT MAKES THIS FAIL: any write path under
 * features/masterwork resolving its rulebook id from something other than the
 * id threaded down from the route — e.g. `mutatePlan` or
 * `associateInterviewWhenPersisted` preferring a module-level "last seen
 * rulebook" over its argument. (Proven by planting exactly that: see the
 * commit message / the task report.)
 *
 * THE SCENARIO IS THE COLD WALK'S OWN: two Rulebooks opened IN SEQUENCE in one
 * mounted app. Nothing here remounts between them — one `createRoot`, one
 * module instance — so every module-level register, memo and cache that the
 * real app carries across a route change is carried across here too. That is
 * precisely what the guard is for; a fresh mount per Rulebook would prove
 * nothing.
 *
 * WHAT IS REAL (never stubbed — this is the code that owns the id):
 *   - `RulebookLaneRoute`             the real lane scaffold, route id in
 *   - `features/masterwork/service`   the real `getRulebook` read
 *   - `CapturePlanPage`               the real page, real "Build my plan" click
 *   - `capture-plan/planner`          the real plan build
 *   - `capture-plan/service`          the real `mutatePlan` CAS write
 *   - `@ai-matrx/data` `guardedUpdate`the real compare-and-swap
 *   - `record/service`                the real `associateInterviewWhenPersisted`
 *                                     + `linkInterviewConversation`
 *   - the real Redux store and reducers
 *
 * WHAT IS STUBBED (the wire, and only the wire):
 *   - `@/utils/supabase/client`  a recording fake of the supabase-js query
 *     builder. Every read and every write still goes through the REAL service
 *     code; the fake only serves rows and RECORDS which row id each statement
 *     addressed. That recorded id is the whole assertion.
 *   - `associationsService`      the `assoc_add` RPC chokepoint, recorded.
 *   - `waitForConversationPersisted`, `ensureEffectiveKnob`, `callApi`,
 *     `getOrganization` — network the browser makes, none of it id-deciding.
 *   - the header portal / tap button / access gate / surface runtime / rule
 *     editor dialog / toast — presentational chrome.
 *
 * WHAT IS NOT MOUNTED, stated plainly: `ScoutInterviewPanel` itself. Its
 * association effect needs the whole agent-execution host (launcher, mandate
 * resolution, conversation resume, voice relay) which does not stand up in
 * jsdom. The lane body below issues the SAME call that panel's effect issues,
 * with the id taken from the same place the panel takes it — the lane's
 * `rulebook`. So the guard covers the route → lane → record-service → assoc
 * wire chain, and does NOT cover a defect planted inside ScoutInterviewPanel.
 */
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

import { TooltipProvider } from "@/components/ui/tooltip";
import { makeStore } from "@/lib/redux/store";
import type { RulebookRow } from "@/features/masterwork/types";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";
import { CapturePlanPage } from "@/features/masterwork/capture-plan/CapturePlanPage";
import { associateInterviewWhenPersisted } from "@/features/masterwork/record/service";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// Two Rulebooks with near-identical names — the cold walk's actual confusion.
const RULEBOOK_A = "f1375ab5-1111-4111-8111-111111111111";
const RULEBOOK_B = "a84d1c5e-2222-4222-8222-222222222222";
const ORG_ID = "0e3f1c90-3333-4333-8333-333333333333";
const USER_ID = "7c2b6d41-4444-4444-8444-444444444444";
const CONVERSATION_A = "c0111111-5555-4555-8555-555555555555";
const CONVERSATION_B = "c0222222-6666-4666-8666-666666666666";
/**
 * One interview per Rulebook, keyed off the Rulebook — because that is where
 * the real panel's conversation comes from too: `useAgentLauncher` mints it
 * INSIDE the lane's subtree, so the conversation and the Rulebook it belongs
 * to always come out of the same render.
 */
const CONVERSATION_FOR: Record<string, string> = {
  [RULEBOOK_A]: CONVERSATION_A,
  [RULEBOOK_B]: CONVERSATION_B,
};

// ── the recording wire ──────────────────────────────────────────────────────

interface Statement {
  schema: string;
  table: string;
  op: "select" | "update";
  filters: Array<{ column: string; value: unknown }>;
  payload?: Record<string, unknown>;
}

/** Every UPDATE the real service code sent, in order. */
const updates: Statement[] = [];
/** Every association edge `linkInterviewConversation` asked for, in order. */
const associationAdds: Array<{ sourceId: string; targetId: string; role?: string }> = [];

const rulebookRows = new Map<string, RulebookRow>();

function filterValue(statement: Statement, column: string): unknown {
  const hit = statement.filters.find((f) => f.column === column);
  return hit ? hit.value : undefined;
}

/**
 * The `platform.approach` row the plan schedules against. Typed and complete in
 * the columns `fetchDistillationApproaches` selects. (A live row could not be
 * captured: this session's Supabase MCP connector refused the read — the shape
 * is taken from the select list in `features/masterwork/browse/approaches.ts`
 * and the posture map in `capture-plan/methods.ts`.)
 */
const APPROACH_ROWS = [
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

class QueryBuilder implements PromiseLike<{ data: unknown; error: null }> {
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

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: (schema: string) => ({
      from: (table: string) => new QueryBuilder(schema, table),
    }),
    from: (table: string) => new QueryBuilder("public", table),
  },
}));

jest.mock("@/features/scopes/service/associationsService", () => ({
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
}));

jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversation-persistence",
  () => ({ waitForConversationPersisted: () => Promise.resolve(true) }),
);

const KNOB_VALUES: Record<string, unknown> = {
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

jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
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
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: () => Promise.resolve({ queued: 0, superseded: 0, problem: null }),
}));

jest.mock("@/features/organizations/service", () => ({
  getOrganization: (id: string) => Promise.resolve({ id, name: "The Desk" }),
}));

// ── presentational chrome, and nothing that decides an id ───────────────────
jest.mock("@/features/shell/components/header/RouteHeader", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@ai-matrx/tap-target/buttons", () => ({
  ChevronLeftTapButton: () => null,
}));
jest.mock("@/features/access-gate/components/AccessGate", () => ({
  AccessGate: () => <div>access gate</div>,
}));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useSurfaceClientTools: () => undefined,
  useSurfaceWriteHandlers: () => undefined,
}));
jest.mock("@/features/masterwork/components/detail/RuleEditorDialog", () => ({
  RuleEditorDialog: () => null,
}));
jest.mock("@/features/masterwork/capture-plan/SessionHost", () => ({
  OpenSessionButton: () => null,
  SessionHost: () => null,
  resolveSessionDoor: () => null,
}));
jest.mock("@/lib/toast", () => ({
  toast: {
    info: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// ── fixtures ────────────────────────────────────────────────────────────────

function rulebookRow(id: string, name: string): RulebookRow {
  return {
    assurance_level: null,
    created_at: "2026-09-16T20:00:00.000Z",
    created_by: USER_ID,
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
    visibility: "private",
  } satisfies RulebookRow;
}

let container: HTMLDivElement;
let root: Root;
let store: ReturnType<typeof makeStore>;

beforeAll(() => {
  // jsdom ships no matchMedia; the shell's mobile hook calls it on first paint.
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
  jest.useFakeTimers();
  store = makeStore();
  store.dispatch({ type: "userAuth/setUserAuth", payload: { id: USER_ID } });
  rulebookRows.set(
    RULEBOOK_A,
    rulebookRow(RULEBOOK_A, "Commercial teardown pricing — field notes"),
  );
  rulebookRows.set(
    RULEBOOK_B,
    rulebookRow(RULEBOOK_B, "Commercial teardown pricing — field guide"),
  );
});

afterAll(() => {
  jest.useRealTimers();
});

/**
 * ONE mounted app per scenario, and the SAME module instance across both — the
 * brief's point. Module-level state (the association de-dupe register, the
 * recorded statements, the row store) deliberately survives from the first
 * scenario into the second; only the DOM root is fresh, so a scenario starts
 * from a real first navigation rather than from whatever the previous one left
 * on screen.
 */
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/**
 * Open a Rulebook's Capture Plan lane THE WAY THE ROUTE DOES — the route's
 * `params.id` in, nothing else. Same root every time: this is a navigation,
 * not a fresh app.
 */
async function openPlanLane(rulebookId: string): Promise<void> {
  await act(async () => {
    root.render(
      <Provider store={store}>
        {/* The app shell provides this; the lane is rendered inside it. */}
        <TooltipProvider>
        <RulebookLaneRoute
          rulebookId={rulebookId}
          lane="plan"
          title="Your capture plan"
          body="scroll"
        >
          {({ rulebook, canEdit, setRulebook, reload }) => (
            <CapturePlanPage
              rulebook={rulebook}
              canEdit={canEdit}
              setRulebook={setRulebook}
              reload={reload}
            />
          )}
        </RulebookLaneRoute>
        </TooltipProvider>
      </Provider>,
    );
  });
  await settle();
}

/**
 * Open the interview lane and let it do what `ScoutInterviewPanel`'s effect
 * does once the first turn starts: hand the association to the module-level
 * job, with the id taken from the lane's own Rulebook.
 */
function InterviewLaneBody({
  rulebookId,
  rulebookName,
  conversationId,
}: {
  rulebookId: string;
  rulebookName: string;
  conversationId: string;
}) {
  useEffect(() => {
    associateInterviewWhenPersisted({
      rulebookId,
      conversationId,
      rulebookName,
      turnStarted: true,
    });
  }, [rulebookId, rulebookName, conversationId]);
  return <div>interview lane</div>;
}

async function openInterviewLane(rulebookId: string): Promise<void> {
  await act(async () => {
    root.render(
      <Provider store={store}>
        {/* The app shell provides this; the lane is rendered inside it. */}
        <TooltipProvider>
        <RulebookLaneRoute
          rulebookId={rulebookId}
          lane="interview"
          title="Interview"
          body="fill"
          requireOwner
        >
          {({ rulebook }) => (
            <InterviewLaneBody
              rulebookId={rulebook.id}
              rulebookName={rulebook.name}
              conversationId={CONVERSATION_FOR[rulebook.id]}
            />
          )}
        </RulebookLaneRoute>
        </TooltipProvider>
      </Provider>,
    );
  });
  await settle();
}

/**
 * Let the lane finish opening. `useAdoptRecordOrganization` gives a real
 * session restore a bounded head start before it adopts the record's own
 * organization, so the clock has to move; the promise flushes let the two
 * Supabase reads, the knob ladder and the plan write settle.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

function clickBuildMyPlan(): void {
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Build my plan",
  );
  if (!button) {
    throw new Error(
      `"Build my plan" is not on screen — the lane rendered: ${container.textContent?.slice(0, 400)}`,
    );
  }
  if (button.disabled) throw new Error('"Build my plan" is disabled.');
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Which Rulebook row an UPDATE addressed. */
function updatedIds(): unknown[] {
  return updates.map((u) => filterValue(u, "id"));
}

// ── the guard ───────────────────────────────────────────────────────────────

it("writes the capture plan to the Rulebook on screen, then to the NEXT one — never back to the first", async () => {
  await openPlanLane(RULEBOOK_A);
  clickBuildMyPlan();
  await settle();

  expect(updatedIds()).toEqual([RULEBOOK_A]);
  // The plan is really on A's row, and B's row is untouched.
  expect(
    (rulebookRows.get(RULEBOOK_A)!.metadata as { capture_plan?: { plan?: unknown } })
      .capture_plan?.plan,
  ).toBeTruthy();
  expect(rulebookRows.get(RULEBOOK_B)!.metadata).toEqual({});

  // 🚨 THE COLD WALK'S MOVE: the same mounted app, now showing the other
  // Rulebook with the near-identical name.
  await openPlanLane(RULEBOOK_B);
  clickBuildMyPlan();
  await settle();

  expect(updatedIds()).toEqual([RULEBOOK_A, RULEBOOK_B]);
  expect(
    (rulebookRows.get(RULEBOOK_B)!.metadata as { capture_plan?: { plan?: unknown } })
      .capture_plan?.plan,
  ).toBeTruthy();
  // Two rows, two DIFFERENT plans — the second write minted its own rather
  // than the first one's landing twice.
  const planA = (
    rulebookRows.get(RULEBOOK_A)!.metadata as {
      capture_plan: { plan: { id: string } };
    }
  ).capture_plan.plan;
  const planB = (
    rulebookRows.get(RULEBOOK_B)!.metadata as {
      capture_plan: { plan: { id: string } };
    }
  ).capture_plan.plan;
  expect(planB.id).not.toBe(planA.id);
  // And A's row was written exactly once: version moved by one, not two.
  expect(rulebookRows.get(RULEBOOK_A)!.version).toBe(2);
  expect(rulebookRows.get(RULEBOOK_B)!.version).toBe(2);
});

it("associates an interview with the Rulebook on screen, then with the NEXT one — never back to the first", async () => {
  await openInterviewLane(RULEBOOK_A);
  await settle();

  expect(associationAdds).toEqual([
    { sourceId: CONVERSATION_A, targetId: RULEBOOK_A, role: "interview" },
  ]);

  // 🚨 Same mounted app, same module instance, second Rulebook. The
  // module-level de-dupe register in `associateInterviewWhenPersisted` has
  // already seen one interview by now — that is the point.
  await openInterviewLane(RULEBOOK_B);
  await settle();

  expect(associationAdds).toEqual([
    { sourceId: CONVERSATION_A, targetId: RULEBOOK_A, role: "interview" },
    { sourceId: CONVERSATION_B, targetId: RULEBOOK_B, role: "interview" },
  ]);
});
