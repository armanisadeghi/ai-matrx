/**
 * Lane A1 — WHAT SHE ATTACHED REACHES THE BUILDER, AND STAYS. A build's references (files, notes, pages; her
 * agents and workflows made jobs) live on the build's record, so a reload keeps them; every round sends the
 * material through THE attach path (never her message) and the jobs through the catalogue.
 */
import type { Resource } from "@ai-matrx/chat/agents/resources/types";

import { appletJobKey } from "./applet-job";
import {
  attachedJobKeys,
  attachmentsContext,
  jobReference,
  readBuildReferences,
  referenceResources,
  resourceReference,
  withoutReference,
  withReference,
} from "./build-references";
import { toRecord } from "./build-session";

jest.mock("./applet-job", () => jest.requireActual("./applet-job"));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/features/mandates/authoring-level/service", () => ({ createSoftMandate: jest.fn() }));
jest.mock("@/features/mandates/overrides", () => ({ agentDefaultHolder: jest.fn(), putMandateDefaultHolder: jest.fn() }));

const csv = { type: "file", data: { id: "file-1", details: { filename: "dogs.csv" } } } as unknown as Resource;
const note = { type: "note", data: { id: "note-1", label: "Breeds" } } as unknown as Resource;
const agent = jobReference({ holder: "agent", holderId: "37397019-7a92", label: "Dog namer", jobKey: "applets.run_dog_namer_373970" });

describe("lane A1: what she attached", () => {
  it("a picked file is one reference by its file id; picking it again never doubles it", () => {
    const once = withReference([], resourceReference(csv));
    const twice = withReference(once, resourceReference(csv));
    expect(twice).toHaveLength(1);
    expect(twice[0]).toMatchObject({ id: "file:file-1", kind: "resource", label: "dogs.csv" });
    expect(withoutReference(twice, "file:file-1")).toEqual([]);
  });

  it("the material rides the attach path and the jobs the catalogue — never mixed", () => {
    const refs = [resourceReference(csv), resourceReference(note), agent];
    expect(referenceResources(refs)).toEqual([csv, note]);
    expect(attachedJobKeys(refs)).toEqual(["applets.run_dog_namer_373970"]);
  });

  it("each round names what is attached; nothing attached removes the entry", () => {
    expect(attachmentsContext([])).toBeNull();
    const named = JSON.parse(attachmentsContext([resourceReference(csv), agent]) ?? "[]");
    expect(named.map((n: { attached: string }) => n.attached)).toEqual(["dogs.csv", "Dog namer"]);
    expect(named[1]).toMatchObject({ what: "agent", job: "applets.run_dog_namer_373970" });
  });

  it("a reload keeps them: the record reads them back off metadata.build.references", () => {
    const refs = [resourceReference(csv), agent];
    const record = toRecord({
      id: "a1",
      organization_id: "org",
      slug: "draft-x",
      name: "Untitled Applet",
      version: 3,
      status: "draft",
      entry: null,
      metadata: { build: { requests: [], references: [...refs, { id: "bad", kind: "job" }] } },
    });
    expect(record.references).toEqual(refs);
    expect(readBuildReferences({})).toEqual([]);
  });

  it("a job key is a valid mandate key named after the agent", () => {
    expect(appletJobKey("Dog Namer!", "37397019-7a92-4cd8")).toBe("applets.run_dog_namer_373970");
    expect(appletJobKey("", "ABCDEF12")).toBe("applets.run_abcdef");
    expect(appletJobKey("Ünïcode café — notes", "x1")).toMatch(/^applets\.run_[a-z0-9_]+$/);
  });
});
