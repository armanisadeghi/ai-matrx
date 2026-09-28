"use client";

// features/sharing/audience/ShareWithAudience.tsx
//
// "SHARE WITH EVERYONE IN …" — ONE button for an existing action bar, and the
// dialog it opens (access ladder T-32). Generic over every audience the
// database knows (`AudienceKind`); the meeting record is the first host.
//
// Bar: Google Meet's "recording shared with invitees" + Zoom's "share with
// participants", made explicit: the host sees exactly who gets what before the
// one click — the Permission, the records, and every person with their state —
// and can untick anyone. Everyone ticked becomes an ordinary person share;
// people with only an email get a link; a guest with neither is named as
// unreachable, never silently dropped. Running it again adds nobody twice and
// picks up anyone added since.

import { useEffect, useState } from "react";
import { Loader2, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";
import {
  previewAudienceShare,
  shareWithAudience,
  type AudienceKind,
  type AudienceLevel,
  type AudiencePerson,
  type AudiencePreview,
} from "@/features/sharing/audience/audienceShareService";

const LEVELS: { value: AudienceLevel; label: string }[] = [
  { value: "viewer", label: "Viewer" },
  { value: "commenter", label: "Commenter" },
  { value: "editor", label: "Editor" },
];

/** "notes, summary, transcript and recording" — the assets as one phrase. */
function listOf(assets: { label: string }[]): string {
  return new Intl.ListFormat("en", { type: "conjunction" }).format(
    assets.map((a) => a.label.toLowerCase()),
  );
}

/** People this click can still reach: share or email. */
function reachable(p: AudiencePerson): boolean {
  return p.state === "will_share" || p.state === "invite_by_email";
}

function stateLine(p: AudiencePerson): string {
  switch (p.state) {
    case "will_share":
      return `Gets ${listOf(p.missing)}`;
    case "invite_by_email":
      return "No account yet — gets an email link";
    case "invited":
      return "Already sent a link";
    case "has_access":
      return "Already has it";
    case "removed":
      return "Access was removed earlier — not re-added";
    case "left_out":
      return "Left out";
    case "unreachable":
      return "Joined as a guest with no account or email — cannot be reached";
  }
}

export interface ShareWithAudienceButtonProps {
  kind: AudienceKind;
  sourceId: string;
  /** "Share with everyone in the meeting" */
  label: string;
  /** Open the dialog on mount (the meeting-end offer's link, `?share=1`). */
  autoOpen?: boolean;
  className?: string;
}

/**
 * The one button. It reads the preview once so it can say how many people are
 * still missing something ("· 2") when the organization's knob says to offer it.
 */
export function ShareWithAudienceButton({
  kind,
  sourceId,
  label,
  autoOpen = false,
  className,
}: ShareWithAudienceButtonProps) {
  const [open, setOpen] = useState(autoOpen);
  const [pending, setPending] = useState<number | null>(null);
  const [offer, setOffer] = useState<AudiencePreview["offer_mode"]>("offer");

  const refreshCount = () => {
    previewAudienceShare(kind, sourceId, null)
      .then((p) => {
        setOffer(p.offer_mode);
        setPending(p.counts.will_share + p.counts.invite_by_email);
      })
      .catch(() => setPending(null)); // the dialog says why when opened
  };

  useEffect(refreshCount, [kind, sourceId]);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={className ?? "h-8 gap-1.5"}
        onClick={() => setOpen(true)}
      >
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
        {offer !== "off" && pending ? (
          <span
            className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-xs text-primary"
            aria-label={`${pending} not shared yet`}
          >
            {pending}
          </span>
        ) : null}
      </Button>
      {open ? (
        <ShareWithAudienceDialog
          kind={kind}
          sourceId={sourceId}
          label={label}
          onClose={() => {
            setOpen(false);
            refreshCount();
          }}
        />
      ) : null}
    </>
  );
}

export interface ShareWithAudienceDialogProps {
  kind: AudienceKind;
  sourceId: string;
  label: string;
  onClose: () => void;
}

export function ShareWithAudienceDialog({
  kind,
  sourceId,
  label,
  onClose,
}: ShareWithAudienceDialogProps) {
  const [level, setLevel] = useState<AudienceLevel | null>(null);
  const [plan, setPlan] = useState<AudiencePreview | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let live = true;
    setFailure(null);
    previewAudienceShare(kind, sourceId, level)
      .then((p) => {
        if (!live) return;
        setPlan(p);
        if (level === null) setLevel(p.level);
      })
      .catch((e: unknown) => {
        if (live) setFailure(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
  }, [kind, sourceId, level]);

  const toShare = plan
    ? plan.people.filter((p) => reachable(p) && !unticked.has(p.key))
    : [];

  const share = async () => {
    if (!plan || !level) return;
    setSharing(true);
    try {
      const result = await shareWithAudience(kind, sourceId, level, [
        ...unticked,
      ]);
      toast.success(result.say);
      onClose();
    } catch (e: unknown) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setSharing(false);
    }
  };

  const toggle = (key: string) =>
    setUnticked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {plan
              ? `${plan.title}: ${listOf(plan.assets)}. Each person gets their own share and a notice with the link.`
              : "Finding everyone who was invited or attended."}
          </DialogDescription>
        </DialogHeader>

        {failure ? (
          <p role="alert" className="text-sm text-destructive">
            {failure} <ErrorAlchemyMenu error={failure} size="xs" />
          </p>
        ) : null}

        {plan === null && failure === null ? (
          <div
            className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
            aria-busy="true"
          >
            <Loader2 className="h-4 w-4 animate-spin" /> Finding everyone who
            was invited or attended…
          </div>
        ) : null}

        {plan ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Permission</span>
              <Select
                value={level ?? plan.level}
                onValueChange={(v) => setLevel(v as AudienceLevel)}
                disabled={sharing}
              >
                <SelectTrigger className="h-8 w-36" aria-label="Permission">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                They {plan.means}.
              </span>
            </div>

            {plan.people.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody else was invited to or attended this {plan.source_noun}.
              </p>
            ) : (
              <ul className="max-h-72 divide-y overflow-y-auto rounded-md border border-border">
                {plan.people.map((p) => {
                  const canTick = reachable(p);
                  return (
                    <li
                      key={p.key}
                      className="flex items-center gap-3 px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={canTick && !unticked.has(p.key)}
                        disabled={!canTick || sharing}
                        onCheckedChange={() => toggle(p.key)}
                        aria-label={`Include ${p.name ?? p.email ?? "this person"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {p.name ?? p.email ?? "Guest"}
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            {p.why}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.state === "invite_by_email" ? (
                            <Mail
                              className="mr-1 inline h-3 w-3"
                              aria-hidden="true"
                            />
                          ) : null}
                          {canTick && unticked.has(p.key)
                            ? "Left out"
                            : stateLine(p)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sharing}>
            Cancel
          </Button>
          <Button
            onClick={() => void share()}
            disabled={!plan || toShare.length === 0 || sharing}
          >
            {sharing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {toShare.length === 0
              ? "Everyone already has it"
              : `Share with ${toShare.length} ${toShare.length === 1 ? "person" : "people"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
