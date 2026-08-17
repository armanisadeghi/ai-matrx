"use client";

/**
 * features/marketing/competitors/LandscapeBriefCard.tsx
 *
 * Stage 1 of THE STAGED-CONFIDENCE PATTERN, on screen (FEATURE.md §8d).
 *
 * What this surface has to get right, and why each part is here:
 *   - It shows the agent's OWN certainty, 1-5, because a 5 and a 2 deserve
 *     different amounts of the reader's attention and only the agent knows which
 *     it wrote.
 *   - It shows the SERVICE LINES with a footprint each, because market overlap
 *     is a property of (service line x geography) — All Green is national for
 *     ITAD and local for small-business pickup, and a national rival in one is
 *     not a competitor in the other.
 *   - It says the review deadline is NOT a wait: "the system doesn't wait around
 *     for the user to accept it." A UI that implies work is blocked on the
 *     reader is lying about how the pipeline behaves.
 *   - The correction box is free text. "I think it's more like 30 miles" is the
 *     whole point; a form field would destroy it.
 */

import { useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import type { CompetitorSite } from "./data";
import {
  generateLandscapeBrief,
  loadLandscapeBrief,
  openQuestionsOf,
  reviewDeadlineNote,
  ruleOnLandscapeBrief,
  serviceLinesOf,
  type LandscapeBriefRow,
} from "./landscapeBrief";

function ConfidenceDots({ score }: { score: number | null }) {
  if (!score) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={`The analyst rates its own certainty ${score} out of 5`}
    >
      <span className="text-xs text-muted-foreground">How sure we are</span>
      <span className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={
              step <= score
                ? "size-1.5 rounded-full bg-primary"
                : "size-1.5 rounded-full bg-muted-foreground/25"
            }
          />
        ))}
      </span>
      <span className="text-xs font-medium text-foreground">{score}/5</span>
    </span>
  );
}

export function LandscapeBriefCard({
  site,
  onGuidanceSaved,
}: {
  site: CompetitorSite | null;
  onGuidanceSaved?: () => Promise<void> | void;
}) {
  const dispatch = useAppDispatch();
  const [brief, setBrief] = useState<LandscapeBriefRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"generate" | "save" | null>(null);
  const [correction, setCorrection] = useState("");

  useEffect(() => {
    if (!site) {
      setBrief(null);
      return;
    }
    let alive = true;
    setLoading(true);
    void loadLandscapeBrief(site.id)
      .then((row) => {
        if (!alive) return;
        setBrief(row);
        setCorrection(row?.guidance ?? "");
      })
      .catch((error) => {
        console.error("[landscape-brief] load failed", error);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [site]);

  const refresh = async () => {
    if (!site) return;
    const row = await loadLandscapeBrief(site.id);
    setBrief(row);
    setCorrection(row?.guidance ?? "");
  };

  const generate = async () => {
    if (!site) return;
    setBusy("generate");
    try {
      await generateLandscapeBrief(site.id, dispatch);
      await refresh();
      toast.success("We worked out what this business is. Have a look.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not build the brief",
      );
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!site || !brief || !correction.trim()) return;
    setBusy("save");
    try {
      const result = await ruleOnLandscapeBrief(brief, correction.trim());
      if (result.status === "conflict") {
        // Never silently overwrite: someone else corrected this brief while it
        // was open, and their words matter as much as these.
        setBrief(result.currentRow);
        toast.error(
          "Someone else corrected this while you were typing. Their version is now on screen — add yours to it and save again.",
        );
        return;
      }
      if (result.status === "not_found") {
        toast.error("This brief no longer exists. Work it out again.");
        await refresh();
        return;
      }
      setBrief(result.row);
      setCorrection(result.row.guidance ?? "");
      await onGuidanceSaved?.();
      toast.success("Saved. Everything we run from here uses your words.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save your corrections",
      );
    } finally {
      setBusy(null);
    }
  };

  if (!site) return null;

  const serviceLines = serviceLinesOf(brief);
  const questions = openQuestionsOf(brief);
  const deadline = reviewDeadlineNote(brief);

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm">
            What we think this business is
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Everything else we do for {site.domain} is built on this. Correct
            anything that is wrong — it takes a sentence.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ConfidenceDots score={brief?.agent_confidence ?? null} />
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={busy !== null || loading}
            onClick={() => void generate()}
          >
            {busy === "generate" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : brief ? (
              <RefreshCw className="size-3.5" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {brief ? "Redo" : "Work it out"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">
            <SuspenseLoader
              centered={false}
              message="Loading competitor landscape…"
            />
          </p>
        ) : !brief ? (
          <p className="text-sm text-muted-foreground">
            Nothing established yet. Work it out first — competitor judgments
            made without it are guesses about your service area and your
            customer.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={brief.status === "confirmed" ? "default" : "outline"}
              >
                {brief.status === "confirmed"
                  ? "You confirmed this"
                  : brief.status === "auto_accepted"
                    ? "In use, never reviewed"
                    : "Waiting on you"}
              </Badge>
              {brief.confidence_reason ? (
                <span className="text-xs text-muted-foreground">
                  {brief.confidence_reason}
                </span>
              ) : null}
            </div>

            {brief.brief_markdown ? (
              <div className="rounded-lg border bg-card p-3">
                <BasicMarkdownContent
                  content={brief.brief_markdown}
                  showCopyButton={false}
                />
              </div>
            ) : null}

            {serviceLines.length > 1 ? (
              <div className="space-y-1.5">
                <Label>Your services reach different distances</Label>
                <p className="text-xs text-muted-foreground">
                  This is the part that decides who counts as a competitor. A
                  national rival in one of these is not a rival in another.
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {serviceLines.map((line) => (
                    <div key={line.name} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">{line.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {line.footprint_detail || line.footprint}
                      </p>
                      {line.customer_segment ? (
                        <p className="mt-1 text-xs">{line.customer_segment}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {questions.length ? (
              <div className="space-y-1.5">
                <Label>Questions for your review</Label>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {questions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="brief-correction">
                Anything we got wrong? Say it however you like
              </Label>
              <Textarea
                id="brief-correction"
                rows={3}
                value={correction}
                onChange={(event) => setCorrection(event.target.value)}
                placeholder="e.g. We do IT asset disposition anywhere in the country, but the small-business e-waste pickup is Southern California only."
              />
              <div className="flex items-center justify-between gap-3">
                {deadline ? (
                  <p className="text-xs text-muted-foreground">{deadline}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Every agent that runs after this reads what you wrote.
                  </p>
                )}
                <Button
                  size="sm"
                  className="shrink-0 gap-2"
                  disabled={busy !== null || !correction.trim()}
                  onClick={() => void save()}
                >
                  {busy === "save" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  That&apos;s right
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default LandscapeBriefCard;
