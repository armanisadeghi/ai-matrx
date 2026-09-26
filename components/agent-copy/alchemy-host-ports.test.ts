/**
 * The app's Alchemy host ports (Matrx Alchemy ALC-13/14), one test block per
 * port, each against the contract in `@ai-matrx/alchemy/ports`.
 *
 * Replaced: only what the ports CALL — the kind catalog read (network), the
 * diagnostics store's `captureError`, and the Redux store (a real-shaped state
 * object read through the real selectors). The port logic itself runs for real.
 */

const mockGetKindInputContract = jest.fn();
jest.mock("@/features/content-ir/registry/schema-source-kind-tables", () => ({
  getKindInputContractBySlug: (kind: string) => mockGetKindInputContract(kind),
}));

const mockCaptureError = jest.fn();
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: (input: unknown) => mockCaptureError(input),
}));

import type { AlchemyHostPorts } from "@ai-matrx/alchemy/ports";
import { kindValidator } from "@/features/content-ir/registry/kind-schema-source";
import {
  createAlchemyHostPorts,
  type AlchemyIdentityStore,
} from "./alchemy-host-ports";

/** The live `word_count_result` emitted_json_schema (read 2026-09-11). */
const WORD_COUNT_RESULT_SCHEMA = {
  type: "object",
  title: "WordCountOutput",
  required: ["characters", "characters_no_spaces", "words", "sentences", "paragraphs", "lines"],
  properties: {
    lines: { type: "integer", title: "Lines" },
    words: { type: "integer", title: "Words" },
    __kind: { type: "string", const: "word_count_result", default: "word_count_result" },
    sentences: { type: "integer", title: "Sentences" },
    characters: { type: "integer", title: "Characters" },
    paragraphs: { type: "integer", title: "Paragraphs" },
    characters_no_spaces: { type: "integer", title: "Characters No Spaces" },
  },
  additionalProperties: false,
};

/** A two-word proposal title, counted. */
const CONFORMING_VALUE = {
  __kind: "word_count_result",
  characters: 12,
  characters_no_spaces: 10,
  words: 2,
  sentences: 1,
  paragraphs: 1,
  lines: 1,
};

/** The slices the identity port reads, shaped like the real store's. */
type IdentityState = {
  userAuth: { id: string | null; isAdmin: boolean; adminLaneOpen?: boolean };
  appContext: { organization_id: string | null };
};

function fakeStore(initial: IdentityState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const store = {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    store: store as unknown as AlchemyIdentityStore,
    set(next: IdentityState) {
      state = next;
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}

const RECYCLING_OWNER = "8f14e45f-ceea-467a-9575-2d3b1c2f7a10";
const RECYCLING_ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const DENTAL_ORG = "c9f0f895-fb98-4b91-9d6c-7a1e2e0b3d44";

function ports(store = fakeStore({
  userAuth: { id: RECYCLING_OWNER, isAdmin: false },
  appContext: { organization_id: RECYCLING_ORG },
}).store): AlchemyHostPorts {
  return createAlchemyHostPorts({ store });
}

beforeEach(() => {
  mockGetKindInputContract.mockReset();
  mockCaptureError.mockReset();
  kindValidator.invalidate();
});

describe("kinds port (KindValidatorPort)", () => {
  const signal = new AbortController().signal;

  it("answers ok for a value that satisfies the kind", async () => {
    mockGetKindInputContract.mockResolvedValue({
      schema: null,
      emittedJsonSchema: WORD_COUNT_RESULT_SCHEMA,
      version: 7,
    });
    await expect(
      ports().kinds!.validate("word_count_result", CONFORMING_VALUE, signal),
    ).resolves.toEqual({ ok: true });
  });

  it("refuses a malformed value with a sentence naming the defect and a remedy — checked, so not unverifiable", async () => {
    mockGetKindInputContract.mockResolvedValue({
      schema: null,
      emittedJsonSchema: WORD_COUNT_RESULT_SCHEMA,
      version: 7,
    });
    const verdict = await ports().kinds!.validate(
      "word_count_result",
      { ...CONFORMING_VALUE, words: "two" },
      signal,
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.unverifiable).toBeUndefined();
    expect(verdict.sentence).toContain("word_count_result");
    expect(verdict.sentence).toContain("words");
    expect(verdict.remedy.length).toBeGreaterThan(0);
  });

  it("marks an unregistered kind unverifiable and names the reason — a skip is never a pass", async () => {
    mockGetKindInputContract.mockResolvedValue(null);
    const verdict = await ports().kinds!.validate(
      "proposal_outline",
      CONFORMING_VALUE,
      signal,
    );
    expect(verdict).toEqual({
      ok: false,
      unverifiable: true,
      sentence: expect.stringContaining("kind_not_registered"),
      remedy: expect.any(String),
    });
  });
});

describe("diagnostics port (DiagnosticsPort)", () => {
  it("captures a contract break into the app's error store under the alchemy source, keeping area and detail", () => {
    ports().diagnostics.capture(new Error("Write target \"counts\" is not declared"), {
      area: "write",
      detail: { surfaceName: "matrx-user/recycling-pickups", target: "counts" },
    });
    expect(mockCaptureError).toHaveBeenCalledTimes(1);
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "alchemy",
        message: '[alchemy:write] Write target "counts" is not declared',
        raw: {
          area: "write",
          detail: { surfaceName: "matrx-user/recycling-pickups", target: "counts" },
        },
      }),
    );
  });

  it("captures a non-Error value too, never dropping it", () => {
    ports().diagnostics.capture("menu layout missing", { area: "menu", detail: null });
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({ source: "alchemy", message: "[alchemy:menu] menu layout missing" }),
    );
  });
});

describe("identity port (IdentityPort)", () => {
  it("reports the signed-in person and their active organization", () => {
    const identity = ports().identity!;
    expect(identity.current()).toEqual({
      userId: RECYCLING_OWNER,
      organizationId: RECYCLING_ORG,
      isAuthenticated: true,
      isAdmin: false,
    });
  });

  it("reports admin power only inside the admin section — an admin on a user page reads like everyone else", () => {
    const onUserPage = fakeStore({
      userAuth: { id: RECYCLING_OWNER, isAdmin: true, adminLaneOpen: false },
      appContext: { organization_id: RECYCLING_ORG },
    });
    expect(ports(onUserPage.store).identity!.current()?.isAdmin).toBe(false);
    const inAdminSection = fakeStore({
      userAuth: { id: RECYCLING_OWNER, isAdmin: true, adminLaneOpen: true },
      appContext: { organization_id: RECYCLING_ORG },
    });
    expect(ports(inAdminSection.store).identity!.current()?.isAdmin).toBe(true);
  });

  it("answers null while nobody is signed in", () => {
    const { store } = fakeStore({
      userAuth: { id: null, isAdmin: false },
      appContext: { organization_id: null },
    });
    expect(ports(store).identity!.current()).toBeNull();
  });

  it("notifies on an organization switch only, and stops after unsubscribe", () => {
    const harness = fakeStore({
      userAuth: { id: RECYCLING_OWNER, isAdmin: false },
      appContext: { organization_id: RECYCLING_ORG },
    });
    const identity = ports(harness.store).identity!;
    const listener = jest.fn();
    const unsubscribe = identity.onChange(listener);

    // An unrelated store update: same identity, no notification.
    harness.set({
      userAuth: { id: RECYCLING_OWNER, isAdmin: false },
      appContext: { organization_id: RECYCLING_ORG },
    });
    expect(listener).not.toHaveBeenCalled();

    harness.set({
      userAuth: { id: RECYCLING_OWNER, isAdmin: false },
      appContext: { organization_id: DENTAL_ORG },
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(identity.current()?.organizationId).toBe(DENTAL_ORG);

    unsubscribe();
    expect(harness.listenerCount()).toBe(0);
  });
});

describe("absent ports", () => {
  it("leaves persistence unbound — per-person settings are absent, never stubbed", () => {
    expect(ports().persistence).toBeUndefined();
  });
});
