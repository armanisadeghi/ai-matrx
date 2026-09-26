"use client";

/**
 * AttentionQueue (/commerce/attention) — the one list of things a human must
 * see NOW: open recall-audit disagreements (the skeptic vs the original),
 * escalations (above the value-delta threshold), and high-impact open
 * unknowns. Every row opens its asset (no dead ends); recall rows take the
 * verdict inline.
 */

import React, { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, HelpCircle, Inbox, Loader2, Scale } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { toast } from "@/lib/toast";

import type { AttentionItem, RecallVerdict } from "../types";
import { listAttentionQueue, recordRecallVerdict } from "../service";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function AttentionQueue() {
  // THE ACTIVE ORGANIZATION, NEVER AN "EFFECTIVE" ONE — this read the
  // personal-org fallback, so an unselected picker silently reviewed the
  // PERSONAL workspace's rows (and wrote verdicts against them).
  const organizationId = useAppSelector(selectOrganizationId);
  // "No org yet" is not "no org": until the bootstrap resolves, loading is the
  // truth and the picker must not flash over a screen that is about to fill.
  // 🚨 THE FOURTH STATE IS NOT THE REFUSAL (R37). `orgBootstrapResolved` is
  // set TRUE by `setOrgBootstrapFailure` as well, so "resolved and still no
  // id" was ALSO the failed read — and this screen told a member of thirteen
  // organizations to pick one. The gate's discriminant separates them and the
  // ONE notice renders each, the failed one with its Retry.
  const { organizationState } = useOrganizationRequired();
  const organizationUnanswered =
    organizationState === "required" || organizationState === "unavailable";
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    // Fresh load (org change / retry): drop stale rows and any prior error.
    setItems(null);
    setLoadError(null);
    listAttentionQueue(organizationId)
      .then((rows) => {
        if (!cancelled) {
          setItems(rows);
          setLoadError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setLoadError(
            e instanceof Error ? e.message : "Could not load the queue.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, reloadKey]);

  const retryLoad = () => {
    setItems(null);
    setLoadError(null);
    setReloadKey((k) => k + 1);
  };

  const verdict = async (item: AttentionItem, v: RecallVerdict) => {
    try {
      await recordRecallVerdict(item.id, v);
      setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
      toast.success("Verdict recorded.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not record the verdict.");
    }
  };

  if (organizationUnanswered)
    // The canonical honest state — the refusal carries the picker and the
    // failed read carries Retry, so neither is a dead end.
    return (
      <OrganizationContextNotice
        state={organizationState}
        title="The attention queue needs an organization"
      />
    );
  if (loadError)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="px-6 text-center text-sm text-destructive">{loadError} <ErrorAlchemyMenu error={loadError} /></p>
        <Button variant="outline" size="sm" onClick={retryLoad}>
          Try again
        </Button>
      </div>
    );
  if (!items)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (items.length === 0)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Inbox className="h-8 w-8" />
        <p className="text-sm">Nothing needs attention.</p>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-2 p-3">
      {items.map((item) => (
        <div
          key={`${item.kind}:${item.id}`}
          className="rounded-lg border border-border bg-card p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            {item.kind === "recall_escalation" ? (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Escalated
              </Badge>
            ) : item.kind === "recall_disagreement" ? (
              <Badge variant="secondary" className="gap-1">
                <Scale className="h-3 w-3" /> Disagreement
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <HelpCircle className="h-3 w-3" /> Open question
              </Badge>
            )}
            <span className="text-sm font-medium text-foreground">{item.title}</span>
          </div>
          {item.detail && (
            <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {item.assetId && (
              <Button asChild variant="outline" size="sm" className="gap-1">
                <Link href={`/commerce/intake/assets/${item.assetId}`}>
                  <ExternalLink className="h-3.5 w-3.5" /> Open asset
                </Link>
              </Button>
            )}
            {item.kind === "high_impact_unknown" && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/commerce/intake/answer">Answer queue</Link>
              </Button>
            )}
            {item.audit && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void verdict(item, "original_correct")}
                >
                  Original was right
                  {item.audit.original_bucket ? ` (${item.audit.original_bucket})` : ""}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void verdict(item, "challenge_correct")}
                >
                  Skeptic was right
                  {item.audit.challenge_bucket ? ` (${item.audit.challenge_bucket})` : ""}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void verdict(item, "inconclusive")}
                >
                  Inconclusive
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
