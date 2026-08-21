"use client";

/**
 * The candidate review queue (WP3, IC-2/IC-3) — the human half of enrichment.
 *
 * Everything the waterfall, the crawl, the registries and the extension find
 * lands in ONE ranked list, and NONE of it is contactable until somebody here
 * says so. This card is that "somebody".
 *
 * Three rules it renders rather than describes:
 *
 * 1. **Every row shows WHY.** The engagement reasons, the source, and the page
 *    we read it on — a door, not a citation. A confirmation made on a number
 *    nobody can check is the failure this feature exists to prevent.
 * 2. **The two second-confirmations are separate questions with separate
 *    reasons.** A shared inbox is not proof of a personal mailbox; an
 *    unverified address is a bounce risk against the user's OWN sending
 *    domain. There is no generic override here, because there is none on the
 *    server either.
 * 3. **Unverified is said plainly, never dressed up.** With no verification
 *    vendor connected, the honest answer is "we have not confirmed this mailbox
 *    exists" — and that is what it says.
 */

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  ContactRound,
  ExternalLink,
  Search,
  ShieldQuestion,
  ThumbsDown,
  RefreshCw,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  confirmCandidate,
  fetchContactCandidates,
  findContacts,
  rejectCandidate,
  type ContactCandidateView,
} from "../../enrichment/service";
import { SectionCard } from "./SectionCard";

interface Props {
  partyId: string;
  onChanged?: () => void;
}

/** The verification word a non-technical person can act on. */
function verificationLabel(candidate: ContactCandidateView): {
  text: string;
  variant: "default" | "secondary" | "outline" | "destructive";
} {
  switch (candidate.verification_status) {
    case "verified":
      return { text: "Mailbox confirmed", variant: "default" };
    case "risky":
      return { text: "Accepts anything — risky", variant: "secondary" };
    case "invalid":
      return { text: "Does not exist", variant: "destructive" };
    default:
      return { text: "Not checked yet", variant: "outline" };
  }
}

export function ContactCandidatesCard({ partyId, onChanged }: Props) {
  const [rows, setRows] = useState<ContactCandidateView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchContactCandidates(partyId));
    } catch (cause) {
      setError(extractErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const find = async () => {
    setFinding(true);
    try {
      const result = await findContacts(partyId, { usePaidProviders: true });
      const personal = result.personal_found ?? 0;
      toast.success(
        result.candidates?.length
          ? `${result.candidates.length} found · ${personal} personal`
          : "No contact details found",
      );
      await load();
    } catch (cause) {
      toast.error(extractErrorMessage(cause));
    } finally {
      setFinding(false);
    }
  };

  const accept = async (candidate: ContactCandidateView) => {
    // Two separate questions, each with its own reason — mirroring the server,
    // which takes two named arguments and no generic override.
    if (candidate.is_role_address) {
      const ok = await confirm({
        title: "This is a shared inbox, not one person",
        description: `${candidate.address} belongs to the organisation — anyone might read it, and nobody in particular will. Add it anyway?`,
        confirmLabel: "Add the shared inbox",
      });
      if (!ok) return;
    }
    if (candidate.verification_status !== "verified") {
      const ok = await confirm({
        title: "We have not confirmed this mailbox exists",
        description:
          "Sending to an address that bounces damages your own sending domain's reputation, not ours. Add it anyway?",
        confirmLabel: "Add it unverified",
      });
      if (!ok) return;
    }

    setBusyId(candidate.id);
    try {
      await confirmCandidate(partyId, candidate.id, {
        acceptRoleAddress: Boolean(candidate.is_role_address),
        acceptUnverified: candidate.verification_status !== "verified",
      });
      toast.success("Contact added");
      await load();
      onChanged?.();
    } catch (cause) {
      toast.error(extractErrorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const refuse = async (candidate: ContactCandidateView) => {
    const ok = await confirm({
      title: "Refuse this address?",
      description:
        "It will stay refused even if we find it again later, so you will not be asked about it twice.",
      confirmLabel: "Refuse it",
    });
    if (!ok) return;
    setBusyId(candidate.id);
    try {
      await rejectCandidate(partyId, candidate.id);
      toast.success("Suggestion dismissed");
      await load();
    } catch (cause) {
      toast.error(extractErrorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SectionCard
      title="Contact details"
      Icon={ContactRound}
      count={rows?.length}
      action={
        <div className="flex w-full items-center gap-1 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-11 flex-1 px-3 text-xs sm:h-6 sm:flex-none sm:px-2"
            disabled={finding}
            onClick={() => void find()}
          >
            {finding ? (
              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Search className="mr-1 h-3 w-3" />
            )}
            Find contact info
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 sm:h-6 sm:w-6"
            disabled={loading}
            onClick={() => void load()}
            aria-label="Refresh candidates"
          >
            <RefreshCw
              className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
            />
          </Button>
        </div>
      }
    >
      {loading && !rows && (
        <p className="py-3 text-center text-xs text-muted-foreground">
          Loading suggestions…
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

      {!loading && !error && rows?.length === 0 && (
        <p className="py-3 text-center text-xs text-muted-foreground">
          No suggestions yet. Search known pages and contact providers.
        </p>
      )}

      <div className="divide-y divide-border">
        {(rows ?? []).map((candidate) => {
          const verification = verificationLabel(candidate);
          const busy = busyId === candidate.id;
          return (
            <article key={candidate.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {candidate.address}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {candidate.person_name ?? "No name on record"}
                    {candidate.role_title ? ` · ${candidate.role_title}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {candidate.engagement_score !== null &&
                    candidate.engagement_score !== undefined && (
                      <Badge variant="secondary">
                        {candidate.engagement_score}/100
                      </Badge>
                    )}
                  <Badge variant={verification.variant}>
                    {verification.text}
                  </Badge>
                  {candidate.is_role_address && (
                    <Badge variant="outline">Shared inbox</Badge>
                  )}
                </div>
              </div>

              {/* WHY — never a bare score. Every reason is a fact on the record. */}
              {(candidate.why?.length ?? 0) > 0 && (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {(candidate.why ?? []).map((reason, index) => (
                    <li key={index}>· {reason}</li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Found by {candidate.source}
                  {candidate.source_url ? " · " : ""}
                  {candidate.source_url && (
                    <a
                      className="inline-flex items-center gap-1 underline underline-offset-2"
                      href={candidate.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      the page we read it on
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={busy}
                    onClick={() => void refuse(candidate)}
                  >
                    <ThumbsDown className="mr-1 h-3 w-3" />
                    Refuse
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={busy}
                    onClick={() => void accept(candidate)}
                  >
                    {candidate.verification_status === "verified" ? (
                      <BadgeCheck className="mr-1 h-3 w-3" />
                    ) : (
                      <ShieldQuestion className="mr-1 h-3 w-3" />
                    )}
                    Add as a contact
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </SectionCard>
  );
}
