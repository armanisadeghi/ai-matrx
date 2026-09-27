/**
 * 🚨 A WRITE THE PERSON PRESSED ASKS FOR A WORKSPACE (2026-09-26).
 *
 * MEASURED: with no workspace selected, Duplicate conversation (and every other
 * write through callApi) answered "Select an organization before sending this
 * request." — a refusal with no remedy. callApi had been made non-interactive
 * (4821555e98) because background calls reach it too; reads have since stopped
 * needing an organization at all, and a deliberate act (click/tap, Enter/Space
 * on a control, a modifier shortcut — never plain typing) tells a pressed write
 * from a background one.
 *
 * WHAT THIS PINS, for a write with nothing selected:
 *   1. the person just acted → the ONE picker opens, the call waits, and it is
 *      SENT with the chosen organization;
 *   2. the person dismisses the picker → nothing is sent, and the result is the
 *      quiet "organization_selection_cancelled" (never a refusal toast);
 *   3. no recent DELIBERATE act (a background write — including typing
 *      followed by a debounced autosave) → the fail-closed refusal, NO dialog;
 *   4. a read never asks; `interactiveOrganization: false` opts a write out.
 */

import { callApi } from "../call-api";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  __resetDeliberateActsForTests,
  ensureOrganizationForWrite,
  registerOrganizationPicker,
  settleOrganizationSelection,
} from "@/lib/organization/organization-gate";
import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import userAuthReducer, { setAuthReady } from "@/lib/redux/slices/userAuthSlice";
import userProfileReducer from "@/lib/redux/slices/userProfileSlice";
import type { RootState } from "@/lib/redux/store";

const CHOSEN = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

function noOrganizationState(): RootState {
  return {
    apiConfig: apiConfigReducer(undefined, { type: "test/init" }),
    appContext: { ...appContextReducer(undefined, { type: "test/init" }), organization_id: null },
    userAuth: userAuthReducer(userAuthReducer(undefined, { type: "test/init" }), setAuthReady(true)),
    userProfile: userProfileReducer(undefined, { type: "test/init" }),
  } as unknown as RootState;
}

/** A click / tap — a deliberate act. */
function click() {
  const button = document.createElement("button");
  document.body.appendChild(button);
  button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  button.remove();
}

/** Typing into a field — never a deliberate act, however recent. */
function type(text: string) {
  const input = document.createElement("textarea");
  document.body.appendChild(input);
  for (const key of text) input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  input.remove();
}

function keyOn(el: Element, init: KeyboardEventInit) {
  document.body.appendChild(el);
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
  el.remove();
}

const okResponse = () =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    json: async () => ({ conversation_id: "copy-1" }),
  }) as Response;

function write(extra: Record<string, unknown> = {}) {
  return callApi({
    path: "/cx/conversations/{conversation_id}/fork",
    method: "POST",
    pathParams: { conversation_id: "conv-1" },
    body: { title: "Copy" },
    stream: false,
    _testOverrides: { forceBaseUrl: "https://server.test" },
    ...extra,
  } as Parameters<typeof callApi>[0])(jest.fn(), noOrganizationState, undefined);
}

describe("a write with no workspace selected", () => {
  const originalFetch = global.fetch;
  let opened = 0;
  let answer: string | null = CHOSEN;

  beforeEach(() => {
    opened = 0;
    answer = CHOSEN;
    registerOrganizationPicker(() => {
      opened += 1;
      queueMicrotask(() => settleOrganizationSelection(answer));
    });
  });
  afterEach(() => {
    registerOrganizationPicker(null);
    global.fetch = originalFetch;
    __resetDeliberateActsForTests();
  });

  it("the person just pressed it: asks once, waits, and sends with the chosen workspace", async () => {
    click();
    const fetchMock = jest.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock;
    const result = await write();
    expect(opened).toBe(1);
    expect(result.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Organization-Id"]).toBe(CHOSEN);
  });

  it("dismissing the picker sends nothing and says nothing", async () => {
    click();
    answer = null;
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const result = await write();
    expect(opened).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.error).toMatchObject({ code: "organization_selection_cancelled", message: "" });
  });

  it("after a dismissal, a follow-up write from the same act (a retry) does not ask again", async () => {
    click();
    answer = null;
    global.fetch = jest.fn();
    await write();
    const retry = await write();
    expect(opened).toBe(1);
    expect(retry.error).toMatchObject({ code: "organization_context_required" });
  });

  it("a background write (no deliberate act) keeps the refusal and never opens a dialog", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const result = await write();
    expect(opened).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.error).toMatchObject({ code: "organization_context_required" });
  });

  it("an explicit opt-out keeps a write non-interactive even right after a click", async () => {
    click();
    global.fetch = jest.fn();
    const result = await write({ interactiveOrganization: false });
    expect(opened).toBe(0);
    expect(result.error).toMatchObject({ code: "organization_context_required" });
  });

  it("typing, then a debounced autosave, never opens the picker", async () => {
    // The shape the chair named: keystrokes in a field, then a timer's write.
    type("Kiln firing notes for cone 6");
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const result = await write();
    expect(opened).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.error).toMatchObject({ code: "organization_context_required" });
  });

  it("clicking INTO a field and typing, then the autosave, never opens the picker", async () => {
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    field.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    for (const key of "Glaze notes") field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    field.remove();
    global.fetch = jest.fn();
    const result = await write();
    expect(opened).toBe(0);
    expect(result.error).toMatchObject({ code: "organization_context_required" });
  });

  it("pasting (Cmd/Ctrl+V) into a field, then a debounced write, never opens the picker", async () => {
    keyOn(document.createElement("textarea"), { key: "v", metaKey: true });
    keyOn(document.createElement("textarea"), { key: "v", ctrlKey: true });
    global.fetch = jest.fn();
    const result = await write();
    expect(opened).toBe(0);
    expect(result.error).toMatchObject({ code: "organization_context_required" });
  });

  it("Enter on a focused button and a Cmd/Ctrl shortcut count as deliberate; Enter in a text field does not", async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse());
    const field = document.createElement("input");
    keyOn(field, { key: "Enter" });
    await write();
    expect(opened).toBe(0);

    keyOn(document.createElement("button"), { key: "Enter" });
    await write();
    expect(opened).toBe(1);

    __resetDeliberateActsForTests();
    keyOn(document.createElement("div"), { key: "s", metaKey: true });
    await write();
    expect(opened).toBe(2);
  });

  it("a read never asks", async () => {
    click();
    global.fetch = jest.fn().mockResolvedValue(okResponse());
    const result = await callApi({
      path: "/health",
      method: "GET",
      _testOverrides: { forceBaseUrl: "https://server.test" },
    })(jest.fn(), noOrganizationState, undefined);
    expect(opened).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("the direct-to-DB funnel and the Alchemy destinations ask through the SAME write helper", async () => {
    // The helper itself: typing never asks; a click asks and returns the pick.
    type("draft");
    await expect(ensureOrganizationForWrite()).rejects.toMatchObject({ code: "organization_context_required" });
    expect(opened).toBe(0);
    click();
    await expect(ensureOrganizationForWrite()).resolves.toBe(CHOSEN);
    expect(opened).toBe(1);

    const root = join(__dirname, "..", "..", "..");
    const ensureOrgId = readFileSync(join(root, "lib/organizations/ensureOrgId.ts"), "utf8");
    expect(ensureOrgId).toContain("ensureOrganizationForWrite()");
    expect(ensureOrgId).not.toMatch(/return ensureOrganizationContext\(\)/);
    const portal = readFileSync(join(root, "components/agent-copy/AlchemySessionPortal.tsx"), "utf8");
    expect(portal).toContain("await ensureOrganizationForWrite()");
  });
});
