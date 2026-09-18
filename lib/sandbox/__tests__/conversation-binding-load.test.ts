/**
 * The load-time contract for a conversation's compute binding.
 *
 * Arman, 2026-09-14: *"I just opened this chat, which was on a sandbox. The page
 * just loaded and it didn't instantly make sure to put me on the same sandbox in
 * the UI. Chats that go into a sandbox need to automatically default to it,
 * regardless of if they started in the sandbox or not."*
 *
 * The three rules that answers him, each pinned here against the REAL modules
 * the app uses (`conversationSandboxBindingFromRow` → the record → the shared
 * resolver in `active-binding.ts` → the shared view in `bound-target-view.ts`):
 *
 *   (a) a row that names a box wins over the user's shared default — even when
 *       the default points at a DIFFERENT box, and even when the row carries no
 *       metadata mirror at all (a bind written by aidream);
 *   (b) a row that names nothing falls back to the shared default (that is what
 *       the default is FOR — seeding a conversation that has never been bound);
 *   (c) a bind that happened server-side is picked up mid-session.
 *
 * The row fixtures are the real live shapes (2026-09-14):
 *   - 99d5b990… — bound with the full metadata mirror ("Common Docs", ec2)
 *   - bb458c1e… — bound by `persist_conversation_binding`, metadata EMPTY
 */

import type { RootState } from "@/lib/redux/store";
import { conversationSandboxBindingFromRow } from "@/lib/sandbox/conversation-binding-row";
import {
  getConversationSandboxBinding,
  getEffectiveSandboxRef,
} from "@/lib/sandbox/active-binding";
import { resolveBoundTargetView } from "@/lib/sandbox/bound-target-view";
import type { ComputeTarget } from "@/app/api/compute-targets/route";

const CONVERSATION_ID = "99d5b990-9b66-4035-b9b4-af0f18b95847";
const ROW_BOX = "9e51f9ba-9fec-486c-b35d-2de882779c26";
const DEFAULT_BOX = "9baac5fd-fc52-4541-9061-0dbd7a1f1e18";

/** The row as `get_cx_conversation_bundle` / the SSR read returns it. */
const ROW_WITH_MIRROR = {
  sandbox_instance_id: ROW_BOX,
  app_instance_id: null,
  metadata: {
    sandbox_override_name: "Common Docs",
    sandbox_override_tier: "ec2",
    sandbox_override_proxy_url:
      "https://sandbox-orchestrator.matrxserver.com/sandboxes/sbx-18796e7c90d6/proxy",
  },
};

/** Bound by the SERVER: the column is set and there is no mirror at all. */
const ROW_SERVER_BOUND = {
  sandbox_instance_id: "9aa2f6a6-7a27-43fb-ad0e-56e4e6222c78",
  app_instance_id: null,
  metadata: {},
};

const ROW_UNBOUND = {
  sandbox_instance_id: null,
  app_instance_id: null,
  metadata: {},
};

/**
 * A store shaped like the real one for exactly what these resolvers read. The
 * shared default deliberately points at a DIFFERENT box than the row.
 */
function stateWith(
  binding: ReturnType<typeof conversationSandboxBindingFromRow>,
): RootState {
  return {
    conversations: {
      byConversationId: {
        [CONVERSATION_ID]: {
          conversationId: CONVERSATION_ID,
          sourceFeature: "chat",
          isEphemeral: false,
          ...(binding ? { sandboxBinding: binding } : {}),
        },
      },
    },
    userPreferences: {
      coding: {
        activeAgentSandboxBySurface: {
          chat: {
            rowId: DEFAULT_BOX,
            proxyUrl: "https://example.invalid/sandboxes/sbx-default/proxy",
            tier: "ec2",
            name: "My usual box",
          },
        },
      },
    },
    chatIncognito: { active: false },
  } as unknown as RootState;
}

describe("a conversation's bound box on load", () => {
  it("(a) the ROW wins over the user's shared default", () => {
    const binding = conversationSandboxBindingFromRow(ROW_WITH_MIRROR);
    expect(binding).toEqual({
      rowId: ROW_BOX,
      proxyUrl:
        "https://sandbox-orchestrator.matrxserver.com/sandboxes/sbx-18796e7c90d6/proxy",
      tier: "ec2",
      kind: undefined,
      name: "Common Docs",
    });

    const state = stateWith(binding);
    expect(getConversationSandboxBinding(state, CONVERSATION_ID)?.rowId).toBe(
      ROW_BOX,
    );
    // What the UI renders from — must be the row's box, never the default.
    const effective = getEffectiveSandboxRef(state, CONVERSATION_ID);
    expect(effective?.rowId).toBe(ROW_BOX);
    expect(effective?.source).toBe("conversation");
  });

  it("(a2) a server-written bind with NO metadata mirror still wins", () => {
    const binding = conversationSandboxBindingFromRow(ROW_SERVER_BOUND);
    expect(binding?.rowId).toBe(ROW_SERVER_BOUND.sandbox_instance_id);
    // No mirror: no name, no tier, no proxy url — and it is still a binding.
    expect(binding?.name).toBeUndefined();
    expect(binding?.proxyUrl).toBe("");

    const effective = getEffectiveSandboxRef(
      stateWith(binding),
      CONVERSATION_ID,
    );
    expect(effective?.rowId).toBe(ROW_SERVER_BOUND.sandbox_instance_id);
    expect(effective?.source).toBe("conversation");
  });

  it("(b) a row that names NOTHING falls back to the shared default", () => {
    expect(conversationSandboxBindingFromRow(ROW_UNBOUND)).toBeNull();

    const state = stateWith(null);
    expect(getConversationSandboxBinding(state, CONVERSATION_ID)).toBeNull();
    const effective = getEffectiveSandboxRef(state, CONVERSATION_ID);
    expect(effective?.rowId).toBe(DEFAULT_BOX);
    expect(effective?.source).toBe("surface-seed");
  });

  it("(c) a bind that happened server-side replaces the previous binding", () => {
    // The tab loaded with no binding and the server bound a box mid-session.
    const before = getEffectiveSandboxRef(stateWith(null), CONVERSATION_ID);
    expect(before?.rowId).toBe(DEFAULT_BOX);

    const after = getEffectiveSandboxRef(
      stateWith(conversationSandboxBindingFromRow(ROW_SERVER_BOUND)),
      CONVERSATION_ID,
    );
    expect(after?.rowId).toBe(ROW_SERVER_BOUND.sandbox_instance_id);
  });

  it("a local PC row binds the PC, and is never mislabelled as a sandbox", () => {
    const binding = conversationSandboxBindingFromRow({
      sandbox_instance_id: null,
      app_instance_id: "7a1c0f22-0000-4000-8000-00000000beef",
      metadata: { sandbox_override_name: "Arman's Mac" },
    });
    expect(binding).toEqual({
      rowId: "7a1c0f22-0000-4000-8000-00000000beef",
      proxyUrl: "",
      tier: undefined,
      kind: "local-pc",
      name: "Arman's Mac",
    });
  });
});

describe("the control always names the box this chat is on", () => {
  const ref = { rowId: ROW_BOX, name: "Common Docs", kind: "ec2" as const };
  const liveTarget = {
    id: ROW_BOX,
    kind: "ec2",
    name: "Common Docs",
    status: "running",
    is_online: true,
  } as unknown as ComputeTarget;
  const sleepingTarget = {
    ...liveTarget,
    status: "stopped",
    is_online: false,
  } as ComputeTarget;

  it("names it while the liveness check is still out (first paint)", () => {
    const view = resolveBoundTargetView({
      ref,
      status: "verifying",
      targets: null,
    });
    expect(view).toMatchObject({
      rowId: ROW_BOX,
      name: "Common Docs",
      state: "checking",
    });
  });

  it("names it when the box is confirmed online", () => {
    const view = resolveBoundTargetView({
      ref,
      status: "verified",
      targets: [liveTarget],
    });
    expect(view).toMatchObject({ name: "Common Docs", state: "online" });
  });

  it("a stopped box reads ASLEEP — it exists and can be started, not 'gone'", () => {
    const view = resolveBoundTargetView({
      ref,
      status: "unavailable",
      targets: [sleepingTarget],
    });
    expect(view).toMatchObject({ name: "Common Docs", state: "asleep" });
  });

  it("a box that no longer exists reads GONE — and is still named", () => {
    const view = resolveBoundTargetView({
      ref,
      status: "unavailable",
      targets: [],
    });
    expect(view).toMatchObject({ name: "Common Docs", state: "gone" });
  });

  it("falls back to a readable label when nothing ever named the box", () => {
    const view = resolveBoundTargetView({
      ref: { rowId: ROW_BOX },
      status: "verifying",
      targets: null,
    });
    // ONE identity per box: this fallback now routes through the canonical
    // `sandboxDisplayName`, so the short id here is the same short id the
    // canvas pane and the `+` menu show for the same row (it used to be a
    // second, differently-sliced identity for the same box).
    expect(view?.name).toBe("Sandbox · 9e51f9");
  });

  it("an unbound conversation shows no bound box at all", () => {
    expect(
      resolveBoundTargetView({ ref: null, status: "none", targets: [] }),
    ).toBeNull();
  });
});
