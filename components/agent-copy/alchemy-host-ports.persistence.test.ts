/**
 * PP-13a — the web app binds PersistencePort and TransferKnobsPort to the Feature Knob register.
 *
 * Replaced: ONLY the Supabase client — an in-memory register answering the three doors the way
 * Postgres does (the person's own user-rung row by exact filters, `knob_override_set`'s envelope,
 * `knob_snapshot` resolving organization → platform when no user is named). The scoped-config
 * service, the snapshot cache, the ports and the package's layering run for real. Breaks caught:
 * reading another person's row; writing at the wrong rung; the person leaking into the
 * organization read; a refused write reported as a save.
 */

type Row = { feature: string; key: string; organization_id: string; scope_kind: string; scope_id: string; value: unknown };
const mockRegister = {
  platform: { "alchemy.transfer.default_recipe": {} as unknown } as Record<string, unknown>,
  overrides: [] as Row[],
  rpc: [] as [string, Record<string, unknown>][],
  refuse: null as null | { reason: string; detail: string },
};

// The organization question: "none yet" waits for boot's answer; the test scripts that answer.
const mockAwaitOrganization = jest.fn();
jest.mock("@/features/organizations/awaitWorkspace", () => ({
  awaitEffectiveOrganizationId: () => mockAwaitOrganization(),
}));

jest.mock("@/utils/supabase/client", () => {
  const select = (table: string) => {
    const eqs: [string, unknown][] = [];
    let inFilter: [string, unknown[]] | null = null;
    let newestFirst = false;
    const q = {
      order: () => ((newestFirst = true), q),
      select: () => q,
      eq: (column: string, value: unknown) => (eqs.push([column, value]), q),
      in: (column: string, values: unknown[]) => ((inFilter = [column, values]), q),
      then: (resolve: (r: unknown) => unknown) => {
        const rows = table === "knob_override" ? mockRegister.overrides : [];
        const data = rows.filter(
          (r) =>
            eqs.every(([c, v]) => (r as Record<string, unknown>)[c] === v) &&
            (!inFilter || inFilter[1].includes((r as Record<string, unknown>)[inFilter[0]])),
        );
        return Promise.resolve(resolve({ data: newestFirst ? [...data].reverse() : data, error: null }));
      },
    };
    return q;
  };
  const rpc = (fn: string, args: Record<string, unknown>) => {
    mockRegister.rpc.push([fn, args]);
    if (fn === "knob_override_set") {
      if (mockRegister.refuse) return Promise.resolve({ data: { ok: false, ...mockRegister.refuse }, error: null });
      const same = (r: Row) =>
        r.feature === args.p_feature && r.key === args.p_key && r.organization_id === args.p_organization_id && r.scope_kind === args.p_scope_kind && r.scope_id === args.p_scope_id;
      mockRegister.overrides = mockRegister.overrides.filter((r) => !same(r));
      if (args.p_value !== null)
        mockRegister.overrides.push({
          feature: String(args.p_feature),
          key: String(args.p_key),
          organization_id: String(args.p_organization_id),
          scope_kind: String(args.p_scope_kind),
          scope_id: String(args.p_scope_id),
          value: args.p_value,
        });
      return Promise.resolve({ data: { ok: true }, error: null });
    }
    if (fn === "knob_snapshot") {
      const resolved: Record<string, unknown> = {};
      for (const [full, platformValue] of Object.entries(mockRegister.platform)) {
        const at = full.lastIndexOf(".");
        const rung = (kind: string, id: unknown) =>
          mockRegister.overrides.find(
            (r) => `${r.feature}.${r.key}` === full && r.organization_id === args.p_organization_id && r.scope_kind === kind && r.scope_id === id,
          );
        const user = args.p_user_id ? rung("user", args.p_user_id) : undefined;
        const org = rung("organization", args.p_organization_id);
        resolved[`${full.slice(0, at)}.${full.slice(at + 1)}`] = (user ?? org)?.value ?? platformValue;
      }
      return Promise.resolve({ data: { resolved, stamp: "2026-09-27T12:00:00Z" }, error: null });
    }
    return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
  };
  const client = { schema: () => ({ from: select, rpc }) };
  return { createClient: () => client, supabase: client };
});

import { resolveDefaultRecipe, setPersonDefaultRecipe } from "@ai-matrx/alchemy/operate";
import { invalidateEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { createPersistencePort, createTransferKnobsPort, type AlchemyIdentityStore } from "./alchemy-host-ports";

const ADMIN = "0b0e6a3c-3d5e-4c1a-9a51-7b2f4e8d9c01";
const COLLEAGUE = "6c7d2e19-8f40-4b3a-b1e2-5a9c0d7f3e44";
const HARBOR = "5d0c6a0e-1c1b-4f55-9d7e-2b8f7b1f0a11";
const CX = "cx.conversation";
const errorsOnly = { name: "Errors only", exclude: ["/messages/*/metadata"] };
const compactSupport = { name: "Compact support threads", preset: "compact" };
const platformFull = { name: "Full transcript", preset: "full" };

const storeFor = (userId: string, organizationId: string | null): AlchemyIdentityStore => ({
  getState: () =>
    ({
      userAuth: { id: userId, isAdmin: false },
      appContext: { organization_id: organizationId },
    }) as never,
  subscribe: () => () => {},
});
const portsFor = (userId: string, organizationId: string | null = HARBOR) => ({
  diagnostics: { capture: jest.fn() },
  persistence: createPersistencePort(storeFor(userId, organizationId)),
  transferKnobs: createTransferKnobsPort(),
});
const setOrganization = async (value: unknown) => {
  const { setKnobOverride } = await import("@/lib/scoped-config/service");
  await setKnobOverride({ feature: "alchemy.transfer", key: "default_recipe", scopeKind: "organization", scopeId: HARBOR, organizationId: HARBOR, value });
};

beforeEach(() => {
  mockAwaitOrganization.mockReset();
  mockRegister.platform = { "alchemy.transfer.default_recipe": {} };
  mockRegister.overrides = [];
  mockRegister.rpc = [];
  mockRegister.refuse = null;
  invalidateEffectiveKnob();
});

describe("web app persistence + transfer knobs (PP-13a)", () => {
  it("round-trips a person's default recipe through their own user-rung row, and a colleague does not read it", async () => {
    await setPersonDefaultRecipe(portsFor(ADMIN), CX, errorsOnly);
    expect(mockRegister.rpc.at(-1)).toEqual([
      "knob_override_set",
      expect.objectContaining({ p_feature: "alchemy.transfer", p_key: "default_recipe", p_scope_kind: "user", p_scope_id: ADMIN, p_organization_id: HARBOR, p_value: { [CX]: errorsOnly } }),
    ]);
    expect(await resolveDefaultRecipe(portsFor(ADMIN), CX, HARBOR)).toMatchObject({ recipe: errorsOnly, from: "person" });
    expect(await resolveDefaultRecipe(portsFor(COLLEAGUE), CX, HARBOR)).toMatchObject({ from: "built-in" });
  });

  it("with an organization default and no personal one it opens the organization's recipe; clearing it falls back to the platform default", async () => {
    mockRegister.platform = { "alchemy.transfer.default_recipe": { [CX]: platformFull } };
    await setOrganization({ [CX]: compactSupport });
    expect(await resolveDefaultRecipe(portsFor(ADMIN), CX, HARBOR)).toEqual({ recipe: compactSupport, from: "organization", notices: [] });
    await setOrganization(null);
    expect(await resolveDefaultRecipe(portsFor(ADMIN), CX, HARBOR)).toEqual({ recipe: platformFull, from: "organization", notices: [] });
  });

  it("the organization read is the snapshot for the organization alone (fails if it names the person)", async () => {
    await setPersonDefaultRecipe(portsFor(ADMIN), CX, errorsOnly);
    expect(await createTransferKnobsPort().defaultRecipe(CX, HARBOR)).toBeNull();
    const snapshot = mockRegister.rpc.find(([fn]) => fn === "knob_snapshot");
    expect(snapshot?.[1].p_user_id).toBeUndefined();
  });

  it("a refused write throws the door's reason instead of reporting a save", async () => {
    mockRegister.refuse = { reason: "org_locked", detail: "Your organization manages this setting." };
    await expect(setPersonDefaultRecipe(portsFor(ADMIN), CX, errorsOnly)).rejects.toThrow(/not saved: org_locked — Your organization manages this setting/);
  });

  it("without an organization a personal SAVE is a sentence, not a guess", async () => {
    mockAwaitOrganization.mockResolvedValueOnce({ status: "unavailable", reason: "unused", cause: "no-selection" });
    const before = mockRegister.rpc.length;
    await expect(portsFor(ADMIN, null).persistence.writeSetting("alchemy.transfer.default_recipe", { [CX]: errorsOnly })).rejects.toThrow(
      /saved per organization, and none is selected\. Choose the one you are working in/,
    );
    expect(mockRegister.rpc.length).toBe(before);
  });

  it("a FAILED organization read is said as that on a save, never as 'pick one'", async () => {
    mockAwaitOrganization.mockResolvedValueOnce({
      status: "unavailable",
      reason: "We could not check which organization to file this in.",
      cause: "unreadable",
    });
    await expect(portsFor(ADMIN, null).persistence.writeSetting("alchemy.transfer.default_recipe", { [CX]: errorsOnly })).rejects.toThrow(
      /We could not check which organization/,
    );
  });

  it("an organization boot answers late is used for the save, not refused", async () => {
    mockAwaitOrganization.mockResolvedValueOnce({ status: "ready", organizationId: HARBOR });
    await portsFor(ADMIN, null).persistence.writeSetting("alchemy.transfer.default_recipe", { [CX]: errorsOnly });
    expect(mockRegister.rpc.at(-1)?.[1]).toMatchObject({ p_organization_id: HARBOR, p_scope_id: ADMIN });
  });

  it("READING the person's setting never asks which organization is active: the newest of their own rows, in any organization, wins", async () => {
    const OTHER_ORG = "7e1f8b2a-4d3c-4a9e-8f60-3c2b1a0d9e88";
    const row = (organization_id: string, scope_id: string, value: unknown): Row => ({
      feature: "alchemy.transfer", key: "default_recipe", organization_id, scope_kind: "user", scope_id, value,
    });
    mockRegister.overrides = [
      row(HARBOR, ADMIN, { [CX]: errorsOnly }),
      row(OTHER_ORG, COLLEAGUE, { [CX]: platformFull }),
      row(OTHER_ORG, ADMIN, { [CX]: compactSupport }),
    ];
    const persistence = portsFor(ADMIN, null).persistence;
    await expect(persistence.readSetting("alchemy.transfer.default_recipe")).resolves.toEqual({ [CX]: compactSupport });
    await expect(portsFor(COLLEAGUE, null).persistence.readSetting("alchemy.transfer.default_recipe")).resolves.toEqual({ [CX]: platformFull });
    expect(mockAwaitOrganization).not.toHaveBeenCalled();
  });
});
