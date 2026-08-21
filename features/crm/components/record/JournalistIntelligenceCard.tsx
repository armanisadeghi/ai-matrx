"use client";

/**
 * Is this journalist still there, and what do they cover? (WP3, D10 + IC-7b.)
 *
 * Two answers on one card, both of which are honest about not knowing:
 *
 * - **Activity** never says "inactive". The verdicts are active / stale /
 *   moved / unknown, and `moved` is phrased as a suspicion — telling a user
 *   somebody left on the strength of a failed search is how a good contact
 *   gets deleted.
 * - **Beat** refuses to describe one below four pieces we have actually read,
 *   and says how many it has. A beat invented from two headlines reads exactly
 *   like one derived from forty.
 * - **Campaign fit** is a verdict — strong / moderate / weak / none — never a
 *   number, and NOT MEASURED is rendered as not measured, never as `none`.
 */

import { useCallback, useEffect, useState } from "react";
import { Newspaper, RefreshCw, Radar, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { isJsonObject } from "@/types/json";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  checkJournalistActivity,
  deriveJournalistBeat,
  fetchJournalistBeat,
  type ActivityVerdict,
  type BeatProfile,
} from "../../enrichment/service";
import { SectionCard } from "./SectionCard";

interface Props {
  partyId: string;
  /** Read straight off the party record so the card renders with no request. */
  storedActivity?: ActivityVerdict | null;
}

/**
 * The verdict the scheduled media-list pass (or a previous click) already
 * stamped onto `party.attributes.journalist.activity`. Reading it here means
 * the card renders the truth we already own with no request and no spend —
 * "Check they are still there" is for when the user wants it re-established.
 */
export function storedJournalistActivity(party: {
  id: string;
  display_name: string;
  attributes?: unknown;
}): ActivityVerdict | null {
  const attributes = party.attributes;
  if (!isJsonObject(attributes)) return null;
  const journalist = attributes.journalist;
  if (!isJsonObject(journalist)) return null;
  const activity = journalist.activity;
  if (!isJsonObject(activity)) return null;
  return {
    ...(activity as unknown as ActivityVerdict),
    party_id: party.id,
    person_name: party.display_name,
  };
}

function activityBadge(status: ActivityVerdict["status"]): {
  text: string;
  variant: "default" | "secondary" | "outline" | "destructive";
} {
  switch (status) {
    case "active":
      return { text: "Publishing now", variant: "default" };
    case "stale":
      return { text: "Nothing recent", variant: "secondary" };
    case "moved":
      return { text: "May have moved", variant: "destructive" };
    default:
      return { text: "Not established", variant: "outline" };
  }
}

function fitBadge(fit: BeatProfile["campaign_fit"]): {
  text: string;
  variant: "default" | "secondary" | "outline";
} {
  switch (fit) {
    case "strong":
      return { text: "Strong fit", variant: "default" };
    case "moderate":
      return { text: "Moderate fit", variant: "secondary" };
    case "weak":
      return { text: "Weak fit", variant: "outline" };
    default:
      return { text: "Not a fit", variant: "outline" };
  }
}

export function JournalistIntelligenceCard({ partyId, storedActivity }: Props) {
  const [activity, setActivity] = useState<ActivityVerdict | null>(
    storedActivity ?? null,
  );
  const [beat, setBeat] = useState<BeatProfile | null>(null);
  const [checking, setChecking] = useState(false);
  const [deriving, setDeriving] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  const loadBeat = useCallback(async () => {
    try {
      setBeat(await fetchJournalistBeat(partyId));
      setUnreachable(false);
    } catch {
      // A missing beat profile is the normal state and deserves no toast — but
      // "we could not ask" must NOT read as "there is nothing to know". They
      // look identical to a user and only one of them is their problem.
      setBeat(null);
      setUnreachable(true);
    }
  }, [partyId]);

  useEffect(() => {
    void loadBeat();
  }, [loadBeat]);

  const check = async () => {
    setChecking(true);
    try {
      const verdict = await checkJournalistActivity(partyId);
      setActivity(verdict);
      toast.success(verdict.summary);
    } catch (cause) {
      toast.error(extractErrorMessage(cause));
    } finally {
      setChecking(false);
    }
  };

  const derive = async () => {
    setDeriving(true);
    try {
      const profile = await deriveJournalistBeat(partyId);
      setBeat(profile);
      toast.success(profile.summary);
    } catch (cause) {
      toast.error(extractErrorMessage(cause));
    } finally {
      setDeriving(false);
    }
  };

  const badge = activity ? activityBadge(activity.status) : null;

  return (
    <SectionCard
      title="Journalist info"
      Icon={Newspaper}
      action={
        <div className="flex w-full items-center gap-1 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-11 w-full px-3 text-xs sm:h-6 sm:w-auto sm:px-2"
            disabled={checking}
            onClick={() => void check()}
          >
            {checking ? (
              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Radar className="mr-1 h-3 w-3" />
            )}
            Check activity
          </Button>
        </div>
      }
    >
      <div className="space-y-3 py-1">
        <section className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-foreground">
              Still publishing?
            </span>
            {badge ? (
              <Badge variant={badge.variant}>{badge.text}</Badge>
            ) : (
              <Badge variant="outline">Never checked</Badge>
            )}
            {activity?.outlet_name && (
              <span className="text-xs text-muted-foreground">
                at {activity.outlet_name}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {activity?.summary ?? "Not checked yet."}
          </p>
          {(activity?.evidence?.length ?? 0) > 0 && (
            <ul className="space-y-0.5 text-xs">
              {(activity?.evidence ?? []).slice(0, 3).map((item) => (
                <li key={item.url}>
                  <a
                    className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-2"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.title ?? item.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-1.5 border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">
              What they cover
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={deriving}
              onClick={() => void derive()}
            >
              {deriving ? (
                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
              ) : null}
              {beat ? "Refresh beat" : "Find beat"}
            </Button>
          </div>

          {!beat && unreachable && (
            <p className="text-xs text-muted-foreground">
              We could not reach the service that works this out just now, so we
              cannot say whether we know their beat. Try again shortly.
            </p>
          )}

          {!beat && !unreachable && (
            <p className="text-xs text-muted-foreground">
              We have not worked out this person&apos;s beat yet. It reads the
              articles of theirs we have already collected — no new searching.
            </p>
          )}

          {beat?.insufficient_evidence && (
            <p className="text-xs text-muted-foreground">{beat.summary}</p>
          )}

          {beat && !beat.insufficient_evidence && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {(beat.beats ?? []).map((label) => (
                  <Badge key={label} variant="secondary">
                    {label}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {beat.beat_summary}
              </p>
              {beat.typical_angle && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Their usual angle:{" "}
                  </span>
                  {beat.typical_angle}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Based on {beat.pages_analyzed} piece(s) of their work we have
                read.
              </p>
              {/* NOT MEASURED is rendered as not measured. `none` is a verdict;
                  a missing verdict is the absence of a question. */}
              {beat.campaign_fit ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={fitBadge(beat.campaign_fit).variant}>
                    {fitBadge(beat.campaign_fit).text}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {beat.campaign_fit_reason}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No campaign has been described, so there is nothing to measure
                  their fit against.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </SectionCard>
  );
}
