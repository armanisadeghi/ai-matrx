/**
 * @jest-environment jsdom
 *
 * A policy edit is optimistic and carries the version the person edited
 * (`expected_policy_version`). The server's answer replaces the row (version
 * bumped); a 409 — someone changed it first — reloads the roster instead of
 * overwriting; any other failure puts the old policy back.
 *
 * Use case: the creator sets the clinic interview's Adversary to sees: none.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const calls: { kind: string; args: unknown[] }[] = [];
let putResult: unknown = null;
let getCount = 0;

const ADVERSARY = {
  id: "edge-adversary",
  conversation_id: "conv-adversary",
  position: 4,
  participant: {
    __kind: "room_view_policy" as const,
    key: "adversary",
    label: "Adversary",
    policy: { sees: "everyone" as const },
    policy_version: 3,
  },
};
const GROUP = { anchor_type: "interview_session", anchor_id: "session-clinic", round: 9, participants: [ADVERSARY] };

jest.mock("../api", () => ({
  getGroupChatCall: (...args: unknown[]) => ({ kind: "get", args }),
  putParticipantPolicyCall: (...args: unknown[]) => ({ kind: "put", args }),
}));
// A store's dispatch is one stable function.
const mockDispatch = async (action: { kind: string; args: unknown[] }) => {
  calls.push(action);
  if (action.kind === "get") {
    getCount += 1;
    return { data: GROUP };
  }
  return putResult;
};
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => mockDispatch }));
const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

import { useGroupChat } from "../useGroupChat";

beforeEach(() => {
  calls.length = 0;
  getCount = 0;
  toastError.mockReset();
});

type Hook = ReturnType<typeof useGroupChat>;
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

async function ready(): Promise<{ current: Hook }> {
  const result = {} as { current: Hook };
  function Probe() {
    result.current = useGroupChat("interview_session", "session-clinic");
    return null;
  }
  const host = document.createElement("div");
  act(() => createRoot(host).render(<Probe />));
  await flush();
  expect(result.current.state.status).toBe("ready");
  return result;
}

function adversaryPolicy(result: { current: Hook }) {
  const state = result.current.state;
  return state.status === "ready" ? state.group.participants?.[0]?.participant : null;
}

it("sends the edited version and takes the server's bumped row", async () => {
  putResult = { data: { ...ADVERSARY, participant: { ...ADVERSARY.participant, policy: { sees: "none" }, policy_version: 4 } } };
  const result = await ready();
  await act(() => result.current.savePolicy(ADVERSARY, { sees: "none" }));
  const put = calls.find((c) => c.kind === "put")!;
  expect(put.args).toEqual([{ anchorType: "interview_session", anchorId: "session-clinic" }, "edge-adversary", { sees: "none" }, 3]);
  expect(adversaryPolicy(result)).toMatchObject({ policy: { sees: "none" }, policy_version: 4 });
});

it("a 409 reloads the roster and says so — the stale edit never lands", async () => {
  putResult = { error: { status: 409, message: "stale policy_version" } };
  const result = await ready();
  await act(() => result.current.savePolicy(ADVERSARY, { sees: "none" }));
  await flush();
  expect(getCount).toBe(2);
  expect(toastError).toHaveBeenCalledWith("Adversary: stale policy_version; reloaded");
  expect(adversaryPolicy(result)?.policy).toEqual({ sees: "everyone" });
});

it("any other failure puts the old policy back", async () => {
  putResult = { error: { status: 500, message: "server down" } };
  const result = await ready();
  await act(() => result.current.savePolicy(ADVERSARY, { sees: "none" }));
  expect(adversaryPolicy(result)?.policy).toEqual({ sees: "everyone" });
  expect(toastError).toHaveBeenCalledWith("Adversary: not saved. server down");
});
