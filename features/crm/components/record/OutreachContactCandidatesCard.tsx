"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, MailSearch, RefreshCw } from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  confirmOutletContact,
  fetchOutletContactCandidates,
  type OutletContactCandidate,
  type OutletContactExtraction,
} from "../../outreach-contacts/service";
import { SectionCard } from "./SectionCard";

interface Props {
  outletPartyId: string;
}

type SelectedByCandidate = Record<string, string[]>;

function initialSelection(
  candidates: OutletContactCandidate[],
): SelectedByCandidate {
  return Object.fromEntries(
    candidates.map((candidate) => [
      candidate.key,
      (candidate.observed_emails ?? [])
        .filter((email) => !email.is_role_address && email.confidence >= 75)
        .map((email) => email.key),
    ]),
  );
}

function confidenceVariant(
  tier: OutletContactCandidate["tier"],
): "default" | "secondary" | "outline" {
  if (tier === "strong") return "default";
  if (tier === "probable") return "secondary";
  return "outline";
}

export function OutreachContactCandidatesCard({ outletPartyId }: Props) {
  const [data, setData] = useState<OutletContactExtraction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedByCandidate>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchOutletContactCandidates(outletPartyId);
      setData(next);
      setSelected(initialSelection(next.candidates ?? []));
    } catch (cause) {
      setError(extractErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [outletPartyId]);

  useEffect(() => {
    let cancelled = false;
    void fetchOutletContactCandidates(outletPartyId)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setSelected(initialSelection(next.candidates ?? []));
      })
      .catch((cause) => {
        if (!cancelled) setError(extractErrorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [outletPartyId]);

  const candidates = useMemo(() => data?.candidates ?? [], [data]);

  const toggleEmail = (candidateKey: string, emailKey: string) => {
    setSelected((current) => {
      const values = current[candidateKey] ?? [];
      return {
        ...current,
        [candidateKey]: values.includes(emailKey)
          ? values.filter((value) => value !== emailKey)
          : [...values, emailKey],
      };
    });
  };

  const apply = async (candidate: OutletContactCandidate) => {
    const emailKeys = selected[candidate.key] ?? [];
    const chosen = (candidate.observed_emails ?? []).filter((email) =>
      emailKeys.includes(email.key),
    );
    const hasRoleAddress = chosen.some((email) => email.is_role_address);
    const needsSecondAct = candidate.tier === "weak" || hasRoleAddress;
    if (needsSecondAct) {
      const accepted = await confirm({
        title: "Confirm a low-confidence suggestion?",
        description: hasRoleAddress
          ? "A role address such as info@ belongs to the outlet, not necessarily this person. Confirm only if you want it attached as observed—not verified."
          : "The crawl names this person but does not clearly identify them as an author or editor. Confirm only if the source evidence is enough.",
        confirmLabel: "Confirm anyway",
      });
      if (!accepted) return;
    }

    setSavingKey(candidate.key);
    try {
      const result = await confirmOutletContact(outletPartyId, {
        candidateKey: candidate.key,
        emailKeys,
        acceptLowConfidence: candidate.tier === "weak",
        acceptRoleAddress: hasRoleAddress,
      });
      toast.success(
        result.email_keys?.length
          ? `${result.display_name} confirmed with an observed address`
          : `${result.display_name} confirmed; no address was attached`,
      );
      await load();
    } catch (cause) {
      toast.error(extractErrorMessage(cause));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <SectionCard
      title="People found on this outlet"
      Icon={MailSearch}
      count={data ? candidates.length : undefined}
      action={
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={loading}
          onClick={() => void load()}
          aria-label="Refresh discovered people"
        >
          <RefreshCw
            className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
          />
        </Button>
      }
    >
      {loading && !data && (
        <p className="py-3 text-center text-xs text-muted-foreground">
          Reading existing crawl evidence…
        </p>
      )}

      {error && (
        <div className="flex items-center justify-between gap-2 py-2 text-xs text-destructive">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && data && candidates.length === 0 && (
        <div className="space-y-1 py-3 text-center text-xs text-muted-foreground">
          <p>
            No named authors or editors were found in crawled pages for{" "}
            {data.outlet_domain}.
          </p>
          <p>{data.sources_analyzed} source page(s) checked.</p>
        </div>
      )}

      <div className="divide-y divide-border">
        {candidates.map((candidate) => {
          const chosen = selected[candidate.key] ?? [];
          const fullyConfirmed = Boolean(
            candidate.existing_party_id && candidate.existing_affiliation_id,
          );
          return (
            <article
              key={candidate.key}
              className="space-y-2 py-3 first:pt-1 last:pb-1"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {candidate.existing_party_id ? (
                    <EntityRef
                      token="party"
                      id={candidate.existing_party_id}
                      name={candidate.display_name}
                      openInNewTab
                      alwaysShowActions
                    />
                  ) : (
                    <p className="text-sm font-medium text-foreground">
                      {candidate.display_name}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {candidate.role}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant={confidenceVariant(candidate.tier)}>
                    {candidate.confidence}% {candidate.tier}
                  </Badge>
                  {fullyConfirmed && <Badge variant="outline">Confirmed</Badge>}
                </div>
              </div>

              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {(candidate.why ?? []).map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {(candidate.evidence ?? []).map((evidence, index) => (
                  <a
                    key={`${evidence.source_id}-${evidence.kind}-${index}`}
                    href={evidence.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
                    title={evidence.detail}
                  >
                    <span className="truncate">
                      {evidence.kind.replaceAll("_", " ")}:{" "}
                      {evidence.title || evidence.url}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ))}
              </div>

              {(candidate.observed_emails ?? []).length > 0 && (
                <div className="space-y-1.5 rounded-md bg-muted/50 p-2">
                  <p className="text-xs font-medium text-foreground">
                    Observed addresses
                  </p>
                  {(candidate.observed_emails ?? []).map((email) => {
                    const linked = (
                      candidate.existing_email_keys ?? []
                    ).includes(email.key);
                    return (
                      <label
                        key={email.key}
                        className="flex cursor-pointer items-start gap-2 text-xs"
                      >
                        <Checkbox
                          checked={chosen.includes(email.key) || linked}
                          disabled={linked || savingKey === candidate.key}
                          onCheckedChange={() =>
                            toggleEmail(candidate.key, email.key)
                          }
                          aria-label={`Attach ${email.address} to ${candidate.display_name}`}
                        />
                        <span className="min-w-0">
                          <span className="font-medium text-foreground">
                            {email.address}
                          </span>
                          {email.is_role_address && (
                            <Badge variant="outline" className="ml-1.5">
                              Role address
                            </Badge>
                          )}
                          {linked && (
                            <Badge variant="outline" className="ml-1.5">
                              Attached
                            </Badge>
                          )}
                          <span className="mt-0.5 block text-muted-foreground">
                            {email.confidence}% · {email.why}
                          </span>
                          <a
                            href={email.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            See the page where this address was observed
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <Button
                size="sm"
                variant={fullyConfirmed ? "outline" : "default"}
                disabled={savingKey === candidate.key}
                onClick={() => void apply(candidate)}
              >
                {savingKey === candidate.key
                  ? "Confirming…"
                  : fullyConfirmed
                    ? "Update observed addresses"
                    : "Confirm person"}
              </Button>
            </article>
          );
        })}
      </div>
    </SectionCard>
  );
}
