"use client";

/**
 * UnifiedAgentContextMenu — Scenario Matrix
 *
 * Five live panels, each pinning a different combination of:
 *   - addedContexts / excludedContexts
 *   - placementMode ("show" | "hide" | "disable" per placement)
 *   - isEditable vs read-only
 *   - contextData shape (content, context, custom keys)
 *
 * Use this page to verify behavioral deltas at a glance:
 *   1. Correct shortcuts show up given a context filter configuration
 *   2. Hidden placements really disappear, disabled ones are greyed out
 *   3. A launched shortcut receives the expected applicationScope
 *      (selection, text_before, text_after, content, context, custom keys)
 *
 * If shortcuts don't show up the way you expect, jump to the Diagnostic
 * Lab at /ssr/context-menu/lab — that page exposes the raw view output,
 * Redux state, hook output, and a forced refresh of the unified menu.
 */

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CodeEditorDemoPanel } from "../_components/CodeEditorDemoPanel";

// Dynamic — never bundles into the initial chunk; hooks + menu body load
// only when this page actually needs them.
const UnifiedAgentContextMenu = dynamic(
  () =>
    import("@/features/context-menu-v2/UnifiedAgentContextMenu").then((m) => ({
      default: m.UnifiedAgentContextMenu,
    })),
  { ssr: false },
);

export default function ContextMenuScenariosPage() {
  // ── Panel 2: Editable content editor — content-editor + general ─────────
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const [contentValue, setContentValue] = useState(
    `Panel 2 — editable content editor.\nThis panel exposes content-editor + general shortcuts.\nNotice Content Blocks remain visible because we're editable.`,
  );

  // ── Panel 3: Read-only block — hides content-block + quick-action ───────
  const [readonlyValue] = useState(
    `Panel 3 — read-only block.\nContent Blocks and Quick Actions are HIDDEN here.\nOnly the AI-action submenus for general + content-editor remain.`,
  );

  // ── Panel 4: Restrictive filter — explicit addedContexts API ───────────
  const restrictiveInitial = `// Same /code context shape as panel 1, but general shortcuts\n// are excluded via explicit addedContexts/excludedContexts (not contextFilter).\nfunction greet(name: string): number {\n  return "Hello, " + name;\n}\n`;

  // ── Panel 5: Showcase of "disable" mode ─────────────────────────────────
  const [showcaseValue, setShowcaseValue] = useState(
    `Panel 5 — disable showcase.\nContent Blocks are DISABLED (greyed, unclickable).\nOrganization Tools are also DISABLED.\nAI Actions remain fully enabled.`,
  );
  const showcaseRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b border-border bg-card/50 px-3 py-1.5 flex-shrink-0">
        <p className="text-[11px] text-muted-foreground">
          Right-click in any panel. Each panel pins a different combination of
          contexts and placement modes. Watch the dev console for fetch logs.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {/* ── 1 ── Code editor (production /code wiring) */}
        <CodeEditorDemoPanel
          title="1. Code editor"
          description={
            <>
              Mirrors <code>CodeWorkspaceContextMenu</code>:{" "}
              <code>surfaceName=matrx-user/code-editor</code>,{" "}
              <code>contextFilter=code-editor</code>, full <code>vsc_*</code>{" "}
              keys, AI Actions + org/user tools only (no content blocks / quick
              actions).
            </>
          }
          minHeightClass="min-h-[220px]"
        />

        {/* ── 2 ── Editable content editor */}
        <section className="flex flex-col gap-2">
          <header>
            <h2 className="text-sm font-semibold">
              2. Content editor (editable)
            </h2>
            <p className="text-[11px] text-muted-foreground">
              addedContexts: <code>{`['content-editor']`}</code>
              <br />
              excludedContexts: none
              <br />
              placements: all show
            </p>
          </header>
          <UnifiedAgentContextMenu
            sourceFeature="demo"
            getTextarea={() => contentRef.current}
            onTextReplace={(v) => setContentValue(v)}
            onTextInsertBefore={(t) => setContentValue(t + contentValue)}
            onTextInsertAfter={(t) => setContentValue(contentValue + t)}
            isEditable
            addedContexts={["content-editor"]}
            contextData={{
              content: contentValue,
              context: "panel-2-content",
            }}
            scope="user"
          >
            <textarea
              ref={contentRef}
              value={contentValue}
              onChange={(e) => setContentValue(e.target.value)}
              className="flex-1 min-h-[220px] w-full rounded-md border border-border bg-card p-3 text-[16px] outline-none focus:ring-2 focus:ring-primary"
            />
          </UnifiedAgentContextMenu>
        </section>

        {/* ── 3 ── Read-only block */}
        <section className="flex flex-col gap-2">
          <header>
            <h2 className="text-sm font-semibold">3. Read-only paragraph</h2>
            <p className="text-[11px] text-muted-foreground">
              addedContexts: <code>{`['content-editor']`}</code>
              <br />
              placements:{" "}
              <code>{`{ content-block: 'hide', quick-action: 'hide' }`}</code>
            </p>
          </header>
          <UnifiedAgentContextMenu
            sourceFeature="demo"
            isEditable={false}
            addedContexts={["content-editor"]}
            placementMode={{
              "content-block": "hide",
              "quick-action": "hide",
            }}
            contextData={{
              content: readonlyValue,
              context: "panel-3-readonly",
            }}
            scope="user"
          >
            <div className="flex-1 min-h-[220px] w-full rounded-md border border-border bg-card p-3 text-[16px] leading-relaxed whitespace-pre-line">
              {readonlyValue}
            </div>
          </UnifiedAgentContextMenu>
        </section>

        {/* ── 4 ── Same filter via explicit addedContexts API */}
        <CodeEditorDemoPanel
          title="4. Code editor (explicit filter API)"
          description={
            <>
              Identical shortcut filter to panel 1, but uses{" "}
              <code>addedContexts</code> + <code>excludedContexts</code> instead
              of <code>contextFilter</code> in contextData. Still full{" "}
              <code>vsc_*</code> shape.
            </>
          }
          initialContent={restrictiveInitial}
          contextFilterMode="explicit"
          minHeightClass="min-h-[220px]"
        />

        {/* ── 5 ── Disable showcase */}
        <section className="flex flex-col gap-2">
          <header>
            <h2 className="text-sm font-semibold">5. Disable showcase</h2>
            <p className="text-[11px] text-muted-foreground">
              placements:{" "}
              <code>{`{ content-block: 'disable', organization-tool: 'disable' }`}</code>
              <br />
              Both submenus render but are greyed out.
            </p>
          </header>
          <UnifiedAgentContextMenu
            sourceFeature="demo"
            getTextarea={() => showcaseRef.current}
            onTextReplace={(v) => setShowcaseValue(v)}
            isEditable
            addedContexts={["content-editor"]}
            placementMode={{
              "content-block": "disable",
              "organization-tool": "disable",
            }}
            contextData={{
              content: showcaseValue,
              context: "panel-5-showcase",
            }}
            scope="user"
          >
            <textarea
              ref={showcaseRef}
              value={showcaseValue}
              onChange={(e) => setShowcaseValue(e.target.value)}
              className="flex-1 min-h-[220px] w-full rounded-md border border-border bg-card p-3 text-[16px] outline-none focus:ring-2 focus:ring-primary"
            />
          </UnifiedAgentContextMenu>
        </section>

        {/* ── 6 ── Expected behavior cheatsheet */}
        <section className="flex flex-col gap-2">
          <header>
            <h2 className="text-sm font-semibold">Expected behavior</h2>
            <p className="text-[11px] text-muted-foreground">
              Use this as a quick visual diff against what you actually see.
            </p>
          </header>
          <div className="flex-1 min-h-[220px] w-full rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground leading-relaxed">
            <ol className="list-decimal ml-4 space-y-2">
              <li>
                Code editor — matches <code>/code</code> workspace: surface +
                vsc_* context + code-editor filter (no general shortcuts).
              </li>
              <li>
                Content editor — shows shortcuts tagged content-editor OR
                general.
              </li>
              <li>
                Read-only — hides Content Blocks and Quick Actions submenus.
              </li>
              <li>
                Code editor (explicit API) — same shortcut set as panel 1 via{" "}
                <code>addedContexts</code>/<code>excludedContexts</code>.
              </li>
              <li>
                Disable showcase — Content Blocks and Organization Tools
                submenus visible but greyed out.
              </li>
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}
