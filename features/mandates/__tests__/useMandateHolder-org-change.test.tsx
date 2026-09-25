/**
 * @jest-environment jsdom
 */
import { useState } from "react";
import { renderHook, settle } from "@/test-utils/renderHook";

let selectedOrg: string | null = null;
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) => selector(undefined),
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => selectedOrg,
}));

const resolveMandateHolder = jest.fn();
jest.mock("../service", () => {
  class MandateOrganizationUnresolvedError extends Error {}
  return {
    MandateOrganizationUnresolvedError,
    onMandateCacheInvalidated: () => () => {},
    resolveMandateHolder: (...args: unknown[]) => resolveMandateHolder(...args),
  };
});

import { useMandateHolder } from "../useMandateHolder";
import { MandateOrganizationUnresolvedError } from "../service";

describe("useMandateHolder — the organization is part of the question", () => {
  it("re-asks when the workspace is selected after mount, instead of keeping 'Not available'", async () => {
    resolveMandateHolder.mockImplementation(async () => {
      if (!selectedOrg) throw new MandateOrganizationUnresolvedError("no org");
      return { holderType: "agent", holderId: "a-1", provenance: "system" };
    });
    let rerender: () => void = () => {};
    const hook = await renderHook(() => {
      const [, force] = useState(0);
      rerender = () => force((n) => n + 1);
      return useMandateHolder("records.enrichment");
    });
    await settle(hook, (v) => !v.loading, "first answer");
    expect(hook.current.holder).toBeNull();
    expect(hook.current.organizationPending).toBe(true);

    selectedOrg = "org-1";
    await hook.act(() => rerender());
    await settle(hook, (v) => v.holder?.holderId === "a-1", "answer after the workspace is selected");
    expect(hook.current.error).toBeNull();
  });
});
