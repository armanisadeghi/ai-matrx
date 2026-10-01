/**
 * @jest-environment jsdom
 *
 * A text shortcut launched from an editable surface's right-click menu puts
 * its answer BACK in place of the selection (reported on /notes 2026-10-01:
 * "Clean up webpage content" produced the right text in a dialog with Copy /
 * Pin / Continue in chat — and no way to write it into the note).
 *
 * Seam: the launch-scoped widget handle the menu registers (what the run's
 * conversation carries as `widgetHandleId`) → the result's action bar (the ONE
 * rich-document action registry every display mode renders). Red on the tree
 * before the fix: there is no `replace-selection` / `insert-below` action and
 * the launch handle carries no write-back.
 */

import "@/features/rich-document/actions/handlers";
import { getAction, resolveActions } from "@/features/rich-document/actions/provider";
import { chatContext } from "@/features/rich-document/test-utils/chatContext";
import type { RichDocumentActionContext } from "@/features/rich-document/types";
import {
  deriveClientToolsFromHandle,
  type WidgetHandle,
} from "@/features/agents/types/widget-handle.types";
import { callbackManager } from "@/utils/callbackManager";
import { buildEditableWidgetHandle } from "../utils/widget-handle";
import {
  buildSelectionWriteBack,
  registerLaunchWidgetHandle,
} from "../utils/selection-write-back";

const JUNK = "Skip to main content | Patient portal | Cookie settings";
const CLEAN = "Patient portal";

function noteField(): { el: HTMLTextAreaElement; writes: string[] } {
  const el = document.createElement("textarea");
  el.value = `# Clinic\n${JUNK}\nHours: 9-5`;
  document.body.appendChild(el);
  const start = el.value.indexOf(JUNK);
  el.setSelectionRange(start, start + JUNK.length);
  const writes: string[] = [];
  return { el, writes };
}

function launchFrom(el: HTMLTextAreaElement, writes: string[]): string {
  // The surface's full-content contract: onTextReplace receives the WHOLE value.
  const onTextReplace = (next: string) => {
    writes.push(next);
    el.value = next;
  };
  const surfaceId = callbackManager.registerWidgetHandle(
    buildEditableWidgetHandle({ getTextarea: () => el, onTextReplace })!,
  );
  const writeBack = buildSelectionWriteBack({
    originalText: JUNK,
    textSource: "selection",
    selectionRange: {
      type: "editable",
      element: el,
      start: el.selectionStart,
      end: el.selectionEnd,
    },
    onTextReplace,
  });
  return registerLaunchWidgetHandle(surfaceId, writeBack)!;
}

function answerCtx(handleId: string | null): RichDocumentActionContext {
  const base = chatContext("assistant", { content: CLEAN });
  const inner = base.getState as () => Record<string, unknown>;
  return {
    ...base,
    getState: (() => ({
      ...inner(),
      instanceUIState: {
        byConversationId: { "conv-1": { widgetHandleId: handleId } },
      },
    })) as never,
  };
}

const ids = (ctx: RichDocumentActionContext) =>
  resolveActions(ctx).map((a) => a.id);

describe("an AI result launched from an editor can be written back", () => {
  it("offers Replace and Insert below on the answer, and Replace rewrites only the selection", async () => {
    const { el, writes } = noteField();
    const ctx = answerCtx(launchFrom(el, writes));

    expect(ids(ctx)).toEqual(
      expect.arrayContaining(["replace-selection", "insert-below"]),
    );

    await getAction("replace-selection")!.run(ctx);
    expect(writes.at(-1)).toBe(`# Clinic\n${CLEAN}\nHours: 9-5`);

    // Replace again is a no-op re-apply, never a second splice.
    await getAction("replace-selection")!.run(ctx);
    expect(el.value).toBe(`# Clinic\n${CLEAN}\nHours: 9-5`);

    await getAction("insert-below")!.run(ctx);
    expect(el.value).toBe(`# Clinic\n${CLEAN}\n\n${CLEAN}\nHours: 9-5`);
  });

  it("still finds the text after edits above it move it", async () => {
    const { el, writes } = noteField();
    const ctx = answerCtx(launchFrom(el, writes));
    el.value = `Intro line\n${el.value}`;
    await getAction("replace-selection")!.run(ctx);
    expect(el.value).toBe(`Intro line\n# Clinic\n${CLEAN}\nHours: 9-5`);
  });

  it("keeps the model's widget_* tools on the launch handle", () => {
    const { el, writes } = noteField();
    const id = launchFrom(el, writes);
    const handle = callbackManager.get<WidgetHandle>(id);
    expect(deriveClientToolsFromHandle(handle)).toEqual(
      expect.arrayContaining(["widget_text_replace", "widget_text_insert_after"]),
    );
  });

  it("is absent on an answer whose run was not launched from an editor", () => {
    expect(ids(answerCtx(null))).not.toContain("replace-selection");
    expect(ids(chatContext("assistant"))).not.toContain("insert-below");
  });
});
