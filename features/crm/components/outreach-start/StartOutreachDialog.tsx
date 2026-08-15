"use client";

// features/crm/components/outreach-start/StartOutreachDialog.tsx
//
// "Start outreach" — the ONE door from an opportunity (a reputation case, a
// backlink prospect) to a real conversation. Outreach handoff §3 G9: outreach
// must start WHERE THE OPPORTUNITY IS FOUND and land in the existing
// `/crm/outreach-lists` workspace. **There is no outreach console** (§7).
//
// Three honest steps, each of which can refuse WITH the reason:
//
//   1. FIND THE ORGANIZATION — calls the live G1 fold
//      (`/seo/sites/{site_id}/crm/...`), which is the only sanctioned
//      domain→party path because `crm.resolve_party` is server-side. If the
//      site's fold mode is `off`, or the server skipped this domain (toxic
//      link farm / watch-list verdict / the brand's own domain), we say so
//      and stop instead of pretending.
//   2. PICK THE LIST — the shared `OutreachListPicker`.
//   3. ENROL — `addMembersByPartyIds`, stamping the motivating record onto
//      the member so `SingleSendDialog` opens already bound to it (attribution,
//      G8) instead of asking the user to find the case again.
//
// Then it lands the user in the campaign workspace. Nothing here sends: the
// send stays behind `crm.check_send_eligibility()` and the `outreach.send`
// capability gate inside `SingleSendDialog`.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import {
  OutreachListPickerFields,
  useOutreachListChoice,
} from "../outreach-lists/OutreachListPicker";
import { addMembersByPartyIds } from "../../outreach-lists/service";
import {
  describeFoldReport,
  findOutletPartyByDomain,
  foldRefusalForMode,
  foldSiteDomains,
  normalizeDomainKey,
  readSiteCrmFoldSettings,
  type FoldSource,
} from "../../outreach-start/service";
import type { PartyRow } from "../../types";

/** What made this organization worth writing to — carried all the way to the draft. */
export type OutreachMotivation =
  | { kind: "reputation_case"; caseId: string; verdict: string; pitchAngle: string | null }
  | { kind: "backlink"; profileId: string; backlinkId?: string; verdict: string | null };

export interface StartOutreachTarget {
  /** The site whose crawl found this opportunity — the fold is site-scoped. */
  siteId: string;
  /** The org that OWNS the record. Never the active-org selection. */
  organizationId: string;
  /** The outlet / prospect domain. */
  domain: string;
  /** What the user calls it on the surface they came from. */
  label: string;
  /** A URL that proves where this came from — always openable. */
  sourceUrl?: string | null;
  motivation: OutreachMotivation;
}

type Phase =
  | "resolving"
  | "folding"
  | "refused"
  | "ready"
  | "enrolling"
  | "done";

function memberMetadata(
  motivation: OutreachMotivation,
): Record<string, string> {
  if (motivation.kind === "reputation_case")
    return { reputation_case_id: motivation.caseId };
  return motivation.backlinkId
    ? {
        backlink_id: motivation.backlinkId,
        referring_domain_profile_id: motivation.profileId,
      }
    : { referring_domain_profile_id: motivation.profileId };
}

export function StartOutreachDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: StartOutreachTarget;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const choice = useOutreachListChoice(open);
  const [phase, setPhase] = useState<Phase>("resolving");
  const [party, setParty] = useState<PartyRow | null>(null);
  const [foldSummary, setFoldSummary] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ message: string; fix: string } | null>(
    null,
  );
  const [navigating, startNavigation] = useTransition();
  /** Bumped by "Try again" so the resolve effect genuinely re-runs. */
  const [attempt, setAttempt] = useState(0);

  const source: FoldSource =
    target.motivation.kind === "reputation_case" ? "reputation" : "backlink";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase("resolving");
    setProblem(null);
    setSkipReason(null);
    setFoldSummary(null);
    void (async () => {
      try {
        // FAST PATH FIRST. The fold is a whole-site operation (it resolves up
        // to 250 domains through the server party resolver) and it is
        // idempotent — so once this outlet exists there is nothing to gain by
        // running it again, and a user pressing "Start outreach" on one row
        // should not wait on 250 others. After the first fold this path is
        // instant.
        const already = await findOutletPartyByDomain({
          orgId: target.organizationId,
          domain: target.domain,
        });
        if (cancelled) return;
        if (already) {
          setParty(already);
          setFoldSummary("Already in your CRM — nothing new had to be added.");
          setPhase("ready");
          return;
        }

        // The site's own setting decides whether we may add anything at all.
        // `off` refuses HERE, with the reason and the way to change it — never
        // a button that silently does nothing.
        const settings = await readSiteCrmFoldSettings(target.siteId);
        if (cancelled) return;
        const refusal = foldRefusalForMode(settings.settings.mode ?? "auto");
        if (refusal) {
          setProblem({
            message: refusal,
            fix: "Open this site's settings and choose how found organizations reach your CRM.",
          });
          setPhase("refused");
          return;
        }

        setPhase("folding");
        const report = await foldSiteDomains({
          siteId: target.siteId,
          source,
          // Reputation folds only the verdict we are acting on, so pressing
          // "Start outreach" on one case never quietly imports every other
          // outlet the site knows about.
          body:
            target.motivation.kind === "reputation_case"
              ? { verdicts: [target.motivation.verdict] }
              : {},
        });
        if (cancelled) return;
        setFoldSummary(describeFoldReport(report));
        const wanted = normalizeDomainKey(target.domain);
        const skipped = (report.skipped ?? []).find(
          (row) => normalizeDomainKey(row.domain ?? "") === wanted,
        );
        const found = await findOutletPartyByDomain({
          orgId: target.organizationId,
          domain: target.domain,
        });
        if (cancelled) return;
        if (found) {
          setParty(found);
          if (skipped) setSkipReason(skipped.reason);
          setPhase("ready");
          return;
        }
        setProblem({
          message: skipped
            ? `${target.domain} was not added: ${skipped.reason}`
            : `${target.domain} could not be turned into an organization in your CRM.`,
          fix: skipped
            ? "This is a deliberate refusal. If you disagree, record your own verdict on the domain first, then try again."
            : "Run this site's crawl so the domain has a profile to resolve, then try again.",
        });
        setPhase("refused");
      } catch (error) {
        if (cancelled) return;
        setProblem({
          message:
            error instanceof Error
              ? error.message
              : "Could not reach the organization finder.",
          fix: "Try again in a moment. If it keeps failing, open the site's settings to check how found organizations reach your CRM.",
        });
        setPhase("refused");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    attempt,
    open,
    source,
    target.domain,
    target.organizationId,
    target.siteId,
    target.motivation,
  ]);

  const enroll = async () => {
    if (!party) return;
    setPhase("enrolling");
    try {
      const list = await choice.resolve({
        orgId: target.organizationId,
        kind: "email",
      });
      const { added, skippedExisting } = await addMembersByPartyIds({
        list,
        partyIds: [party.id],
        metadata: memberMetadata(target.motivation),
      });
      setPhase("done");
      toast.success(
        added > 0
          ? `${party.display_name} added to ${list.name}`
          : `${party.display_name} was already in ${list.name}`,
        {
          description: skippedExisting
            ? "Already enrolled — opening the campaign."
            : undefined,
          action: toastDoor("crm_outreach_list", list.id),
        },
      );
      onOpenChange(false);
      startNavigation(() => router.push(`/crm/outreach-lists/${list.id}`));
    } catch (error) {
      setPhase("ready");
      toast.error(
        error instanceof Error ? error.message : "Could not start outreach",
      );
    }
  };

  const body = (
    <div className="space-y-3">
      {(phase === "resolving" || phase === "folding") && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <span>
            Finding {target.domain} in your CRM…
            {phase === "folding" && (
              <span className="mt-1 block text-xs">
                This site has never been matched to your CRM, so we are
                resolving its found organizations once. It only takes this long
                the first time.
              </span>
            )}
          </span>
        </div>
      )}

      {problem && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="flex gap-2 font-medium text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {problem.message}
          </p>
          <p className="mt-1 pl-6 text-muted-foreground">Fix: {problem.fix}</p>
        </div>
      )}

      {party && (
        <div className="rounded-md border bg-muted/20 p-3 text-sm">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            {/* THE DOOR LAW: the organization we just resolved is openable. */}
            <EntityRef
              token="party"
              id={party.id}
              name={party.display_name}
            />
            {party.record_class === "discovered" && (
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                found by the platform
              </span>
            )}
          </div>
          {foldSummary && (
            <p className="mt-1.5 text-xs text-muted-foreground">{foldSummary}</p>
          )}
          {skipReason && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
              This domain was skipped by the finder ({skipReason}) — it is here
              because it was already in your CRM.
            </p>
          )}
          {target.sourceUrl && (
            <a
              href={target.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block text-xs text-primary hover:underline"
            >
              Why this is an opportunity — open the source page
            </a>
          )}
        </div>
      )}

      {target.motivation.kind === "reputation_case" &&
        target.motivation.pitchAngle && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
              The angle this message carries
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground">
              {target.motivation.pitchAngle}
            </p>
          </div>
        )}

      {party && (
        <OutreachListPickerFields
          choice={choice}
          newListLabel="New email outreach list"
          onSubmitKey={() => void enroll()}
        />
      )}
    </div>
  );

  const title = "Start outreach";
  const description = `${target.label} · ${target.domain}. The organization is resolved through your CRM's one resolver, then enrolled in an outreach list — nothing is sent here.`;

  const footer = (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onOpenChange(false)}
        disabled={phase === "enrolling"}
      >
        Cancel
      </Button>
      {phase === "refused" ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAttempt((n) => n + 1)}
          className="gap-1"
        >
          <Search className="h-3.5 w-3.5" /> Try again
        </Button>
      ) : (
        <Button
          size="sm"
          className="gap-1"
          onClick={() => void enroll()}
          disabled={
            !party ||
            !choice.ready ||
            phase === "enrolling" ||
            phase === "resolving" ||
            phase === "folding" ||
            navigating
          }
        >
          {phase === "enrolling" || navigating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : phase === "done" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" />
          )}
          Add and open the campaign
        </Button>
      )}
    </>
  );

  // Drawer, not Dialog, on mobile.
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-2">{body}</div>
          <DrawerFooter className="flex-row justify-end gap-2 pb-safe">
            {footer}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter className="gap-2 sm:gap-2">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
