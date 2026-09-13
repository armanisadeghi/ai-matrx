const createClient = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ createClient }));

import { addToolBinding } from "./toolBindings.service";

const TOOL = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
function transport(data: unknown, error: unknown = null) {
  const single = jest.fn().mockResolvedValue({ data, error });
  const query = { select: jest.fn(), eq: jest.fn(), insert: jest.fn(), single };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.insert.mockReturnValue(query);
  return query;
}

describe("canonical tool binding organization", () => {
  beforeEach(() => jest.clearAllMocks());

  it("carries the authoritative named tool organization into the single shared writer", async () => {
    const tool = transport({ id: TOOL, organization_id: ORG });
    const binding = transport({ tool_id: TOOL, executor_name: "test-executor", organization_id: ORG, is_active: false });
    const from = jest.fn().mockReturnValueOnce(tool).mockReturnValueOnce(binding);
    createClient.mockReturnValue({ schema: jest.fn().mockReturnValue({ from }) });
    await expect(addToolBinding({ toolId: TOOL, executorName: "test-executor", isActive: false })).resolves.toMatchObject({ organization_id: ORG });
    expect(tool.eq).toHaveBeenCalledWith("id", TOOL);
    expect(binding.insert).toHaveBeenCalledWith({ tool_id: TOOL, executor_name: "test-executor", organization_id: ORG, is_active: false });
    expect(from.mock.calls).toEqual([["definition"], ["binding"]]);
  });

  it.each([
    null,
    { id: TOOL, organization_id: null },
    { id: TOOL, organization_id: "invalid" },
    { id: "33333333-3333-4333-8333-333333333333", organization_id: ORG },
  ])("refuses unavailable or invalid parent ownership before insert: %p", async (row) => {
    const tool = transport(row); const from = jest.fn().mockReturnValue(tool);
    createClient.mockReturnValue({ schema: jest.fn().mockReturnValue({ from }) });
    await expect(addToolBinding({ toolId: TOOL, executorName: "test-executor" })).rejects.toThrow();
    expect(tool.insert).not.toHaveBeenCalled(); expect(from).toHaveBeenCalledTimes(1);
  });

  it("propagates a denied parent read without issuing a binding write", async () => {
    const denied = new Error("permission denied"); const tool = transport(null, denied);
    const from = jest.fn().mockReturnValue(tool);
    createClient.mockReturnValue({ schema: jest.fn().mockReturnValue({ from }) });
    await expect(addToolBinding({ toolId: TOOL, executorName: "test-executor" })).rejects.toBe(denied);
    expect(tool.insert).not.toHaveBeenCalled(); expect(from).toHaveBeenCalledTimes(1);
  });
});
