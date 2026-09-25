/**
 * THE MANDATE LAW FOR SURFACE ROLES (Arman, 2026-09-25): a surface manifest
 * never names an agent. A role's platform default is a mandate key; manifest
 * sync writes it to `ui_surface_agent_role.mandate_key` and resolveSurfaceConfig
 * resolves the mandate's CURRENT Holder, so a rebinding in the mandate console
 * takes effect. A non-null `defaultAgentId` is synced to `default_agent_id`,
 * which outranks the mandate tier — the console could never rebind it.
 *
 * `ManifestAgentRole` makes the literal a type error; this test catches what the
 * compiler cannot (a cast, an `as any`, a role built at run time) across every
 * RESOLVED manifest, inherited roles included.
 */
import { getAllManifests } from "@/features/surfaces/manifests/registry";

interface RoleLike {
  name: string;
  defaultAgentId?: string | null;
  mandateKey?: string | null;
}

export function rolesNamingAnAgent(
  manifests: ReadonlyArray<{ surfaceName: string; agentRoles?: ReadonlyArray<RoleLike> }>,
): string[] {
  const out: string[] = [];
  for (const m of manifests) {
    for (const r of m.agentRoles ?? []) {
      if (r.defaultAgentId != null) out.push(`${m.surfaceName}::${r.name} -> ${r.defaultAgentId}`);
    }
  }
  return out;
}

describe("surface manifest roles name mandates, never agents", () => {
  it("fires on a planted role that names an agent id (the guard can fail)", () => {
    const planted = [
      {
        surfaceName: "matrx-user/planted",
        agentRoles: [
          { name: "ok", defaultAgentId: null, mandateKey: "war_room.room" },
          { name: "bad", defaultAgentId: "7239e128-2a07-4d68-8292-0f530be6f754" },
        ],
      },
    ];
    expect(rolesNamingAnAgent(planted)).toEqual([
      "matrx-user/planted::bad -> 7239e128-2a07-4d68-8292-0f530be6f754",
    ]);
  });

  it("no registered manifest role carries a defaultAgentId", () => {
    expect(rolesNamingAnAgent(getAllManifests() as never)).toEqual([]);
  });
});
