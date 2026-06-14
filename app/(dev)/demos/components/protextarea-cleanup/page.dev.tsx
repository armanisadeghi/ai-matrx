"use client";

/**
 * DEV demo for the EXPERIMENTAL ProTextareaWithCleanup.
 *
 * Trial surface for the "…" menu + AI "Clean up" popover added on top of the
 * canonical ProTextarea. The cleanup agent is the shared cleanup-surface
 * "clean" role default (overridable). The textarea content is NEVER mutated
 * until you click Apply.
 *
 * Route: /demos/components/protextarea-cleanup
 */

import { useState } from "react";
import { ProTextareaWithCleanup } from "@/components/official/experimental/protextarea-cleanup/ProTextareaWithCleanup";

const MESSY_SAMPLE =
  "so um basically what i wanted to say is that the the meeting went pretty good i think and we should probably like follow up with the client by next week maybe tuesday or wednesday and also dont forget to send over the the updated proposal which has the new pricing in it";

export default function ProTextareaWithCleanupDemoPage() {
  const [primary, setPrimary] = useState(MESSY_SAMPLE);
  const [gated, setGated] = useState(
    "Cleanup is disabled here — the menu shows only Copy.",
  );
  const [floating, setFloating] = useState("");
  const [growing, setGrowing] = useState("");

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-lg font-semibold text-foreground">
            ProTextarea + Cleanup (experimental)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hover a textarea to reveal the mic, then open the always-present
            <span className="mx-1 font-mono">…</span> menu. With cleanup
            enabled, &ldquo;Clean up&rdquo; sends the whole text to an agent and
            streams the result into a popover — Apply / Redo / Cancel. Your text
            stays untouched until you Apply.
          </p>
          <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Requires a signed-in session and a configured cleanup agent (the
            <span className="mx-1 font-mono">clean</span> role on
            <span className="mx-1 font-mono">
              matrx-user/transcripts-cleanup
            </span>
            ). If no agent resolves, the menu item is disabled.
          </p>
        </header>

        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-foreground">
            1. Cleanup enabled
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Pre-filled with messy dictation. Open the
            <span className="mx-1 font-mono">…</span> menu → Clean up.
          </p>
          <ProTextareaWithCleanup
            enableCleanup
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            minHeight={140}
            placeholder="Type or dictate something messy, then clean it up…"
          />
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-foreground">
            2. Cleanup disabled (gated off)
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Same component, <span className="font-mono">enableCleanup</span> not
            set — the menu offers only Copy.
          </p>
          <ProTextareaWithCleanup
            value={gated}
            onChange={(e) => setGated(e.target.value)}
            minHeight={100}
          />
        </section>

        <section className="mb-8 rounded-lg bg-card p-4">
          <h2 className="mb-2 text-sm font-medium text-foreground">
            3. Floating label + cleanup
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Inside a <span className="font-mono">bg-card</span> surface so the
            floating label masks correctly.
          </p>
          <ProTextareaWithCleanup
            enableCleanup
            floatingLabel="Notes"
            value={floating}
            onChange={(e) => setFloating(e.target.value)}
            minHeight={120}
          />
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-foreground">
            4. Auto-grow + submit + cleanup
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Grows with content; submit button at bottom-right; cleanup in the
            menu. The mic stays exactly where it always is.
          </p>
          <ProTextareaWithCleanup
            enableCleanup
            autoGrow
            minHeight={80}
            maxHeight={320}
            value={growing}
            onChange={(e) => setGrowing(e.target.value)}
            placeholder="Write a reply… (Cmd/Ctrl + Enter to send)"
            onSubmit={() => setGrowing("")}
            submitLabel="Send"
          />
        </section>
      </div>
    </div>
  );
}
