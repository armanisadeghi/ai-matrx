"use client";

import { useState } from "react";
import {
  Check,
  KeyRound,
  Loader2,
  Send,
  ShieldCheck,
  Trash2,
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useAccessGate } from "@/features/access-gate/hooks/useAccessGate";
import {
  createAccessRequest,
  createDeleteRequest,
} from "@/features/access-gate/service/accessRequests";

type RequestChoice = "delete" | "full";

export function GovernedActionDialog({
  open,
  onOpenChange,
  resourceType,
  resourceId,
  itemName,
  itemLabel = "site",
  href,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: string;
  resourceId: string;
  itemName: string;
  itemLabel?: string;
  href?: string | null;
}) {
  const currentUserId = useAppSelector(selectUserId);
  const { context, isLoading } = useAccessGate(resourceType, resourceId, {
    enabled: open,
  });
  const [choice, setChoice] = useState<RequestChoice>("delete");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<RequestChoice | null>(null);

  const ownerName =
    context?.owner?.displayName ??
    (context?.organization && !context.organization.isPersonal
      ? context.organization.name
      : null) ??
    "the owner";

  async function sendRequest() {
    setBusy(true);
    try {
      const result =
        choice === "delete"
          ? await createDeleteRequest({
              resourceType,
              resourceId,
              message: note,
              currentUserId,
              href,
            })
          : await createAccessRequest({
              resourceType,
              resourceId,
              level: "admin",
              message: note,
              currentUserId,
              href,
            });
      setSent(choice);
      if (result.already) {
        toast.success("Your request is already waiting for an answer.");
      } else if (result.delivered === 0) {
        toast.warning(
          "Your request is saved, but we couldn't message them just now.",
        );
      } else {
        toast.success(
          `Request sent to ${result.recipients[0]?.displayName ?? ownerName}.`,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't send that request.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
            <Trash2 className="h-5 w-5 text-destructive" aria-hidden />
          </div>
          <DialogTitle>
            Full access is needed to delete this {itemLabel}
          </DialogTitle>
          <DialogDescription>
            You can edit{" "}
            <span className="font-medium text-foreground">{itemName}</span>, but
            deleting work owned by someone else needs full access. Ask{" "}
            {ownerName}
            to delete it, or ask them to give you full access.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Finding the person who can help…
          </div>
        ) : context?.status === "error" || context?.status === "anonymous" ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            We couldn't find the right person to contact. Try again after
            refreshing.
          </div>
        ) : sent ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Check className="h-4 w-4 text-primary" aria-hidden />
              {sent === "delete"
                ? "Deletion requested"
                : "Full access requested"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The request is saved in Access requests and sent to {ownerName} in
              Messages.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <RequestChoiceButton
                active={choice === "delete"}
                icon={<Trash2 className="h-4 w-4" aria-hidden />}
                title="Ask them to delete it"
                detail="They can approve and delete it directly from your message."
                onClick={() => setChoice("delete")}
              />
              <RequestChoiceButton
                active={choice === "full"}
                icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
                title="Request full access"
                detail="You can manage sharing and delete it yourself after approval."
                onClick={() => setChoice("full")}
              />
            </div>
            <Textarea
              className="min-h-20 text-base md:text-sm"
              value={note}
              maxLength={500}
              placeholder="Add a note for the owner (optional)"
              onChange={(event) => setNote(event.target.value)}
            />
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {sent ? "Done" : "Cancel"}
          </Button>
          {!sent &&
          context?.status !== "error" &&
          context?.status !== "anonymous" ? (
            <Button
              disabled={busy || isLoading}
              onClick={() => void sendRequest()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : choice === "delete" ? (
                <Send className="h-4 w-4" aria-hidden />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden />
              )}
              Send request
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestChoiceButton({
  active,
  icon,
  title,
  detail,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition-colors ${
        active
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-muted/40"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        {icon}
        {title}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}
