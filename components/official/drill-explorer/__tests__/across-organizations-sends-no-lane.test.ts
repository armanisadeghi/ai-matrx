import { acrossOrganizations } from "../useDrillExplorer";

// A member page whose organization is a visible control asks the door with NO lane (every organization she is in);
// a named lane would narrow to the one organization the client carries (platform._drill_compile, 'organization' lane).
describe("acrossOrganizations", () => {
  const seen: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const base = { rpc: (fn: string, args: Record<string, unknown>) => { seen.push({ fn, args }); return Promise.resolve({ data: null, error: null }); }, schema: () => ({}) };
  const wide = acrossOrganizations(base as never);

  it("drops the lane from drill_ask and drill_rows, keeps everything else", () => {
    seen.length = 0;
    for (const fn of ["drill_ask", "drill_rows"]) {
      (wide.rpc as unknown as (f: string, a: unknown) => unknown)(fn, { p_organization_id: "o", p_question: { by: ["stage"], lane: "organization" } });
    }
    expect(seen.map((s) => s.args.p_question)).toEqual([{ by: ["stage"] }, { by: ["stage"] }]);
    expect(seen[0]?.args.p_organization_id).toBe("o");
  });

  it("leaves other doors alone", () => {
    seen.length = 0;
    (wide.rpc as unknown as (f: string, a: unknown) => unknown)("drill_describe", { p_question: { lane: "organization" } });
    expect(seen[0]?.args.p_question).toEqual({ lane: "organization" });
  });

  it("is red without the strip (the lane would survive)", () => {
    seen.length = 0;
    (base.rpc as (f: string, a: Record<string, unknown>) => unknown)("drill_ask", { p_question: { lane: "organization" } });
    expect(seen[0]?.args.p_question).toEqual({ lane: "organization" });
  });
});
