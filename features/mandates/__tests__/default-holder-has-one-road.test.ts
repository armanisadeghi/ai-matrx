/**
 * THE MANDATE'S BOTTOM RUNG HAS ONE ROAD, AND IT IS THE DOOR (`aidream AD226`).
 *
 * `mandate.definition.default_holder_type / default_holder_id /
 * default_holder_version_id` are the mandate's SYSTEM rung — the floor every
 * member of its home organization falls to when no other binding answers. It
 * decides for people other than the writer, so it is set through ONE gated
 * server door, `PUT /mandates/{mandate_key}/default-holder`, which checks who
 * is asking, re-runs the mandate's contract gate, and refuses a Holder the home
 * organization cannot open.
 *
 * FIX-R3 built that door and MEASURED that it was bypassable: with a genuine
 * non-admin member's token, a direct PostgREST PATCH of those columns returned
 * HTTP 200, one row, changed. The client had three writers doing exactly that
 * — `useGuardedRebind`'s default write, `MandateDetailPanel`'s version pin, and
 * the Linked Agent Sync window's rebind — all composing the columns through one
 * helper in the storage router.
 *
 * 🚨 THIS IS A CLASS GUARD, NOT A FIX FOR THREE FILES. The database now refuses
 * the client-side write outright (`aidream/db/migrations/0596`), so a fourth
 * writer would not fail here — it would fail in production, in front of a
 * person. The census below is the thing that keeps a fourth writer from being
 * written: NO client file may name those columns in a write, and the composer
 * that used to build them does not exist.
 *
 * The runtime behaviour of the door and of the lock is proven against
 * PRODUCTION, not here:
 * `aidream/tests/test_mandate_definition_holder_lockdown_live.py`, RED then
 * GREEN.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..");

/** Comments are stripped: these files are dense with prose ABOUT the rule. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function read(relative: string): string {
  return withoutComments(readFileSync(join(REPO_ROOT, relative), "utf8"));
}

const HOLDER_COLUMNS = [
  "default_holder_type",
  "default_holder_id",
  "default_holder_version_id",
] as const;

/** Trees a browser bundle is built from. Generated types are not code. */
const SEARCHED_TREES = ["features", "lib", "app", "components", "hooks", "utils"];
const SKIPPED_DIRS = new Set(["node_modules", ".next", "__tests__", "generated"]);
const SKIPPED_FILES = new Set(["database.types.ts", "api-types.ts"]);

function walk(dir: string, out: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIPPED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx") &&
      !SKIPPED_FILES.has(entry)
    ) {
      out.push(full);
    }
  }
  return out;
}

const CLIENT_FILES = SEARCHED_TREES.flatMap((tree) =>
  walk(join(REPO_ROOT, tree), []),
);

describe("the mandate default holder is written through the door, never the row", () => {
  it("finds a real corpus to judge (a census over nothing always passes)", () => {
    expect(CLIENT_FILES.length).toBeGreaterThan(500);
  });

  it("has no client-side composer for the holder columns", () => {
    // `mandateHolderWrite` turned a rebind decision into the three columns and
    // had three callers. It is DELETED, not deprecated: a composer for a write
    // nobody may perform is an invitation.
    const offenders = CLIENT_FILES.filter((file) =>
      withoutComments(readFileSync(file, "utf8")).includes("mandateHolderWrite"),
    ).map((file) => file.slice(REPO_ROOT.length + 1));
    expect(offenders).toEqual([]);
  });

  it("names the holder columns in no client WRITE", () => {
    // A read is fine and necessary — every screen that shows who fulfils a job
    // reads them. What may not exist is a write: the column name appearing
    // inside an object literal, which is the only shape a PostgREST
    // `.update()` / `.upsert()` / `.insert()` payload can take.
    const offenders: string[] = [];
    for (const file of CLIENT_FILES) {
      const source = withoutComments(readFileSync(file, "utf8"));
      for (const column of HOLDER_COLUMNS) {
        // `default_holder_id:` — a value being ASSIGNED to the column, as
        // opposed to `row.default_holder_id` or `"default_holder_id"` in a
        // select list.
        if (new RegExp(`(^|[^.\\w"'\`])${column}\\s*:`, "m").test(source)) {
          offenders.push(`${file.slice(REPO_ROOT.length + 1)} → ${column}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps a definition patch incapable of carrying a holder", () => {
    // The admin service's write allowlist. `holder` on this type was the back
    // road: one field the storage router expanded into the three columns.
    const service = read("features/mandates/admin/service.ts");
    const patch = service.slice(
      service.indexOf("export type MandateDefinitionPatch"),
      service.indexOf("export async function updateMandateDefinition"),
    );
    expect(patch.length).toBeGreaterThan(0);
    expect(patch).not.toContain("holder");
  });

  it("routes all three former writers through putMandateDefaultHolder", () => {
    for (const file of [
      "features/mandates/admin/useGuardedRebind.tsx",
      "features/mandates/admin/MandateDetailPanel.tsx",
      "features/window-panels/windows/agents/AgentConvertSystemWindow.tsx",
    ]) {
      const source = read(file);
      expect({ file, callsDoor: source.includes("putMandateDefaultHolder") })
        .toEqual({ file, callsDoor: true });
    }
  });

  it("makes the one-of-two holder choice ONCE, in the door client", () => {
    // The door answers 422 `mandate_binding_ambiguous_holder` when both
    // `agent_id` and `agent_version_id` arrive. `agentDefaultHolder` decides
    // that once so no surface can get it wrong; a caller that asks to pin
    // without naming a version is asking for latest and gets it.
    const { agentDefaultHolder } = jest.requireActual<
      typeof import("../overrides")
    >("../overrides");

    expect(agentDefaultHolder("agent-1")).toEqual({
      holderType: "agent",
      agentId: "agent-1",
      agentVersionId: null,
      useLatest: true,
      holderId: null,
      holderVersionId: null,
    });
    expect(agentDefaultHolder("agent-1", "ver-9")).toEqual({
      holderType: "agent",
      agentId: null,
      agentVersionId: "ver-9",
      useLatest: false,
      holderId: null,
      holderVersionId: null,
    });
    // "pin", with nothing to pin to, is latest — not a body with neither half.
    expect(agentDefaultHolder("agent-1", null)).toEqual(
      agentDefaultHolder("agent-1"),
    );
  });
});
