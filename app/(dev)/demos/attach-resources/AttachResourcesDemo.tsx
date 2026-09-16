"use client";

/**
 * The two kinds of connection, side by side, plus every state the chooser has.
 *
 * Why this page exists: the difference Arman asked for on 2026-09-15 —
 * "you are not differentiating between things that are just purely a
 * connection to an MCP and those that allow us to select something" — is a
 * VISUAL difference, and a visual difference is worth nothing if it is only
 * visible when a particular account happens to have a particular integration
 * connected. Here both kinds are drawn from the same payload shape a real
 * server sends, so the distinction can be judged in one glance, in light and
 * dark, at 1280px and at 375px.
 *
 * Everything below renders the REAL components against the REAL payload type.
 * The only thing supplied by this page is the payload itself — exactly what
 * aidream's availability response carries.
 */

import { useState } from "react";
import { ResourceAttachPicker } from "@/features/connectors/ResourceAttachPicker";
import {
  attachActionLabel,
  chatConnectionKind,
  type AttachableResource,
} from "@/features/connectors/attachable-resources";

interface DemoConnection {
  slug: string;
  name: string;
  attachable: AttachableResource[];
  attachedCount: number;
}

/** The three shapes the availability payload actually produces. */
const CONNECTIONS: DemoConnection[] = [
  {
    slug: "github",
    name: "GitHub",
    attachable: [
      {
        resource_type: "github_repository",
        source: "inventory",
        label: "repositories",
      },
    ],
    attachedCount: 2,
  },
  {
    slug: "google",
    name: "Google",
    attachable: [
      { resource_type: "google_drive_file", source: "live", label: "files" },
      { resource_type: "google_sheet", source: "live", label: "sheets" },
    ],
    attachedCount: 0,
  },
  {
    slug: "context7",
    name: "Context7",
    attachable: [],
    attachedCount: 0,
  },
];

export default function AttachResourcesDemo() {
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const open = CONNECTIONS.find((c) => c.slug === openProvider) ?? null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">
          Attachable connections
        </h1>
        <p className="text-sm text-muted-foreground">
          A connection you can choose things out of is not a connection you can
          only connect to. The difference below comes entirely from the
          server&apos;s <code className="text-xs">attachable</code> list — no
          provider is named anywhere in the deciding code.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          The chip, both kinds
        </h2>
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          {CONNECTIONS.map((connection) => {
            const kind = chatConnectionKind(connection.attachable);
            const label = attachActionLabel(connection.attachable);
            return (
              <div
                key={connection.slug}
                className="flex flex-wrap items-center gap-3 border-b border-border/50 py-2 last:border-b-0"
              >
                <span className="w-24 shrink-0 text-xs font-medium text-foreground">
                  {connection.name}
                </span>
                <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {kind}
                </span>
                {label ? (
                  <button
                    type="button"
                    onClick={() => setOpenProvider(connection.slug)}
                    className="rounded-full border border-border bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
                  >
                    {connection.attachedCount > 0
                      ? `${connection.attachedCount} attached · ${label}`
                      : label}
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    nothing to choose — the chip carries no chooser, because a
                    door onto nothing is a dead control
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          The chooser
        </h2>
        <p className="text-xs text-muted-foreground">
          Opening one below fetches real candidates from{" "}
          <code className="text-[11px]">/api/connections/resources</code>. Until
          aidream ships that endpoint the picker shows its honest failure state
          with the server&apos;s own sentence — which is itself worth looking
          at, because it is what a person sees when a provider is unreachable.
        </p>
        <div className="flex flex-wrap gap-2">
          {CONNECTIONS.filter((c) => c.attachable.length > 0).map(
            (connection) => (
              <button
                key={connection.slug}
                type="button"
                onClick={() => setOpenProvider(connection.slug)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
              >
                Open the {connection.name} chooser
              </button>
            ),
          )}
        </div>
      </section>

      {open && (
        <ResourceAttachPicker
          isOpen
          onClose={() => setOpenProvider(null)}
          provider={open.slug}
          providerName={open.name}
          attachable={open.attachable}
          alreadyAttachedRefs={[]}
          onAttach={async () => {
            setOpenProvider(null);
          }}
        />
      )}
    </div>
  );
}
