/**
 * Fact Checker — useAgentApp() hook contract reference.
 *
 * This is the same UX as fact-checker.tsx but written against the
 * Tier-3 idiomatic contract. Every prop the component receives is the
 * output of useAgentApp() — no separate `onExecute` callback, no
 * shaped `error` object. Variables flow through `setVariable`/
 * `submit({ variables })`; the conversation is hydrated by the hook.
 *
 * The legacy contract (onExecute, error: { type, message }, etc.) is
 * still passed alongside as compat aliases, so apps that haven't
 * migrated yet keep working — but new apps should follow this pattern.
 */
import React, { useState, useCallback, useMemo } from "react";
import {
  Loader2,
  Zap,
  ShieldCheck,
  Edit2,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import MarkdownStream from "@/components/MarkdownStream";

export default function FactCheckerHooked({
  // ── useAgentApp() output (Tier-3 contract) ─────────────────────────
  variables,
  setVariable,
  submit,
  response,
  isStreaming,
  isExecuting,
  error,
  agent,
}) {
  const claim = (variables?.claim ?? "") as string;
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showFullForm, setShowFullForm] = useState(true);

  const isFormValid = useMemo(
    () => (claim ?? "").trim().length >= 6,
    [claim],
  );
  const isBusy = isExecuting || isStreaming;

  const handleSubmit = useCallback(async () => {
    if (!isFormValid || isBusy) return;
    setHasSubmitted(true);
    setShowFullForm(false);
    await submit({ variables: { claim } });
  }, [claim, isFormValid, isBusy, submit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const claimPreview =
    claim.length > 100 ? claim.slice(0, 100).trim() + "…" : claim;

  return (
    <div className="max-w-2xl mx-auto px-4 pb-16">
      {!hasSubmitted && (
        <div className="pt-4 pb-8">
          <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-sky-100 dark:bg-sky-900/30 shrink-0">
              <ShieldCheck className="w-4.5 h-4.5 text-sky-600 dark:text-sky-400" />
            </div>
            {agent?.name ?? "Fact Checker"}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm max-w-sm leading-relaxed">
            Enter any claim for evidence-based analysis.
          </p>
        </div>
      )}

      {showFullForm && (
        <div className="space-y-3">
          <Textarea
            value={claim}
            onChange={(e) => setVariable("claim", e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`e.g. "Humans only use 10% of their brains."`}
            rows={4}
            disabled={isBusy}
            className="resize-none text-base leading-relaxed border-border focus-visible:ring-sky-500 placeholder:text-muted-foreground/50"
            autoFocus={!hasSubmitted}
          />

          {error && (
            <div className="flex items-start gap-2 px-1">
              <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive leading-snug">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="hidden sm:block text-xs text-muted-foreground/60 select-none">
              <kbd className="font-sans">Enter</kbd> to submit ·{" "}
              <kbd className="font-sans">Shift + Enter</kbd> for newline
            </p>
            <div className="sm:ml-auto" />
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid || isBusy}
              className="bg-sky-600 hover:bg-sky-700 text-white px-6"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Fact-Check This
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {hasSubmitted && !showFullForm && (
        <div className="flex items-start justify-between gap-3 py-4 border-b border-border mb-6">
          <p className="text-sm text-muted-foreground leading-snug line-clamp-2 min-w-0">
            <span className="font-medium text-foreground">Checking: </span>
            {claimPreview}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFullForm(true)}
            disabled={isBusy}
            className="shrink-0 text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
          >
            <Edit2 className="w-3 h-3 mr-1" />
            Edit
          </Button>
        </div>
      )}

      {(response || (hasSubmitted && isBusy)) && (
        <div className="bg-textured border-none shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Zap className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              Analysis
              {isStreaming && (
                <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                  Generating…
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            {response ? (
              <MarkdownStream content={response} isStreamActive={isStreaming} />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-sky-600 dark:text-sky-400" />
                <p className="text-sm text-muted-foreground">
                  Conducting truth analysis...
                </p>
              </div>
            )}
          </CardContent>
        </div>
      )}
    </div>
  );
}
