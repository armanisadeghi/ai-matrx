"use client";

/**
 * Inline Agent Editing — live proof of the WidgetHandle wire.
 *
 * An editable surface wrapped in `EditableContextMenu` automatically registers
 * a WidgetHandle (built from the SAME callbacks it already passes the menu),
 * and every agent launched from the menu receives `runtime.widgetHandleId` —
 * so the agent can stream `widget_text_replace` / `widget_text_patch` /
 * insert / prepend / append tool calls that edit this textarea IN PLACE while
 * the response streams.
 *
 * How to test:
 *   1. Right-click the textarea → Agents → pick any agent.
 *   2. Ask it to edit the content (e.g. "fix the typos in my content", or
 *      explicitly: "use widget_text_patch to replace 'teh' with 'the'").
 *   3. Watch the textarea update live and every applied edit land in the log.
 *
 * No XML protocol, no bespoke parser — this is the canonical client-tool
 * delegation channel (see features/agents/types/widget-handle.types.ts and
 * CLIENT_SIDE_TOOLS.md), the same one SmartCodeEditor uses.
 */

import { useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";

const INITIAL = `Teh context menu is teh fastest path to everything teh system can do.

Try asking an agent to fix teh typos in this paragraph, to append a summary
line, or to replace this whole draft with something better. Every edit lands
here live, while teh response streams.`;

interface EditLogEntry {
  at: string;
  kind: string;
  preview: string;
}

export default function InlineEditDemoPage() {
  const [value, setValue] = useState(INITIAL);
  const [log, setLog] = useState<EditLogEntry[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const record = (kind: string, text: string) => {
    setLog((prev) => [
      {
        at: new Date().toLocaleTimeString(),
        kind,
        preview: text.length > 80 ? `${text.slice(0, 80)}…` : text,
      },
      ...prev,
    ]);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-primary" />
            <h1 className="text-lg font-semibold">Inline Agent Editing</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Right-click the textarea → Agents → pick one → ask it to edit the
            content (&ldquo;fix the typos&rdquo;). The agent streams{" "}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
              widget_text_*
            </code>{" "}
            tool calls that are applied to the field live; each applied edit is
            logged below. Zero wiring beyond the callbacks this surface already
            passes the menu.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Editable surface (live)
            </h2>
            {/* No insert overrides on purpose: widget_text_insert_before/
                after are CURSOR-relative by contract, and the handle's field
                fallback (native setter + input event) applies them at the
                caret while still updating this controlled component via
                onChange below. onTextReplace covers full-content ops
                (replace / prepend / append / patch). */}
            <EditableContextMenu
              sourceFeature="code-editor"
              getTextarea={() => textareaRef.current}
              onTextReplace={(next) => {
                setValue(next);
                record("replace (full content)", next);
              }}
              contextData={{ content: value }}
            >
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => {
                  const next = e.target.value;
                  // A programmatic input event (agent cursor-insert) lands
                  // here too — log it as an edit when it wasn't typed.
                  if (
                    Math.abs(next.length - value.length) > 1 &&
                    document.activeElement !== textareaRef.current
                  ) {
                    record("insert (at cursor)", next);
                  }
                  setValue(next);
                }}
                spellCheck={false}
                className="min-h-[320px] w-full rounded-md border border-border bg-card p-3 text-[16px] leading-relaxed outline-none focus:ring-2 focus:ring-primary"
              />
            </EditableContextMenu>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Applied edits ({log.length})
            </h2>
            <div className="min-h-[320px] rounded-md border border-border bg-card p-2 space-y-1.5 overflow-auto">
              {log.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1 py-2">
                  No edits applied yet. Launch an agent from the right-click
                  menu and ask it to change the text.
                </p>
              ) : (
                log.map((entry, i) => (
                  <div
                    key={`${entry.at}-${i}`}
                    className="rounded border border-border/60 bg-muted/30 px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-primary">
                        {entry.kind}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {entry.at}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground break-all">
                      {entry.preview}
                    </p>
                  </div>
                ))
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/80">
              Whole-content operations (prepend / append / patch) arrive here
              as a full replace — the handle computes the new content and
              writes it through <code>onTextReplace</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
