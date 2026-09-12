/**
 * THE MERGE-ONLY REMOVAL CLASS — regression guard.
 *
 * Defect (found 2026-09-12): `setContextEntries` upserts every incoming key and
 * never deletes one, so `setContextEntries({ conversationId, entries: [] })` —
 * which the agent-app reset path used — cleared nothing. Resetting a
 * conversation in an agent app left the previous turn's context values in
 * place, and they leaked into the next conversation. The sibling instance was
 * the per-column model-override Clear chip, which "removed" a key by re-sending
 * the overrides map without it through the equally merge-only `setOverrides`.
 *
 * Part 1 pins the reducer contract against the REAL reducers (no stand-ins):
 * the merge-only actions stay merge-only (≈30 call sites depend on that), and
 * the real removal actions really remove.
 *
 * Part 2 is the class guard: no source file may emulate a removal or a reset
 * through one of those merge-only actions. It is what fails on today's bug and
 * on any future repeat of it.
 */

import fs from "node:fs";
import path from "node:path";
import { configureStore } from "@reduxjs/toolkit";

import instanceContextReducer, {
  setContextEntries,
  clearInstanceContext,
  removeContextEntry,
} from "../instance-context.slice";
import instanceModelOverridesReducer, {
  initInstanceOverrides,
  setOverrides,
  resetOverride,
} from "../../instance-model-overrides/instance-model-overrides.slice";

const CONVERSATION_ID = "conv-merge-only-class";

function makeStore() {
  return configureStore({
    reducer: {
      instanceContext: instanceContextReducer,
      instanceModelOverrides: instanceModelOverridesReducer,
    },
  });
}

function contextOf(store: ReturnType<typeof makeStore>) {
  return store.getState().instanceContext.byConversationId[CONVERSATION_ID] ?? {};
}

function overridesOf(store: ReturnType<typeof makeStore>) {
  return (
    store.getState().instanceModelOverrides.byConversationId[CONVERSATION_ID]
      ?.overrides ?? {}
  );
}

describe("instance context — reset really clears", () => {
  it("setContextEntries is merge-only: an empty payload clears NOTHING", () => {
    const store = makeStore();
    store.dispatch(
      setContextEntries({
        conversationId: CONVERSATION_ID,
        entries: [
          { key: "customer_name", value: "Acme" },
          { key: "ticket_id", value: "T-1" },
        ],
      }),
    );
    store.dispatch(
      setContextEntries({ conversationId: CONVERSATION_ID, entries: [] }),
    );

    // This is the defect, pinned: the empty array is a silent no-op. Callers
    // must never use it as a reset.
    expect(Object.keys(contextOf(store)).sort()).toEqual([
      "customer_name",
      "ticket_id",
    ]);
  });

  it("clearInstanceContext really empties the conversation's context", () => {
    const store = makeStore();
    store.dispatch(
      setContextEntries({
        conversationId: CONVERSATION_ID,
        entries: [
          { key: "customer_name", value: "Acme" },
          { key: "ticket_id", value: "T-1" },
        ],
      }),
    );
    store.dispatch(clearInstanceContext(CONVERSATION_ID));

    expect(contextOf(store)).toEqual({});
    expect(
      store.getState().instanceContext.surfaceKeysByConversationId[
        CONVERSATION_ID
      ],
    ).toEqual([]);
  });

  it("removeContextEntry drops exactly one key and keeps the merge behaviour", () => {
    const store = makeStore();
    store.dispatch(
      setContextEntries({
        conversationId: CONVERSATION_ID,
        entries: [
          { key: "customer_name", value: "Acme" },
          { key: "ticket_id", value: "T-1" },
        ],
      }),
    );
    store.dispatch(
      removeContextEntry({ conversationId: CONVERSATION_ID, key: "ticket_id" }),
    );
    store.dispatch(
      setContextEntries({
        conversationId: CONVERSATION_ID,
        entries: [{ key: "order_id", value: "O-9" }],
      }),
    );

    expect(Object.keys(contextOf(store)).sort()).toEqual([
      "customer_name",
      "order_id",
    ]);
  });
});

describe("instance model overrides — clearing an override really clears", () => {
  it("setOverrides is merge-only: re-sending the map without a key keeps it", () => {
    const store = makeStore();
    store.dispatch(initInstanceOverrides({ conversationId: CONVERSATION_ID }));
    store.dispatch(
      setOverrides({
        conversationId: CONVERSATION_ID,
        changes: { model: "gpt-5", temperature: 0.2 },
      }),
    );

    const withoutModel = { ...overridesOf(store) };
    delete withoutModel.model;
    store.dispatch(
      setOverrides({ conversationId: CONVERSATION_ID, changes: withoutModel }),
    );

    // The defect, pinned: the "removed" key survives.
    expect(overridesOf(store)).toHaveProperty("model", "gpt-5");
  });

  it("resetOverride really removes the key", () => {
    const store = makeStore();
    store.dispatch(initInstanceOverrides({ conversationId: CONVERSATION_ID }));
    store.dispatch(
      setOverrides({
        conversationId: CONVERSATION_ID,
        changes: { model: "gpt-5", temperature: 0.2 },
      }),
    );
    store.dispatch(
      resetOverride({ conversationId: CONVERSATION_ID, key: "model" }),
    );

    expect(overridesOf(store)).toEqual({ temperature: 0.2 });
  });
});

// ===========================================================================
// The class guard
// ===========================================================================

/** Actions that upsert and can never delete a key. */
const MERGE_ONLY_ACTIONS = [
  "setContextEntries",
  "setOverrides",
  "setUserVariableValues",
];

const SCAN_ROOTS = ["features", "components", "lib", "app", "hooks"];
const REPO_ROOT = path.resolve(__dirname, "../../../../../..");

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name === "node_modules" || item.name.startsWith(".")) continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(item.name) && !/\.(test|spec)\.tsx?$/.test(item.name)) {
        out.push(full);
      }
    }
  };
  for (const root of SCAN_ROOTS) walk(path.join(REPO_ROOT, root));
  return out;
}

describe("no caller emulates removal through a merge-only action", () => {
  const files = sourceFiles();

  it("scans a real, non-empty slice of the repo", () => {
    expect(files.length).toBeGreaterThan(1000);
  });

  it("never passes an empty payload to a merge-only action as a reset", () => {
    const offenders: string[] = [];
    const emptyPayload = new RegExp(
      `(${MERGE_ONLY_ACTIONS.join("|")})\\s*\\(\\s*\\{[^}]*?(entries:\\s*\\[\\s*\\]|changes:\\s*\\{\\s*\\}|values:\\s*\\{\\s*\\})`,
      "s",
    );
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      if (!MERGE_ONLY_ACTIONS.some((a) => source.includes(a))) continue;
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        if (!MERGE_ONLY_ACTIONS.some((a) => line.includes(`${a}(`))) return;
        const window = lines.slice(index, index + 6).join("\n");
        if (emptyPayload.test(window)) {
          offenders.push(`${path.relative(REPO_ROOT, file)}:${index + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("never deletes a key from a copied map and re-sends it through a merge-only action", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      if (!MERGE_ONLY_ACTIONS.some((a) => source.includes(a))) continue;
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        if (!/^\s*delete\s+[A-Za-z_$][\w$]*\s*[[.]/.test(line)) return;
        const window = lines.slice(index + 1, index + 9).join("\n");
        if (MERGE_ONLY_ACTIONS.some((a) => window.includes(`${a}(`))) {
          offenders.push(`${path.relative(REPO_ROOT, file)}:${index + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
