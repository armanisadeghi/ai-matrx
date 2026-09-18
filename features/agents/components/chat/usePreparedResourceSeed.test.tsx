import { useState } from "react";
import { renderHook } from "@/test-utils/renderHook";
import { usePreparedResourceSeed, type PreparedResourceIdentity } from "./usePreparedResourceSeed";
import type { Resource } from "@/features/agents/resources/types";

const identity = { userId: "test-user", organizationId: "test-org" };
const resources: Resource[] = [{ type: "text", data: { id: "captured", label: "Edited note", text: "Exact edited bytes\n**keep this**" } }];
type SeedProps = { ready: boolean; currentIdentity: PreparedResourceIdentity; expectedIdentity: PreparedResourceIdentity | null };
async function mountSeed(initial: Partial<SeedProps> = {}) {
  const attach = jest.fn(async () => true);
  const reportError = jest.fn();
  const handle = await renderHook(() => {
    const [props, setProps] = useState<SeedProps>({ ready: false, currentIdentity: identity, expectedIdentity: identity, ...initial });
    const attached = usePreparedResourceSeed({ conversationId: "new-chat", resources, attach, reportError, ...props });
    return { setProps, attached };
  });
  return { handle, attach, reportError };
}

describe("prepared window resource seed", () => {
  it("waits for initialization and attaches the exact resource once", async () => {
    const { handle, attach, reportError } = await mountSeed();
    try {
      expect(attach).not.toHaveBeenCalled();
      expect(handle.current.attached).toBe(false);
      await handle.act(() => handle.current.setProps((p) => ({ ...p, ready: true })));
      expect(attach).toHaveBeenCalledTimes(1);
      expect(handle.current.attached).toBe(true);
      expect(attach).toHaveBeenCalledWith(resources[0]);
      await handle.act(() => handle.current.setProps((p) => ({ ...p })));
      expect(attach).toHaveBeenCalledTimes(1);
      expect(reportError).not.toHaveBeenCalled();
    } finally { await handle.unmount(); }
  });
  it("discards on an organization change before readiness and cannot revive the seed", async () => {
    const { handle, attach, reportError } = await mountSeed();
    try {
      await handle.act(() => handle.current.setProps((p) => ({ ...p, currentIdentity: { ...identity, organizationId: "other-org" } })));
      await handle.act(() => handle.current.setProps((p) => ({ ...p, ready: true, currentIdentity: identity })));
      expect(attach).not.toHaveBeenCalled();
      expect(reportError).toHaveBeenCalledTimes(1);
    } finally { await handle.unmount(); }
  });
  it.each([null, { userId: "another-user", organizationId: identity.organizationId }])("fails closed for missing or mismatched identity %j", async (expectedIdentity: PreparedResourceIdentity | null) => {
    const { handle, attach, reportError } = await mountSeed({ ready: true, expectedIdentity });
    try {
      expect(attach).not.toHaveBeenCalled();
      expect(reportError).toHaveBeenCalledWith(expect.stringContaining("discarded"));
    } finally { await handle.unmount(); }
  });
});

  it.each([true, false])("reports successful readiness only after attachment resolves: %s", async (success) => {
    let finish: (value: boolean) => void = () => {};
    const pending = new Promise<boolean>((resolve) => { finish = resolve; });
    const reportError = jest.fn();
    const attach = jest.fn(() => pending);
    const handle = await renderHook(() => usePreparedResourceSeed({ conversationId: "pending-chat", ready: true, resources, expectedIdentity: identity, currentIdentity: identity, attach, reportError }));
    try {
      expect(handle.current).toBe(false);
      await handle.act(async () => { finish(success); await pending; });
      expect(handle.current).toBe(success);
      expect(reportError).toHaveBeenCalledTimes(success ? 0 : 1);
    } finally { await handle.unmount(); }
  });
