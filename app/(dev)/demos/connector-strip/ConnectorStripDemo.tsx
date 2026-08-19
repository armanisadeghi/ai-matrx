"use client";

import { useState } from "react";
import { ArrowUp, Paperclip } from "lucide-react";
import { ConnectorStrip } from "@/features/connectors/ConnectorStrip";
import { CONNECTORS, connectorsFor } from "@/features/connectors/registry";
import { cn } from "@/lib/utils";

/** A stand-in for the smart agent input, so the strip is judged in context. */
function FakeAgentInput({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2 shadow-sm">
      <div className="flex items-end gap-2">
        <textarea
          rows={2}
          placeholder="Ask anything…"
          className="min-h-[2.5rem] flex-1 resize-none bg-transparent text-base leading-snug text-foreground outline-none placeholder:text-muted-foreground/60 sm:text-sm"
          style={{ fontSize: "16px" }}
        />
        <button
          type="button"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"
          aria-label="Send"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2 border-t border-border/60 pt-1.5">
        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function Case({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-xs font-semibold text-foreground">{title}</h2>
        <p className="truncate text-[11px] text-muted-foreground">{note}</p>
      </div>
      {children}
    </section>
  );
}

const ALL_STRIP_IDS = connectorsFor("strip").map((c) => c.id);

export default function ConnectorStripDemo() {
  const [log, setLog] = useState<string[]>([]);
  const [live, setLive] = useState<string[]>([]);

  const raise = (id: string) =>
    setLog((prev) => [`onConnect("${id}")`, ...prev].slice(0, 8));

  const toggle = (id: string) =>
    setLive((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4">
      <header className="space-y-1">
        <h1 className="text-sm font-semibold text-foreground">
          Connector strip
        </h1>
        <p className="text-xs text-muted-foreground">
          One line under the agent input. Config-driven — every state below is
          the same component reading{" "}
          <code className="text-[11px]">features/connectors/registry.ts</code>.
        </p>
      </header>

      <Case title="Nothing connected" note="the first-run offer">
        <FakeAgentInput>
          <ConnectorStrip connectedIds={[]} onConnect={raise} />
        </FakeAgentInput>
      </Case>

      <Case
        title="Some connected"
        note="color = connected; Notion raises the shared MCP connect intent"
      >
        <FakeAgentInput>
          <ConnectorStrip connectedIds={["google-workspace"]} onConnect={raise} />
        </FakeAgentInput>
      </Case>

      <Case
        title="All connected"
        note="collapses to one muted door — never nags"
      >
        <FakeAgentInput>
          <ConnectorStrip
            resolveStatus={() => "connected"}
            onConnect={raise}
          />
        </FakeAgentInput>
      </Case>

      <Case
        title="All connected + hideWhenAllConnected"
        note="renders nothing at all"
      >
        <FakeAgentInput>
          <ConnectorStrip
            resolveStatus={() => "connected"}
            hideWhenAllConnected
            onConnect={raise}
          />
        </FakeAgentInput>
      </Case>

      <Case title="Compact variant" note="marks only, names live in the tooltip">
        <FakeAgentInput>
          <ConnectorStrip
            variant="compact"
            connectedIds={["gmail"]}
            onConnect={raise}
          />
        </FakeAgentInput>
      </Case>

      <Case title="Live" note="toggle a connection and watch the strip react">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {ALL_STRIP_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                className={cn(
                  "h-6 rounded-full border px-2 text-[11px] leading-none transition-colors",
                  live.includes(id)
                    ? "border-border bg-accent text-foreground"
                    : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {live.includes(id) ? "disconnect" : "connect"} {id}
              </button>
            ))}
          </div>
          <FakeAgentInput>
            <ConnectorStrip connectedIds={live} onConnect={raise} />
          </FakeAgentInput>
        </div>
      </Case>

      <Case
        title="Surface filter"
        note="the config decides where a provider may appear"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(["strip", "directory"] as const).map((surface) => (
            <div
              key={surface}
              className="rounded-lg border border-border bg-card p-2"
            >
              <div className="mb-1.5 text-[11px] font-semibold text-foreground">
                connectorsFor(&quot;{surface}&quot;)
              </div>
              <ul className="space-y-1">
                {connectorsFor(surface).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                  >
                    <c.logo className="h-3 w-3" />
                    <span className="text-foreground">{c.name}</span>
                    <span className="truncate">{c.blurb}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {CONNECTORS.length} in the catalogue ·{" "}
          {connectorsFor("strip").length} earn a slot under the input · Google
          Search Console is directory-only (connectable today, just too niche
          for the strip).
        </p>
      </Case>

      <Case title="Raised intents" note="the strip owns no connect logic">
        <div className="rounded-lg border border-border bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
          {log.length === 0 ? (
            <span className="text-muted-foreground/60">
              click a connector chip above…
            </span>
          ) : (
            log.map((line, i) => (
              <div key={`${line}-${i}`} className={i === 0 ? "text-foreground" : undefined}>
                {line}
              </div>
            ))
          )}
        </div>
      </Case>
    </div>
  );
}
