"use client";

// features/masterwork/kept-sources/KeptSourcePanel.tsx
//
// The container the reader's own header names: it answers the question the
// reader cannot, because it is a fact about the RULE and not about a source —
// IS THERE A KEPT ROW AT ALL?
//
// 🚨 THE ANSWER FOR EVERY RULE WRITTEN BEFORE 2026-09-17 IS NO, and saying so
// plainly is the whole point. Until that date every lane parsed its source in
// memory, wrote rules, and threw the source away. A rule from before then
// points at a source that is GONE, and the only honest screen is one that says
// the words are not recoverable — never an empty panel, which reads as "your
// source was blank", and never a dead link, which this platform forbids
// outright.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Archive } from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { KeptSourceReader } from "./KeptSourceReader";
import { getKeptSource } from "./service";
import { ruleQuotes } from "./ruleQuotes";
import type { KeptSource } from "./types";
import type { RulebookRule } from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type State =
  | { status: "loading" }
  | { status: "ready"; source: KeptSource }
  | { status: "absent" }
  | { status: "failed"; message: string };

export function KeptSourcePanel({
  rulebookId,
  sourceKey,
  rules,
  highlightRuleId,
}: {
  rulebookId: string;
  sourceKey: string;
  rules: RulebookRule[];
  highlightRuleId?: string | null;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getKeptSource(rulebookId, sourceKey)
      .then((source) => {
        if (cancelled) return;
        setState(source ? { status: "ready", source } : { status: "absent" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("[masterwork] kept source read failed", err);
        setState({
          status: "failed",
          message:
            "We couldn't open this source. Nothing of yours was lost — try again in a moment.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [rulebookId, sourceKey]);

  const rule = highlightRuleId
    ? (rules.find((r) => r.id === highlightRuleId) ?? null)
    : null;

  const back = (
    <Button variant="ghost" size="sm" asChild className="mb-3">
      <Link href={`/masterwork/${rulebookId}/sources/kept`}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        All kept material
      </Link>
    </Button>
  );

  if (state.status === "loading") {
    return (
      <div className="p-6">
        {back}
        <LoadingSpinner />
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="p-6">
        {back}
        <p className="text-sm text-muted-foreground">{state.message} <ErrorAlchemyMenu error={state.message} /></p>
      </div>
    );
  }

  if (state.status === "absent") {
    // The rule is real; its words are not here. Say which, and why.
    return (
      <div className="p-6">
        {back}
        <div className="rounded-md border border-border bg-card px-4 py-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <Archive className="h-4 w-4 text-muted-foreground" />
            These words weren&apos;t kept
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {rule ? (
              <>
                <span className="text-foreground">{rule.name}</span> was
                distilled before we started keeping raw material, so the source
                it came from was read and then discarded. The rule and its quote
                are still here — the surrounding words are not recoverable.
              </>
            ) : (
              <>
                This source was read before we started keeping raw material, so
                its words were discarded after the rules were drawn out of them.
                Anything captured from now on is kept in full.
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {back}
      <KeptSourceReader
        source={state.source}
        quotes={rule ? ruleQuotes(rule) : []}
        ruleName={rule?.name}
        ruleMissing={Boolean(highlightRuleId) && !rule}
      />
    </div>
  );
}
