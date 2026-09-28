"use client";

// features/education/classes/components/InviteStudentsSheet.tsx
//
// "Invite students" — the WP6 door. Three lanes in one sheet, every route a
// teacher actually uses:
//   1. Join code + link — paste anywhere (board, Zoom chat, printout).
//   2. Email invites — type/paste addresses; each becomes a canonical
//      iam.invitations row + a real email with an accept link.
//   3. CSV/roster import — the SAME input: paste or upload any roster export;
//      we extract every email address regardless of format.
// Invitations survive signup: the accept page bounces through auth with the
// destination preserved, and the token matches on the invited email.

import { useRef, useState } from "react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import {
  Copy,
  Link as LinkIcon,
  Mail,
  RefreshCw,
  Send,
  Ticket,
  Upload,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { UntrustedCount } from "@/components/official/stale-data/UntrustedCount";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { ClipboardFallbackDialog } from "@/components/dialogs/clipboard-fallback/ClipboardFallbackDialog";
import { useClassInvites, extractEmails } from "../hooks/useClassInvites";
import { classJoinUrl, classInviteAcceptUrl } from "../service";
import { Textarea } from "@/components/ui/textarea";

export function InviteStudentsSheet({
  open,
  onOpenChange,
  classId,
  className,
  onRosterChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className: string;
  /** Called after sends so the roster panel can refresh pending state. */
  onRosterChanged?: () => void;
}) {
  const inv = useClassInvites(classId, open);
  const [emailText, setEmailText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Browser clipboard write failures (blocked permission, non-HTTPS iframe,
  // older browser) never dead-end on a toast — the platform's fallback dialog
  // shows the value in a selectable field instead.
  const [clipboardFallback, setClipboardFallback] = useState<{
    value: string;
    what: string;
  } | null>(null);

  async function copyText(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copied.`);
    } catch {
      setClipboardFallback({ value, what });
    }
  }

  const parsedEmails = extractEmails(emailText);
  const pending = inv.invites.filter((i) => i.status === "pending");

  async function handleSend() {
    if (parsedEmails.length === 0) return;
    const result = await inv.sendInvites(parsedEmails);
    if (result.sent > 0) {
      toast.success(
        result.sent === 1
          ? "Invitation sent."
          : `${result.sent} invitations sent.`,
      );
      setEmailText("");
      onRosterChanged?.();
    }
    for (const f of result.failed) {
      toast.error(`${f.email}: ${f.reason}`);
    }
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const emails = extractEmails(text);
    if (emails.length === 0) {
      toast.error("No email addresses found in that file.");
      return;
    }
    // Merge into the textarea so the teacher reviews before sending.
    setEmailText((prev) => {
      const merged = extractEmails(`${prev}\n${emails.join("\n")}`);
      return merged.join("\n");
    });
    toast.success(
      `Found ${emails.length} email ${emails.length === 1 ? "address" : "addresses"}. Review and send.`,
    );
  }

  return (
    <>
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title={`Invite students to ${className}`}
      description="Share a join code, send email invitations, or import a class roster."
      expandButtonLabel="Invite"
      initialFocus
      position="right"
      defaultSize={34}
      minSize={24}
      contentClassName="flex min-h-0 flex-1 flex-col p-0"
    >
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
          {/* ── Join code + link ─────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Ticket className="h-3.5 w-3.5" />
              Join code
            </h3>
            {inv.codeLoading && inv.code === null ? (
              <Skeleton className="h-12 w-full" />
            ) : inv.code ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-xl font-semibold tracking-[0.25em] text-foreground">
                    {inv.code}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => copyText(inv.code!, "Code")}
                    aria-label="Copy join code"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => copyText(classJoinUrl(inv.code!), "Join link")}
                  >
                    <LinkIcon className="h-3.5 w-3.5" />
                    Copy join link
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-xs"
                    disabled={inv.codeLoading}
                    onClick={() => inv.rotateCode()}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    New code
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-xs text-muted-foreground"
                    disabled={inv.codeLoading}
                    onClick={() => inv.disableCode()}
                  >
                    <X className="h-3.5 w-3.5" />
                    Turn off
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Anyone with this code or link can join — paste it in an email,
                  on the board, or in your class chat.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Code joining is off.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={inv.codeLoading}
                  onClick={() => inv.ensureCode()}
                >
                  Create a join code
                </Button>
              </div>
            )}
          </section>

          {/* ── Email + roster import ────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              Invite by email
            </h3>
          <Textarea
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              placeholder={
                "student1@school.edu, student2@school.edu\nor paste a whole roster — we pick out the email addresses"
              }
              rows={4}
              className="text-base sm:text-sm"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={parsedEmails.length === 0 || inv.sending}
                onClick={handleSend}
              >
                <Send className="h-3.5 w-3.5" />
                {inv.sending
                  ? "Sending…"
                  : parsedEmails.length > 1
                    ? `Send ${parsedEmails.length} invitations`
                    : "Send invitation"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Import roster (CSV)
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Each student gets an email with a link that enrolls them — it
              works even if they don&apos;t have an account yet.
            </p>
          </section>

          {/* ── Pending invitations ──────────────────────────────────── */}
          {(pending.length > 0 || inv.invitesLoading || inv.invitesError) && (
            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Invited (
                <UntrustedCount
                  value={pending.length}
                  trustworthy={!inv.invitesError}
                  label="Invited"
                />
                )
              </h3>
              {inv.invitesError ? (
                <ReadFailure
                  error={inv.invitesError}
                  what="the invitations"
                  onRetry={() => void inv.refreshInvites()}
                  className="m-0"
                />
              ) : inv.invitesLoading && pending.length === 0 ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <ul className="space-y-1.5">
                  {pending.map((invite) => (
                    <li
                      key={invite.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {invite.email}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {invite.token && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() =>
                              copyText(
                                classInviteAcceptUrl(invite.token!),
                                "Invite link",
                              )
                            }
                            aria-label="Copy invite link"
                          >
                            <LinkIcon className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={() => inv.resendInvite(invite.id)}
                          aria-label="Resend invitation"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => inv.revokeInvite(invite.id)}
                          aria-label="Withdraw invitation"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
    </MatrxDynamicPanelHost>
    <ClipboardFallbackDialog
      open={clipboardFallback !== null}
      onOpenChange={(o) => {
        if (!o) setClipboardFallback(null);
      }}
      url={clipboardFallback?.value ?? ""}
      title={`Copy ${clipboardFallback?.what.toLowerCase() ?? "link"}`}
    />
    </>
  );
}
