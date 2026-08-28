"use client";

/**
 * 3. DISCOVERED MANDATES — a capability that exists NOWHERE today.
 *
 * The harvest gap list, items 5 and 6: no surface admin page, hub page or
 * domain door can answer *"which discovered mandates would appear here, and
 * why"*, and *"a place may explicitly exclude"* has no mechanism and no
 * management surface at all.
 *
 * This panel answers both, and shows its work. Availability = capability
 * (THE-MODEL law 3): a job appears here because every key it consumes has a
 * read/write path in this place — so every row lists WHICH keys matched and
 * what satisfied them. The exclusion valve is a per-place opt-out with a
 * reason, a date and a per-row restore. And the near-miss row is the same rule
 * read backwards: one key short, and the missing key is named.
 */

import { useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  EyeOff,
  GitBranch,
  Lightbulb,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Inert, Panel, RuleNote } from "./preview-chrome";
import {
  DISCOVERED_APPEARING,
  DISCOVERED_EXCLUDED,
  DISCOVERED_NEAR_MISS,
  KNOWN_VALUE_BY_ID,
  LAYER_META,
  type DiscoveredMandate,
} from "./mock-data";

function HolderChip({ mandate }: { mandate: DiscoveredMandate }) {
  const Icon = mandate.holder.type === "workflow" ? GitBranch : Bot;
  return (
    <Badge variant="outline" className="gap-1 text-[10px]">
      <Icon className="h-3 w-3" />
      {mandate.holder.name}
    </Badge>
  );
}

/** The evidence: every consumed key, and what in this place satisfies it. */
function MatchedKeys({
  mandate,
  showMisses,
}: {
  mandate: DiscoveredMandate;
  showMisses: boolean;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {mandate.consumed.map((c) => {
        const kv = c.knownValueId ? KNOWN_VALUE_BY_ID.get(c.knownValueId) : null;
        const matched = c.satisfiedByPlaceValue !== null;
        if (!matched && !showMisses) return null;
        return (
          <span
            key={c.key}
            title={
              matched
                ? `"${c.key}" resolves to this place's "${c.satisfiedByPlaceValue}"${
                    kv ? ` via known value ${kv.id}` : ""
                  }`
                : `"${c.key}" has no read path in this place — that is the only thing keeping the job off this page.`
            }
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono",
              matched
                ? kv
                  ? LAYER_META[kv.layer].className
                  : "border-border bg-muted text-foreground"
                : "border-destructive/40 bg-destructive/5 text-destructive",
            )}
          >
            {matched ? (
              <CheckCircle2 className="h-2.5 w-2.5" />
            ) : (
              <XCircle className="h-2.5 w-2.5" />
            )}
            {c.key}
            {matched && (
              <>
                <span className="opacity-60">→</span>
                <span className="opacity-80">{c.satisfiedByPlaceValue}</span>
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}

function MandateHeadline({ mandate }: { mandate: DiscoveredMandate }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="truncate font-mono text-xs text-foreground">
          {mandate.mandateKey}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {mandate.category}
        </Badge>
        {mandate.treatment !== "none" && (
          <Badge variant="outline" className="text-[10px]">
            {mandate.treatment}
          </Badge>
        )}
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {mandate.goal}
      </p>
    </div>
  );
}

export function DiscoveredMandatesPanel({ readOnly }: { readOnly: boolean }) {
  const [excludedIds, setExcludedIds] = useState<readonly string[]>(
    DISCOVERED_EXCLUDED.map((m) => m.id),
  );
  const [showExcluded, setShowExcluded] = useState(false);

  const restored = DISCOVERED_EXCLUDED.filter(
    (m) => !excludedIds.includes(m.id),
  );
  const stillExcluded = DISCOVERED_EXCLUDED.filter((m) =>
    excludedIds.includes(m.id),
  );
  const appearing = [...DISCOVERED_APPEARING, ...restored];

  return (
    <Panel
      eyebrow="3 · Jobs that find this place"
      title="Discovered mandates"
      count={
        <Badge
          variant="outline"
          className="text-[10px] tabular-nums border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        >
          Appears here ({appearing.length})
        </Badge>
      }
      actions={
        !readOnly ? (
          <Inert what="open the known-values registry admin">
            <Button variant="outline" size="sm" className="h-7 text-[11px]">
              Known values
            </Button>
          </Inert>
        ) : undefined
      }
    >
      <RuleNote>
        <b className="text-foreground">Nothing here names these jobs.</b> They
        appear because every key they consume has a read path in this
        place&rsquo;s manifest — availability <i>is</i> capability. Each row
        shows the keys that matched and what satisfied them, so &ldquo;why is
        this on my page?&rdquo; has an answer you can read.
      </RuleNote>

      <div className="divide-y divide-border">
        {appearing.map((m) => (
          <div key={m.id} className="px-3 py-2 hover:bg-accent/40">
            <div className="flex items-start justify-between gap-2">
              <MandateHeadline mandate={m} />
              <div className="flex shrink-0 items-center gap-1.5">
                <HolderChip mandate={m} />
                {/* The exclusion valve is NOT admin-only — it is per-place and
                    per-level, so a user can quiet a job on their own page
                    without an admin touching the system tier. */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    setExcludedIds((prev) =>
                      prev.includes(m.id) ? prev : [...prev, m.id],
                    )
                  }
                  title="Exclude this job from this place"
                >
                  <EyeOff className="h-3 w-3" />
                  Exclude
                </Button>
              </div>
            </div>
            <MatchedKeys mandate={m} showMisses={false} />
          </div>
        ))}
      </div>

      {/* --- the exclusion valve ---------------------------------------- */}
      <div className="border-t border-border">
        <button
          type="button"
          onClick={() => setShowExcluded((o) => !o)}
          aria-expanded={showExcluded}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/40"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              showExcluded && "rotate-180",
            )}
          />
          <span className="text-xs font-semibold text-foreground">
            Excluded
          </span>
          <Badge
            variant="outline"
            className="text-[10px] tabular-nums text-muted-foreground"
          >
            {stillExcluded.length}
          </Badge>
          <span className="ml-auto text-[10px] text-muted-foreground">
            a place may explicitly exclude — with a reason, and always reversible
          </span>
        </button>
        {showExcluded && (
          <div className="divide-y divide-border border-t border-border bg-muted/20">
            {stillExcluded.map((m) => (
              <div key={m.id} className="px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 opacity-70">
                    <MandateHeadline mandate={m} />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 shrink-0 gap-1 px-1.5 text-[10px]"
                    onClick={() =>
                      setExcludedIds((prev) => prev.filter((id) => id !== m.id))
                    }
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restore
                  </Button>
                </div>
                {m.excluded && (
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                    Excluded by {m.excluded.by} on {m.excluded.at} —{" "}
                    <i>{m.excluded.reason}</i>
                  </p>
                )}
              </div>
            ))}
            {stillExcluded.length === 0 && (
              <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                Nothing is excluded from this place.
              </p>
            )}
          </div>
        )}
      </div>

      {/* --- the near miss ---------------------------------------------- */}
      <div className="border-t border-border bg-amber-500/5 px-3 py-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          <Lightbulb className="h-3.5 w-3.5" />
          Would appear if…
        </p>
        {DISCOVERED_NEAR_MISS.map((m) => {
          const missing = m.consumed.filter(
            (c) => c.satisfiedByPlaceValue === null,
          );
          return (
            <div key={m.id} className="mt-1.5">
              <div className="flex items-start justify-between gap-2">
                <MandateHeadline mandate={m} />
                <HolderChip mandate={m} />
              </div>
              <MatchedKeys mandate={m} showMisses />
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                One key short. Declare{" "}
                {missing.map((c) => (
                  <code
                    key={c.key}
                    className="mx-0.5 rounded bg-muted px-1 font-mono text-foreground"
                  >
                    {c.key}
                  </code>
                ))}
                on this place — it is already in the code manifest but not
                supplied at runtime — and this job appears with no binding, no
                mapping and no further configuration.
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
