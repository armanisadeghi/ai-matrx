/**
 * 🚨 F-85 / Bugbot MEDIUM — the refusal copy announced the act it was refusing.
 *
 * `organizationRefusalMessage` built its sentence as `${subject} was ${act}`.
 * With no subject that is honest ("Nothing was saved because no organization is
 * selected."). With one it is the exact defect the whole module exists to
 * prevent — a screen that lies (law 4):
 *
 *   "This record was opened because no organization is selected."      (openRecord)
 *   "This document was refreshed because no organization is selected." (GoogleDocumentPanel)
 *   "This canvas was shared because no organization is selected."      (useCanvasShare)
 *   "This file's edit history was saved because …"                     (codeEditHistoryFlush)
 *
 * Every one of them reads as a SUCCESS report with a puzzling reason attached.
 *
 * The class fix is in the helper, not the call sites: a named subject always
 * renders "was NOT <act>", so there is no argument shape that produces the
 * affirmative. This test is the guard, and it is a census — every live call
 * shape in the repo is listed below, so a new caller that reintroduces the lie
 * (or an `act` that smuggles its own "not" in) fails here.
 */

import {
  ORGANIZATION_REQUIRED_REMEDY,
  organizationRefusalMessage,
} from "@/lib/organizations/organizationRefusalToast";

/**
 * THE CENSUS — every `subject`/`act` pair passed to
 * `organizationRefusalMessage` / `presentOrganizationRefusal` /
 * `withOrganizationRefusalShown` anywhere in the repo, read on 2026-09-18.
 * Grep for the three names before changing it.
 */
const LIVE_CALL_SHAPES: ReadonlyArray<{
  where: string;
  options: { subject?: string; act?: string };
  reads: string;
}> = [
  // ── The two Bugbot named (F-76's files) ──────────────────────────────────
  {
    where: "features/google-workspace/documents/openRecord.tsx",
    options: { subject: "This record", act: "opened" },
    reads: "This record was not opened",
  },
  {
    where: "features/google-workspace/documents/GoogleDocumentPanel.tsx",
    options: { subject: "This document", act: "refreshed" },
    reads: "This document was not refreshed",
  },
  // ── Their siblings, the same lie ─────────────────────────────────────────
  {
    where: "hooks/canvas/useCanvasShare.ts",
    options: { subject: "This canvas", act: "shared" },
    reads: "This canvas was not shared",
  },
  {
    where: "features/code/redux/codeEditHistoryFlush.ts",
    options: { subject: "This file's edit history", act: "saved" },
    reads: "This file's edit history was not saved",
  },
  {
    where: "features/cx-conversation/components/HtmlPreviewBridge.tsx (register)",
    options: { subject: "This page", act: "linked to the conversation" },
    reads: "This page was not linked to the conversation",
  },
  {
    where: "features/cx-conversation/components/HtmlPreviewBridge.tsx (update)",
    options: { subject: "This page's record", act: "updated" },
    reads: "This page's record was not updated",
  },
  {
    where: "features/voice-agent/persistence/voiceTranscriptWriter.ts (conversation)",
    options: { subject: "This voice conversation", act: "saved" },
    reads: "This voice conversation was not saved",
  },
  {
    where: "features/voice-agent/persistence/voiceTranscriptWriter.ts (turns)",
    options: { subject: "This transcript", act: "saved" },
    reads: "This transcript was not saved",
  },
  // ── Subject-less callers: the honest default, unchanged ──────────────────
  {
    where: "features/google-workspace/calendar/CalendarEventSections.tsx (keep)",
    options: { act: "kept" },
    reads: "Nothing was kept",
  },
  {
    where: "features/google-workspace/calendar/CalendarEventSections.tsx (archive)",
    options: { act: "archived" },
    reads: "Nothing was archived",
  },
  {
    where: "features/agents/redux/agent-shortcut-categories/thunks.ts and the other withOrganizationRefusalShown sites",
    options: { act: "created" },
    reads: "Nothing was created",
  },
];

describe("organizationRefusalMessage", () => {
  it("never announces the act it is refusing, at any live call site", () => {
    for (const shape of LIVE_CALL_SHAPES) {
      const sentence = organizationRefusalMessage(shape.options);
      const act = shape.options.act ?? "saved";
      // The affirmative report is the defect. "Nothing was kept because …" is
      // NOT one — the subject-less default is already a refusal — so this is
      // asserted where the lie lives: a sentence that NAMES its subject.
      if (shape.options.subject) {
        expect(sentence).not.toContain(`${shape.options.subject} was ${act}`);
        expect(sentence).toContain(`${shape.options.subject} was not ${act}`);
      } else {
        expect(sentence.startsWith("Nothing was ")).toBe(true);
      }
      expect(sentence).toContain(shape.reads);
      // A caller that smuggled its own negation in would read "was not not …".
      expect(sentence).not.toContain("not not");
      // And the remedy is never dropped: law 4, every stand-in ships its fix.
      expect(sentence).toContain(ORGANIZATION_REQUIRED_REMEDY);
    }
  });

  it("reads as one true sentence for the two shapes Bugbot found", () => {
    expect(
      organizationRefusalMessage({ act: "opened", subject: "This record" }),
    ).toBe(
      `This record was not opened because no organization is selected. ${ORGANIZATION_REQUIRED_REMEDY}`,
    );
    expect(
      organizationRefusalMessage({ act: "refreshed", subject: "This document" }),
    ).toBe(
      `This document was not refreshed because no organization is selected. ${ORGANIZATION_REQUIRED_REMEDY}`,
    );
  });

  it("keeps the honest subject-less default", () => {
    expect(organizationRefusalMessage()).toBe(
      `Nothing was saved because no organization is selected. ${ORGANIZATION_REQUIRED_REMEDY}`,
    );
    expect(organizationRefusalMessage({ act: "published" })).toContain(
      "Nothing was published because",
    );
  });

  it("negates for ANY subject, so no caller can construct the lie", () => {
    for (const subject of ["This thing", "The row", "Your note"]) {
      for (const act of ["saved", "created", "shared", "published", "sent"]) {
        const sentence = organizationRefusalMessage({ subject, act });
        expect(sentence.startsWith(`${subject} was not ${act} because`)).toBe(true);
      }
    }
  });
});
