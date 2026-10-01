/**
 * THE PERSON'S RULES SURVIVE TWO TABS, AND SAVE WITH NO ORGANIZATION CHOSEN.
 *
 * Use case: a person writing meeting notes keeps the notes page open in two
 * tabs. In tab A they switch "Editor mode" off for the agent; in tab B (opened
 * earlier, so its copy of the saved rules predates A's change) they set
 * "Cursor offset" to never inline.
 *
 * Breaks this catches:
 *   - F4: a write that upserts the WHOLE row from the writing tab's copy — tab
 *     B's save erased tab A's rule, and A's next send silently reloaded
 *     without it;
 *   - F4: a send that builds its request from the tab's stale copy instead of
 *     re-reading the saved rules first;
 *   - F6: a first save with no organization selected that throws and reverts
 *     with a toast, while a send in the same session would ask the person.
 *
 * The SUT is the real rules thunks + the real user-state service + the real
 * `mergeJsonColumn` + the real organization gate. Only the database is a
 * double: an in-memory `users.user_surface_state` with a real version CAS.
 */

import { configureStore } from "@reduxjs/toolkit";

const PERSON_ID = "6b1f2c1e-4d0a-4c5e-9a57-2f3d8e9b1c44";
const WORKSPACE_ID = "3c9a7e52-81b4-4f1d-a6c2-5e0d9b7f2a18";
const NOTES = "matrx-user/notes";

type Row = {
  id: string;
  user_id: string;
  organization_id: string;
  feature: string;
  surface_key: string;
  state: Record<string, unknown>;
  version: number;
  deleted_at: string | null;
};

const db: { rows: Row[]; nextId: number } = { rows: [], nextId: 1 };

/** A minimal PostgREST builder over `db.rows` — filters, CAS update, insert, upsert. */
function table() {
  const filters: Array<[string, unknown]> = [];
  let op: { kind: "select" } | { kind: "update"; patch: Partial<Row> } | { kind: "insert"; row: Partial<Row> } | { kind: "upsert"; row: Partial<Row> } = { kind: "select" };
  const matching = () =>
    db.rows.filter((r) => filters.every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v));
  const run = (): { data: Row[]; error: { code?: string; message: string } | null } => {
    if (op.kind === "select") return { data: matching().map((r) => structuredClone(r)), error: null };
    if (op.kind === "update") {
      const hit = matching();
      for (const r of hit) Object.assign(r, op.patch);
      return { data: hit.map((r) => structuredClone(r)), error: null };
    }
    const row = op.row;
    const existing = db.rows.find(
      (r) => r.user_id === row.user_id && r.feature === row.feature && r.surface_key === row.surface_key,
    );
    if (existing && op.kind === "insert") return { data: [], error: { code: "23505", message: "duplicate key" } };
    if (existing) {
      Object.assign(existing, row, { version: existing.version + 1 });
      return { data: [structuredClone(existing)], error: null };
    }
    const created: Row = {
      id: `row-${db.nextId++}`,
      version: 1,
      deleted_at: null,
      state: {},
      ...(row as Row),
    };
    db.rows.push(created);
    return { data: [structuredClone(created)], error: null };
  };
  const builder = {
    select: () => builder,
    eq: (k: string, v: unknown) => {
      filters.push([k, v]);
      return builder;
    },
    is: (k: string, v: unknown) => {
      filters.push([k, v]);
      return builder;
    },
    update: (patch: Partial<Row>) => {
      op = { kind: "update", patch };
      return builder;
    },
    insert: (row: Partial<Row>) => {
      op = { kind: "insert", row };
      return builder;
    },
    upsert: (row: Partial<Row>) => {
      op = { kind: "upsert", row };
      return builder;
    },
    maybeSingle: async () => {
      const { data, error } = run();
      return { data: data[0] ?? null, error };
    },
    single: async () => {
      const { data, error } = run();
      return { data: data[0] ?? null, error };
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: () => table() }) },
}));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: () => PERSON_ID }));
const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), warning: jest.fn(), success: jest.fn() },
}));

import { surfaceUserStateReducer } from "@/features/surfaces/redux/userStateSlice";
import {
  registerOrganizationPicker,
  settleOrganizationSelection,
} from "@/lib/organization/organization-gate";
import {
  ensureContextRulesReady,
  reloadContextRules,
  saveContextRule,
  selectSavedContextRuleRows,
} from "../context-rules.thunks";
import type { RootState } from "@/lib/redux/store";

function openTab() {
  return configureStore({ reducer: { surfaceUserState: surfaceUserStateReducer } });
}
type Tab = ReturnType<typeof openTab>;
const rulesIn = (tab: Tab) => selectSavedContextRuleRows(tab.getState() as unknown as RootState);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- thunk dispatch on a narrow test store
const run = (tab: Tab, thunk: unknown) => (tab.dispatch as any)(thunk) as Promise<void>;

function seedRow(state: Record<string, unknown>) {
  db.rows.push({
    id: `row-${db.nextId++}`,
    user_id: PERSON_ID,
    organization_id: WORKSPACE_ID,
    feature: "context_rules",
    surface_key: NOTES,
    state,
    version: 4,
    deleted_at: null,
  });
}

beforeEach(() => {
  db.rows = [];
  toastError.mockClear();
  registerOrganizationPicker(null);
});

describe("two tabs changing different values", () => {
  it("tab B's change never erases tab A's rule", async () => {
    seedRow({ note_title: { max_inline_chars: 400 } });
    const tabA = openTab();
    const tabB = openTab();
    await run(tabA, reloadContextRules());
    await run(tabB, reloadContextRules());

    await run(tabA, saveContextRule({ surfaceKey: NOTES, key: "editor_mode", rule: { include: false } }));
    // Tab B still holds the copy it loaded before A's change.
    expect(rulesIn(tabB)[NOTES]).toEqual({ note_title: { max_inline_chars: 400 } });
    await run(tabB, saveContextRule({ surfaceKey: NOTES, key: "cursor_offset", rule: { max_inline_chars: 0 } }));

    expect(db.rows[0].state).toEqual({
      note_title: { max_inline_chars: 400 },
      editor_mode: { include: false },
      cursor_offset: { max_inline_chars: 0 },
    });
  });

  it("a send re-reads the saved rules first, so tab A's request carries tab B's rule", async () => {
    seedRow({});
    const tabA = openTab();
    const tabB = openTab();
    await run(tabA, reloadContextRules());
    await run(tabB, reloadContextRules());
    await run(tabB, saveContextRule({ surfaceKey: NOTES, key: "cursor_offset", rule: { max_inline_chars: 0 } }));
    expect(rulesIn(tabA)[NOTES]).toEqual({});

    await run(tabA, ensureContextRulesReady());
    expect(rulesIn(tabA)[NOTES]).toEqual({ cursor_offset: { max_inline_chars: 0 } });
  });
});

describe("a first rule with no organization selected", () => {
  it("asks for the organization, then saves — no error, no revert", async () => {
    registerOrganizationPicker(() => settleOrganizationSelection(WORKSPACE_ID));
    const tab = openTab();
    await run(tab, reloadContextRules());

    await run(tab, saveContextRule({ surfaceKey: NOTES, key: "editor_mode", rule: { include: false } }));

    expect(toastError).not.toHaveBeenCalled();
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ organization_id: WORKSPACE_ID, state: { editor_mode: { include: false } } });
    expect(rulesIn(tab)[NOTES]).toEqual({ editor_mode: { include: false } });
  });

  it("closing the picker saves nothing and shows what is saved, without an error", async () => {
    registerOrganizationPicker(() => settleOrganizationSelection(null));
    const tab = openTab();
    await run(tab, reloadContextRules());

    await run(tab, saveContextRule({ surfaceKey: NOTES, key: "editor_mode", rule: { include: false } }));

    expect(toastError).not.toHaveBeenCalled();
    expect(db.rows).toHaveLength(0);
    expect(rulesIn(tab)[NOTES]).toBeUndefined();
  });
});
