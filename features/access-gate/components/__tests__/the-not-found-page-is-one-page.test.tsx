/**
 * THE NOT-FOUND PAGE IS ONE PAGE (lane V24-TAILS, chair ruling 2026-09-25).
 *
 * A stranger opening an unshared table and anyone opening a random id get the same resolver
 * answer (`exists: false`, see aStrangerIsToldWhatAMissingIdIsTold.test.ts); this is the screen
 * that answer draws: "We couldn't find this record. If someone shared a link with you, you can ask
 * for access." and ONE "Ask for access". Pressing it calls `access_request_blind` and says "If it
 * exists, its owner has been asked." — never an owner, never an organization.
 *
 * RED on the prior AccessDenied: the missing page said "The link may be wrong …" and offered no ask.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const rpc = jest.fn(async (_name: string, _args: Record<string, unknown>) => ({
  data: { asked: true, says: "If it exists, its owner has been asked." },
  error: null,
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ rpc }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("@/hooks/auth/useLoginHref", () => ({ useLoginHref: () => "/login" }));
jest.mock("@/features/scopes/registry/entityRegistry", () => ({ tryGetEntityInfo: () => null }));
// The denied branch's panel pulls the whole app (agents, redux); the missing page never draws it.
jest.mock("@/features/access-gate/components/RequestAccessPanel", () => ({ RequestAccessPanel: () => null }));
jest.mock("@/features/emergency-access/components/EmergencyDoorAffordance", () => ({
  EmergencyDoorAffordance: () => null,
}));

import { AccessDeniedView } from "../AccessDenied";
import type { AccessDeniedContext } from "../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MISSING: AccessDeniedContext = {
  status: "missing",
  disclosure: "none",
  level: "none",
  isOwner: false,
  entity: { token: "record", label: "Record", title: null },
  owner: null,
  organization: null,
  ancestor: null,
  request: null,
  canRequest: false,
};

async function draw(id: string) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<AccessDeniedView context={MISSING} id={id} onChanged={() => {}} fallbackHref="/data-v2" fallbackLabel="Back to your tables" />);
  });
  return { host, root };
}

describe("the not-found page is one page", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    rpc.mockClear();
  });

  it("says the ruling's sentence and offers one Ask for access", async () => {
    const { host } = await draw("1aaba65d-68de-457e-8a0c-0f2731161d13");
    expect(host.textContent).toContain("We couldn't find this record");
    expect(host.textContent).toContain("If someone shared a link with you, you can ask for access.");
    const asks = Array.from(host.querySelectorAll("button")).filter((b) => b.textContent?.includes("Ask for access"));
    expect(asks).toHaveLength(1);
    expect(host.textContent).not.toMatch(/Owner|Organization|belongs to/);
  });

  it("the real id and the random id draw the same page, apart from nothing", async () => {
    const a = await draw("1aaba65d-68de-457e-8a0c-0f2731161d13");
    const b = await draw("5b0e3c1a-9d2f-4c11-8f00-0c0ffee00001");
    expect(a.host.innerHTML).toBe(b.host.innerHTML);
  });

  it("the ask goes through the blind door and says the one sentence", async () => {
    const { host } = await draw("5b0e3c1a-9d2f-4c11-8f00-0c0ffee00001");
    const ask = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Ask for access"))!;
    await act(async () => {
      ask.click();
    });
    expect(rpc).toHaveBeenCalledWith("access_request_blind", expect.objectContaining({ p_type: "record", p_id: "5b0e3c1a-9d2f-4c11-8f00-0c0ffee00001" }));
    expect(host.textContent).toContain("If it exists, its owner has been asked.");
  });
});
