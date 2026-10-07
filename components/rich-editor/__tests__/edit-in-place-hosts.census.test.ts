// GUARD: every rendered rich-content host the person can edit offers EDIT IN
// PLACE (components/rich-editor/in-place — a double-click on the text, or the
// host's Edit, swaps the rendered view for THE ONE editor in the same spot).
// Arman, 2026-10-04: "In places where we edit text, it's not making it easy to
// edit in place but also allow for easy rich text formatting."
//
// A file is an EDITABLE RENDERED HOST when it renders rich content
// (RichDocument / MarkdownStream / RichContent / EnhancedChatMarkdown) AND hands
// that render an edit path (`onContentChange=`, a MarkdownSourceEditProvider /
// MaybeSourceEdit). It is wired when it renders <EditInPlace> or spreads
// `useInPlaceTrigger(...)`. Hosts whose edit rights are decided elsewhere (a
// chat message, a phone note, a study guide) are REQUIRED by name. Read-only
// content (someone else's record) passes `canEdit={false}` and never offers it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");

/** The hosts the brief names (and the first host), each required to be wired. */
const REQUIRED = [
  "../aidream/apps/shared/chat/src/agents/components/messages-display/assistant/AgentAssistantMessage.tsx",
  "../aidream/apps/shared/chat/src/agents/components/messages-display/assistant/InPlaceAnswerEditor.tsx",
  "../aidream/apps/shared/chat/src/agents/components/messages-display/user/AgentUserMessage.tsx",
  "features/notes/components/NoteEditorCore.tsx",
  "features/notes/components/mobile/MobileNoteEditor.tsx",
  "features/education/study-guides/components/StudyGuideReader.tsx",
  "components/markdown-studio/PreviewPanel.tsx",
  "features/tasks/components/TaskDetailsPanel.tsx",
  "features/transcription-cleanup/components/CleanupOutput.tsx",
];

const SCAN_DIRS = ["app", "components", "features", "../aidream/apps/shared/chat/src"];

/** Editable rendered hosts that are not wired, each with its reason. Shrink-only. */
const EXEMPT: Record<string, string> = {
  "components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx": "the renderer itself",
  "components/matrx/MatrxSplit.tsx": "Split: the source editor is always open beside the preview",
  "components/markdown-studio/MarkdownStudio.tsx": "routes the buffer to PreviewPanel (wired) and its Editor mode",
  // Click-to-edit already swaps to their own editor in place; the move onto
  // THE ONE editor is the prompt/template follow-up lane (format-hosts census).
  "features/agents/components/builder/message-builders/MessageItem.tsx": "follow-up lane: prompt message click-to-edit",
  "features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx": "follow-up lane: system instructions click-to-edit",
  // No live route mounts these copies (census 2026-10-05); the live chat is
  // ../aidream/apps/shared/chat/src/agents (wired above).
  "../aidream/apps/shared/chat/src/cx-conversation/AssistantMessage.tsx": "not mounted by a live route (census 2026-10-05)",
  "../aidream/apps/shared/chat/src/cx-chat/components/messages/AssistantMessage.tsx": "not mounted by a live route (census 2026-10-05)",
};

const RENDERS = /<(RichDocument|MarkdownStream|RichContent|EnhancedChatMarkdown)\b/;
const EDITS = /onContentChange=\{|<MarkdownSourceEditProvider\b|<MaybeSourceEdit\b/;
const WIRED = /<EditInPlace\b|<EditInPlaceText\b|useInPlaceTrigger\(|<InPlaceEditor\b/;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(full, out);
    } else if (entry.name.endsWith(".tsx") && !/\.(test|spec)\.tsx$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

export function unwiredEditableHosts(root: string, dirs: readonly string[], exempt: Record<string, string>): string[] {
  const out: string[] = [];
  for (const dir of dirs) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      if (exempt[rel]) continue;
      const src = fs.readFileSync(file, "utf8");
      if (RENDERS.test(src) && EDITS.test(src) && !WIRED.test(src)) out.push(rel);
    }
  }
  return out.sort();
}

describe("every editable rendered rich-content host offers edit in place", () => {
  test.each(REQUIRED)("%s is wired to edit in place", (rel) => {
    expect(WIRED.test(fs.readFileSync(path.join(ROOT, rel), "utf8"))).toBe(true);
  });

  test("no editable rendered host is left without edit in place", () => {
    const offenders = unwiredEditableHosts(ROOT, SCAN_DIRS, EXEMPT);
    if (offenders.length) {
      throw new Error(
        "Rendered rich content with an edit path has no edit in place. Wrap the render in " +
          "<EditInPlace value canEdit write> (components/rich-editor/in-place/EditInPlace.tsx), " +
          `or list it in EXEMPT with the reason:\n  ${offenders.join("\n  ")}`,
      );
    }
  });

  test("no stale exemption (the file exists and is still an unwired editable host)", () => {
    const stale = Object.keys(EXEMPT).filter((rel) => {
      const file = path.join(ROOT, rel);
      if (!fs.existsSync(file)) return true;
      const src = fs.readFileSync(file, "utf8");
      return !(RENDERS.test(src) && EDITS.test(src)) || WIRED.test(src);
    });
    expect(stale).toEqual([]);
  });

  test("the detector goes red on a planted editable host and green once wired (self-proof)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edit-in-place-hosts-"));
    const dir = path.join(tmp, "features/guides/components");
    fs.mkdirSync(dir, { recursive: true });
    const planted = path.join(dir, "GuideBody.tsx");
    fs.writeFileSync(planted, "export const G = ({ t, save }) => <RichDocument content={t} onContentChange={save} />;\n");
    expect(unwiredEditableHosts(tmp, ["features"], {})).toEqual(["features/guides/components/GuideBody.tsx"]);
    // Read-only render (no edit path) is not a host.
    fs.writeFileSync(planted, "export const G = ({ t }) => <RichDocument content={t} />;\n");
    expect(unwiredEditableHosts(tmp, ["features"], {})).toEqual([]);
    fs.writeFileSync(
      planted,
      "export const G = ({ t, save }) => <EditInPlace value={t} canEdit write={save}><RichDocument content={t} onContentChange={save} /></EditInPlace>;\n",
    );
    expect(unwiredEditableHosts(tmp, ["features"], {})).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
