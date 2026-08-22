"use client";

/**
 * The explainer that leads the dimension manager.
 *
 * THE MISMATCH RULE (USER.md): the person on this screen is a world-class
 * expert in THEIR business and knows nothing about taxonomies, facets, enums
 * or classifiers. So this panel never says "facet", "taxonomy", "enum" or
 * "cardinality" — it says what a dimension DOES for them, once, with a real
 * worked example from a real business (IT asset disposition, where "CRT" and
 * "Television" mean a money-losing consumer pickup and "Server" means an
 * enterprise account). Somebody who reads this should be able to name their
 * own first dimension before they finish it.
 */

import { useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { cn } from "@/styles/themes/utils";

const EXAMPLE_VALUES: Array<{ label: string; identity: string; meaning: string }> = [
  {
    label: "CRT monitor",
    identity: "crt",
    meaning:
      "One old tube monitor from a garage. Costs you money to take. You never want to rank for it.",
  },
  {
    label: "Television",
    identity: "television",
    meaning:
      "A consumer drop-off. Same story — a job you lose money on, dressed up as demand.",
  },
  {
    label: "Server",
    identity: "server",
    meaning:
      "A data centre decommission. One of these is worth a year of the other two.",
  },
];

export function WhatIsADimension({
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
      >
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            What a dimension is, and why you would add one
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
            A dimension is one question you want asked about every search term
            your customers type — and the only answers allowed.
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border px-3 py-3">
          <p className="text-xs leading-5 text-muted-foreground">
            Every keyword this site sees gets sorted by the dimensions below.
            The point is that the sorting is <em>yours</em>, and it is fixed. If
            nobody writes the question and the allowed answers down, the AI
            invents its own labels every time it runs — a different set today
            than tomorrow, decided in its head, with you never asked. Write them
            here once and every classification, every rule, and every report
            speaks the same language forever.
          </p>

          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              A real one
            </p>
            <p className="mt-1.5 text-xs leading-5 text-foreground">
              An IT-asset-disposition company gets thousands of searches that
              all look like &ldquo;electronics recycling near me&rdquo;. The
              money is not in the words — it is in{" "}
              <span className="font-semibold">what the person has</span>. So
              they add a dimension called{" "}
              <span className="font-semibold">Equipment class</span>, and they
              allow exactly three answers:
            </p>
            <ul className="mt-2.5 space-y-2">
              {EXAMPLE_VALUES.map((value) => (
                <li
                  key={value.identity}
                  className="flex flex-col gap-0.5 rounded-md border border-border bg-card px-2.5 py-2 sm:flex-row sm:items-baseline sm:gap-3"
                >
                  <span className="shrink-0 text-xs font-semibold text-foreground">
                    {value.label}
                  </span>
                  <span className="min-w-0 text-[11px] leading-4 text-muted-foreground">
                    {value.meaning}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-xs leading-5 text-muted-foreground">
              From then on, &ldquo;CRT recycling&rdquo; and &ldquo;server
              decommission&rdquo; can never be treated as the same demand again
              — not by a person, not by an agent, not by a report.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-border px-2.5 py-2">
              <p className="text-[11px] font-semibold text-foreground">
                Shared dimensions
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                Facts that mean the same thing for every business — is it a
                question or a purchase, is it local, is it urgent. They are kept
                identical everywhere so results can be compared across sites, so
                you can read them but not rename them.
              </p>
            </div>
            <div className="rounded-md border border-border px-2.5 py-2">
              <p className="text-[11px] font-semibold text-foreground">
                Your dimensions
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                The ones only your business needs. You name them, you write the
                allowed answers, you say what each one means. Nobody else&rsquo;s
                site is touched, and no engineer is involved.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
