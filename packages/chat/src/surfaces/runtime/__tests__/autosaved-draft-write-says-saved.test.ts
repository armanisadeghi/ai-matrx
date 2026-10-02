/**
 * A WRITE INTO AN EDITOR THAT SAVES ITSELF MUST NOT TELL THE AGENT "THE USER
 * STILL SAVES".
 *
 * Break this guards (bench 2026-10-01 16:47Z, conversation 7bde4d03-…, note
 * f1284c78-…): `apply_surface_write("note_content")` landed in the notes editor,
 * whose autosave wrote it to the database seconds later (version 7, editor
 * "Saved"). The tool output the agent read said `"Note content" staged into the
 * page's draft — the user still reviews and saves.`, so the agent told the
 * person "you'll still need to review and save it there" — false.
 *
 * Drives the REAL manifest targets through the REAL formatter: the receipt must
 * follow the target's declared persistence, never the bare `mode: "draft"`.
 */
import { surfaceWriteToolOutput } from "../surface-write-tool-output";
import { notesEditorManifest } from "@host/features/surfaces/manifests/notes-editor.manifest";
import type { SurfaceWriteTarget } from "../../types";
import { buildSurfaceWriteApprovalChange } from "../../../agents/redux/execution-system/thunks/surface-write-approval-change";
import type { SurfaceWriteApprovalProposal } from "../surface-writeback";

function targetNamed(name: string): SurfaceWriteTarget {
  const target = notesEditorManifest.writeTargets?.find((t) => t.name === name);
  if (!target) throw new Error(`notes-editor manifest has no "${name}" target`);
  return target;
}

function messageFor(target: SurfaceWriteTarget): Record<string, unknown> {
  return surfaceWriteToolOutput(
    target.name,
    {
      ok: true,
      surfaceName: "matrx-user/notes",
      target,
      change: {
        appliedAt: "2026-10-01T16:47:52.193Z",
        written: "x",
      },
    },
    true,
  ).output;
}

describe("a draft write into an autosaving editor", () => {
  it.each(["note_content", "append_to_note"])(
    "%s tells the agent the editor saves it — never that the user still saves",
    (name) => {
      const output = messageFor(targetNamed(name));
      expect(String(output.message)).not.toMatch(/still reviews and saves/);
      expect(String(output.message)).toMatch(/saves it automatically/);
      expect(output.saved_by).toBe("autosave");
    },
  );

  it("a draft target that really waits for the person still says so", () => {
    const manual: SurfaceWriteTarget = {
      name: "body",
      label: "Body",
      description: "",
      valueType: "string",
      mode: "draft",
    } as SurfaceWriteTarget;
    const output = messageFor(manual);
    expect(String(output.message)).toMatch(/the user still reviews and saves/);
    expect(output.saved_by).toBe("user");
  });
});

/**
 * The same false sentence reached the PERSON: the approval card for a draft
 * write said "Approval only stages it in the editor; you still review and
 * save." over a note editor that saves on its own.
 */

describe("the approval card for a draft write", () => {
  const proposalFor = (target: SurfaceWriteTarget) =>
    ({ target, value: "new body" }) as unknown as SurfaceWriteApprovalProposal;

  it("says an autosaving editor saves it", () => {
    const change = buildSurfaceWriteApprovalChange(proposalFor(targetNamed("note_content")));
    expect(change.description).not.toMatch(/you still review and save/);
    expect(change.description).toMatch(/saves it automatically/);
  });

  it("still says a Save-button draft waits for the person", () => {
    const manual = { ...targetNamed("note_content"), savedBy: undefined };
    const change = buildSurfaceWriteApprovalChange(proposalFor(manual));
    expect(change.description).toMatch(/you still review and save/);
  });
});
