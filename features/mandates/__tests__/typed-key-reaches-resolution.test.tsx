/**
 * THE TYPED KEY IS THE KEY THAT RESOLVES — three real surfaces, end to end.
 *
 * V-L6a (2026-09-17) failed matrx-frontend's mandate-key adoption on a precise
 * point: 178 files imported `MANDATE_KEYS`, and it bought nothing, because every
 * carrier (`useMandate`, `useMandateSet`, `useMandateChain`, `launchMandate`,
 * `resolveMandate`, the ambient ladder's own lookup tables) was typed plain
 * `string`. Typing them is only half a fix: a type says nothing about which key
 * actually leaves the building. So this suite proves the other half — that the
 * key a surface names in its TYPED source is byte-for-byte the key that arrives
 * at the resolution door (`GET /mandates/{mandate_key}/resolution`).
 *
 * WHAT IS REAL HERE AND WHAT IS FAKED. Every key comes from the shipped module
 * the surface itself imports — no key is written down in this file, so a rename
 * in the vocabulary or in a ladder table changes what these tests assert. The
 * carriers are the real `resolveMandate` / `useMandate` / `useMandateChain` /
 * `useMandateSet`. Only three seams are doubled, and each is a real contract
 * this suite is not about: the HTTP transport (so the asked-for path is
 * observable), the active-organization kernel (D-R1: the org is part of the
 * question), and the Supabase client's identity read. Nothing fakes a mandate
 * row, a binding, or a key.
 *
 * The three surfaces are deliberately three different carrier shapes:
 *   1. the ambient assistant's page → module → system LADDER   (useMandateChain)
 *   2. the messaging pane's four-job SET                        (useMandateSet)
 *   3. a builtin's single job, and the DB-authored key a surface
 *      manifest discloses through the typed door                (resolveMandate)
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

import { ambientAssistantMandateChain } from "@/features/agents/components/ambient-assistant/ambientAssistantMandates";
import { MESSAGING_MANDATE_KEY_LIST } from "@/features/messaging/lib/messagingMandates";
import { mandateKeyForBuiltin } from "@/features/agents/constants/system-agent-registry";
import { MANDATE_WORKSPACE_GOAL_WRITER_MANDATE_KEY } from "@/features/surfaces/manifests/mandate-workspace.manifest";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const USER_ID = "cccccccc-dddd-4eee-8fff-000000000000";
const ORG = "aaaaaaaa-1111-4111-8111-111111111111";
const AGENT = "11111111-2222-4333-8444-555555555555";

/** Every `mandate_key` the resolution door was actually asked for, in order. */
let askedKeys: string[] = [];

jest.mock("@/lib/api/errors", () => ({
  BackendApiError: class extends Error {
    status: number;
    constructor(init: { status: number }) {
      super("backend");
      this.status = init.status;
    }
  },
}));

jest.mock("@/lib/python-client", () => ({
  getJson: async (path: string) => {
    // `/mandates/{mandate_key}/resolution` — the one door. Reading the key back
    // OUT of the path is the point: it is what the network would carry.
    const match = /\/mandates\/([^/]+)\/resolution/.exec(path);
    if (!match) throw new Error(`not the resolution door: ${path}`);
    const key = decodeURIComponent(match[1]);
    askedKeys.push(key);
    return {
      data: {
        mandate_key: key,
        holder_type: "agent",
        agent_id: AGENT,
        is_version: false,
        provenance: "system",
        config_overrides: null,
        contract: {},
        freshness: "fresh",
        input_kind: null,
        output_kind: null,
        provision_key: null,
        consumption_map: null,
        auto_run: null,
      },
      meta: { requestId: "r", status: 200, serverRequestId: null },
    };
  },
}));

jest.mock("@/lib/api/organization-admission", () => ({
  waitForOrganizationAdmission: async () => "ready",
  peekSelectedOrganizationId: () => ORG,
}));

/**
 * The identity read and the definition row. The row is minimal ON PURPOSE: this
 * suite is about which KEY travels, so the row simply echoes the key it was
 * asked for — if the resolver ever asked the table for a different key than it
 * asked the door for, the echo would expose it (asserted below).
 */
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: (table: string) => {
        let askedFor: string | null = null;
        const chain = {
          select: () => chain,
          eq: (column: string, value: string) => {
            if (column === "mandate_key") askedFor = value;
            return chain;
          },
          is: () => chain,
          order: () => chain,
          limit: async () => ({ data: [], error: null }),
          maybeSingle: async () => ({
            data:
              table === "definition" && askedFor
                ? {
                    id: "0f2a1f1e-1111-4c4c-9c9c-aaaaaaaaaaaa",
                    mandate_key: askedFor,
                    is_enabled: true,
                    default_holder_type: "agent",
                    default_holder_id: AGENT,
                    default_holder_version_id: null,
                    output_kind: null,
                    provision_key: null,
                    pins: null,
                    pinned_context: null,
                  }
                : null,
            error: null,
          }),
        };
        return chain;
      },
    }),
    // `resolveMandate` reads the caller from locally verified claims
    // (getClaimsUser → auth.getClaims), so the fake answers that door.
    auth: withClaims({
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    }),
  }),
}));

import { resolveMandate } from "../service";
import { useMandateChain } from "../useMandateChain";
import { useMandateSet } from "../useMandateSet";
import { withClaims } from "@/test-utils/supabase-auth";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  askedKeys = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount(element: React.ReactElement): Promise<void> {
  await act(async () => {
    root.render(element);
  });
  // The carriers resolve in an effect; let the settled promises flush.
  await act(async () => {
    await Promise.resolve();
  });
}

describe("surface 1 — the ambient assistant ladder asks for the keys its typed tables hold", () => {
  it("asks page, module and system, and answers with the page rung's own key", async () => {
    // The ladder is read from the shipped function, for a real route.
    const chain = ambientAssistantMandateChain("/education/flashcards");
    expect(chain.system).toBe(MANDATE_KEYS.ambient__page_guidance);
    expect(chain.module).toBe(MANDATE_KEYS.education__page_guidance);
    expect(chain.page).toBe(MANDATE_KEYS.education__flashcards_guidance);

    let seen: ReturnType<typeof useMandateChain> | null = null;
    function Probe() {
      seen = useMandateChain(chain);
      return null;
    }
    await mount(<Probe />);

    // Every rung the ladder names reached the door — and nothing else did.
    expect(new Set(askedKeys)).toEqual(
      new Set([chain.system, chain.module, chain.page]),
    );
    // And the rung the chain reports is the page rung's own typed key.
    expect(seen!.mandateKey).toBe(chain.page);
  });
});

describe("surface 2 — the messaging pane asks for the four keys its typed list holds", () => {
  it("resolves every capability under the key the list names", async () => {
    const keys = MESSAGING_MANDATE_KEY_LIST;
    expect(keys).toHaveLength(4);

    let seen: Record<string, unknown> = {};
    function Probe() {
      seen = useMandateSet(keys);
      return null;
    }
    await mount(<Probe />);

    expect(new Set(askedKeys)).toEqual(new Set(keys));
    // The set is keyed by the SAME key the surface asked with, so the pane
    // cannot read one job's verdict under another job's name.
    for (const key of keys) {
      expect(seen[key]).toMatchObject({ error: null });
    }
  });
});

describe("surface 3 — a builtin's job and a DB-authored key reach the door unchanged", () => {
  it("sends the builtin registry's key, not the builtin's own name", async () => {
    const key = mandateKeyForBuiltin("generic-code-editor");
    expect(key).not.toBe("generic-code-editor");
    await resolveMandate(key);
    expect(askedKeys).toEqual([key]);
  });

  it("sends the surface manifest's DB-authored key verbatim through the typed door", async () => {
    // `dbAuthoredMandateKey()` types a key the generated union cannot carry
    // (origin='user'); it must not alter the key on its way to the door.
    const key = MANDATE_WORKSPACE_GOAL_WRITER_MANDATE_KEY;
    expect(String(key)).toBe("mandate.goal_writer");
    await resolveMandate(key);
    expect(askedKeys).toEqual([key]);
  });
});
