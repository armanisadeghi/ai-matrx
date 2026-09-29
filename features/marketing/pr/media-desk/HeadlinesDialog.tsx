"use client";

/**
 * Headlines — from an angle's stored facts (read on the server, never from the
 * page), or from the person's own list (a subject-line field, a release draft).
 * Candidates per format with the move and charge each uses, the pick per format
 * with its reason, and every subject line's characters counted in code against
 * the organization's limit (over-long lines are marked, never hidden).
 */

import { useState, type ReactNode } from "react";
import { Check, Heading } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import {
  writePressHeadlines,
  type HeadlineFormat,
  type HeadlineGroup,
  type HeadlinesResult,
  type Stage,
} from "./api";
import { StageList } from "./StageList";

export const FORMAT_LABELS: Record<HeadlineFormat, string> = {
  news: "News headline",
  press_release: "Press release",
  subject_line: "Pitch subject line",
  feature: "Feature",
};

export function HeadlineGroupView({
  group,
  onUse,
}: {
  group: HeadlineGroup;
  onUse?: (text: string) => void;
}) {
  return (
    <section className="rounded-md border border-border" data-testid={`headline-group-${group.format}`}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <h3 className="text-xs font-semibold text-foreground">{FORMAT_LABELS[group.format] ?? group.format}</h3>
        {group.limit ? (
          <span className="text-[10px] text-muted-foreground">{group.limit} characters or fewer</span>
        ) : null}
      </div>
      {group.pick ? (
        <div className="border-b border-border bg-primary/5 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Pick</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{group.pick.text}</p>
          {group.pick.why ? <p className="mt-0.5 text-[11px] text-muted-foreground">{group.pick.why}</p> : null}
          {onUse ? (
            <Button size="sm" variant="outline" className="mt-1.5 h-6 px-2 text-[10px]" onClick={() => onUse(group.pick!.text)}>
              <Check className="mr-1 h-3 w-3" aria-hidden /> Use this
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">No pick came back for this format.</p>
      )}
      <ul className="divide-y divide-border">
        {group.candidates.map((candidate) => (
          <li key={candidate.text} className="flex items-start justify-between gap-2 px-3 py-1.5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">{candidate.text}</p>
              <p className="text-[10px] text-muted-foreground">
                {[candidate.move, candidate.charge].filter(Boolean).join(" · ") || "No move named"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {group.limit ? (
                <Badge
                  variant={candidate.over_limit ? "destructive" : "outline"}
                  className="text-[10px] tabular-nums"
                  title={candidate.over_limit ? `Over the ${group.limit}-character limit` : "Characters"}
                >
                  {candidate.char_count}
                </Badge>
              ) : null}
              {onUse ? (
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => onUse(candidate.text)}>
                  Use
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HeadlinesResultView({
  result,
  onUse,
}: {
  result: HeadlinesResult;
  onUse?: (text: string, format: HeadlineFormat) => void;
}) {
  return (
    <div className="space-y-3" data-testid="headlines-result">
      {result.checks.length ? (
        <ul className="list-disc space-y-0.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 pl-6 text-[11px] text-muted-foreground">
          {result.checks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
      ) : null}
      {result.groups.map((group) => (
        <HeadlineGroupView
          key={group.format}
          group={group}
          onUse={onUse ? (text) => onUse(text, group.format) : undefined}
        />
      ))}
      {result.next_step ? (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Next: </span>
          {result.next_step}
        </p>
      ) : null}
      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer">The {result.facts.length} facts these were written from</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {result.facts.map((fact) => (
            <li key={fact.statement}>
              {fact.statement}
              {fact.source ? <span className="opacity-70"> — {fact.source}</span> : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function HeadlinesDialog({
  siteId,
  angleId = null,
  angleHeadline = null,
  angleFactCount = 0,
  defaultFormats = ["news", "subject_line"],
  onUse,
  trigger,
}: {
  siteId: string;
  angleId?: string | null;
  angleHeadline?: string | null;
  angleFactCount?: number;
  defaultFormats?: HeadlineFormat[];
  /** A host field (a subject line, a release title) takes the chosen line. */
  onUse?: (text: string, format: HeadlineFormat) => void;
  trigger?: ReactNode;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [formats, setFormats] = useState<HeadlineFormat[]>(defaultFormats);
  const [factsText, setFactsText] = useState("");
  const [peg, setPeg] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<HeadlinesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ownFacts = factsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const hasFacts = Boolean(angleId) || ownFacts.length > 0;

  const toggle = (format: HeadlineFormat, on: boolean) =>
    setFormats((prev) => (on ? [...new Set([...prev, format])] : prev.filter((f) => f !== format)));

  const run = async () => {
    setRunning(true);
    setStages([]);
    setResult(null);
    setError(null);
    try {
      const done = await writePressHeadlines(
        dispatch,
        siteId,
        { angle_id: angleId, facts: ownFacts, formats, peg: peg.trim() || null },
        { onStage: (stage) => setStages((prev) => [...prev, stage]) },
      );
      setResult(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running && !next) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="h-7 text-[11px]">
            <Heading className="mr-1 h-3 w-3" aria-hidden /> Headlines
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Headlines</DialogTitle>
          <DialogDescription>
            {angleId
              ? `Written only from the ${angleFactCount} stored facts of “${angleHeadline ?? "this angle"}”. Nothing is invented; a fact not on file never appears.`
              : "Written only from the facts you list. Nothing is invented."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-1 text-xs font-medium">Formats</legend>
            {(Object.keys(FORMAT_LABELS) as HeadlineFormat[]).map((format) => (
              <label key={format} className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={format === "news" || formats.includes(format)}
                  disabled={format === "news" || running}
                  onCheckedChange={(v) => toggle(format, v === true)}
                />
                {FORMAT_LABELS[format]}
                {format === "news" ? <span className="text-[10px] text-muted-foreground">(always)</span> : null}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-1">
            <Label htmlFor="headline-facts">{angleId ? "More facts (optional)" : "Facts, one per line"}</Label>
            <Textarea
              id="headline-facts"
              value={factsText}
              onChange={(e) => setFactsText(e.target.value)}
              rows={angleId ? 2 : 5}
              placeholder="Each line one confirmed fact, with its source if you have it."
              disabled={running}
              className="text-base sm:text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="headline-peg">Live story this rides (optional)</Label>
            <Input
              id="headline-peg"
              value={peg}
              onChange={(e) => setPeg(e.target.value)}
              placeholder="e.g. Recycling plant fires hit a record in August (Resource Recycling, 2026-09-23)"
              disabled={running}
              className="text-base sm:text-sm"
            />
          </div>
          <StageList stages={stages} running={running} />
          {error ? (
            <div className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              <span>{error}</span>
              <ErrorAlchemyMenu error={error} />
            </div>
          ) : null}
          {result ? (
            <HeadlinesResultView
              result={result}
              onUse={
                onUse
                  ? (text, format) => {
                      onUse(text, format);
                      setOpen(false);
                    }
                  : undefined
              }
            />
          ) : null}
        </div>

        <DialogFooter className={cn("gap-2", result ? "sm:justify-between" : "")}>
          {result ? (
            <CopyButtons
              size="sm"
              label="Headlines"
              human={() =>
                result.groups
                  .map(
                    (g) =>
                      `${FORMAT_LABELS[g.format]}\nPick: ${g.pick?.text ?? "none"}\n${g.candidates.map((c) => `- ${c.text}`).join("\n")}`,
                  )
                  .join("\n\n")
              }
              json={() => result}
            />
          ) : null}
          <Button onClick={() => void run()} disabled={!hasFacts || running}>
            {running ? "Writing…" : result ? "Write again" : "Write headlines"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
