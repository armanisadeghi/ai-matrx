"use client";

// features/crm/components/record/ExpertStatusCard.tsx
//
// THE READER for `crm.party.expert_status` — the column that had a producer
// and no reader until 2026-08-14, and no producer before that.
//
// Three things in one card, because they are one decision:
//   1. WHERE the claim came from (the research topic that promoted them, with
//      the evidence the extractor scored) — every id here opens.
//   2. WHAT tier they are on now.
//   3. The tier change itself. `registered` is all a producer may propose;
//      `approved` and `vetted` are human verdicts and this is where a human
//      makes them.
//
// Renders NOTHING for a company, and for a person with no expert status and no
// research provenance — most parties are not experts and an empty card that
// says so is noise.

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { GraduationCap, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isJsonObject } from "@/types/json";
import { extractErrorMessage } from "@/utils/errors";
import { fetchPartyExpertTopics, setExpertStatus } from "../../service";
import type {
  ExpertStatus,
  ExpertTopicRef,
  PartyListRow,
} from "../../types";
import {
  EXPERT_STATUSES,
  EXPERT_STATUS_DESCRIPTION,
  EXPERT_STATUS_LABEL,
} from "../../types";
import { expertBadge } from "../columns";
import { SectionCard } from "./SectionCard";

interface Props {
  party: PartyListRow;
  onChanged: () => Promise<void>;
}

/** What the research promoter stamped into `party.attributes.research_expert`. */
interface ResearchExpertAttrs {
  topicId: string | null;
  confidence: number | null;
  tier: string | null;
  credentials: string[];
  affiliationHints: string[];
}

function readResearchAttrs(party: PartyListRow): ResearchExpertAttrs | null {
  const attributes = party.attributes;
  if (!isJsonObject(attributes)) return null;
  const raw = attributes.research_expert;
  if (!isJsonObject(raw)) return null;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return {
    topicId: typeof raw.topic_id === "string" ? raw.topic_id : null,
    confidence: typeof raw.confidence === "number" ? raw.confidence : null,
    tier: typeof raw.tier === "string" ? raw.tier : null,
    credentials: strings(raw.credentials),
    affiliationHints: strings(raw.affiliation_hints),
  };
}

function isExpertStatus(value: string | null): value is ExpertStatus {
  return (EXPERT_STATUSES as readonly string[]).includes(value ?? "");
}

export function ExpertStatusCard({ party, onChanged }: Props) {
  const [topics, setTopics] = useState<ExpertTopicRef[]>([]);
  const [saving, setSaving] = useState(false);
  const status = isExpertStatus(party.expert_status) ? party.expert_status : null;
  const research = readResearchAttrs(party);
  const isPerson = party.party_kind === "person";

  useEffect(() => {
    let cancelled = false;
    if (!isPerson) return;
    void fetchPartyExpertTopics(party.id)
      .then((rows) => {
        if (!cancelled) setTopics(rows);
      })
      // A provenance read that fails must not break the record page — the
      // tier controls below still work, and the card says nothing it can't back.
      .catch(() => {
        if (!cancelled) setTopics([]);
      });
    return () => {
      cancelled = true;
    };
  }, [party.id, isPerson]);

  if (!isPerson) return null;
  if (!status && !research && topics.length === 0) return null;

  const apply = async (next: ExpertStatus | null) => {
    setSaving(true);
    try {
      await setExpertStatus(party.id, next);
      await onChanged();
      toast.success(
        next
          ? `${party.display_name} is now ${EXPERT_STATUS_LABEL[next].toLowerCase()}`
          : `Expert status cleared for ${party.display_name}`,
      );
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Expert" Icon={GraduationCap}>
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {status ? (
            expertBadge(status)
          ) : (
            <span className="text-xs text-muted-foreground">
              Not an expert yet
            </span>
          )}
          {status && (
            <span className="text-xs text-muted-foreground">
              {EXPERT_STATUS_DESCRIPTION[status]}
            </span>
          )}
        </div>

        {/* The tier ladder. Every tier is one click from every other — a
            mistaken "vetted" must be as reversible as it was reachable. */}
        <div className="flex flex-wrap items-center gap-1">
          {EXPERT_STATUSES.map((tier) => (
            <Button
              key={tier}
              variant={tier === status ? "default" : "outline"}
              size="sm"
              disabled={saving || tier === status}
              onClick={() => void apply(tier)}
              className="h-7 px-2 text-xs"
            >
              {EXPERT_STATUS_LABEL[tier]}
            </Button>
          ))}
          {status && (
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => void apply(null)}
              className="h-7 px-2 text-xs text-muted-foreground"
            >
              Clear
            </Button>
          )}
        </div>

        {research && (
          <div className="space-y-1 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
            <div>
              Identified by research
              {research.confidence !== null && (
                <>
                  {" "}
                  with{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {research.confidence}
                  </span>{" "}
                  confidence
                  {research.tier ? ` (${research.tier} evidence)` : ""}
                </>
              )}
              .
            </div>
            {research.credentials.length > 0 && (
              <div>Credentials seen: {research.credentials.join(", ")}</div>
            )}
            {research.affiliationHints.length > 0 && (
              <div>
                Named alongside: {research.affiliationHints.slice(0, 4).join(", ")}
              </div>
            )}
          </div>
        )}

        {topics.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Expert for
            </div>
            {topics.map((topic) =>
              topic.name ? (
                <Link
                  key={topic.id}
                  href={`/research/topics/${topic.id}`}
                  className={cn(
                    "flex items-center gap-1.5 rounded px-1 py-0.5 text-xs",
                    "text-foreground hover:bg-accent ",
                  )}
                >
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{topic.name}</span>
                </Link>
              ) : (
                // Never a bare id you can't open: an unreadable topic says so.
                <div key={topic.id} className="px-1 py-0.5 text-xs text-muted-foreground">
                  A research topic you no longer have access to
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
