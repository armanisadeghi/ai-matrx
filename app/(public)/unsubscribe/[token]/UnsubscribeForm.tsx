"use client";

// The unsubscribe button the recipient actually presses.
//
// One click, no account, no "are you sure", no survey, no "manage preferences"
// maze. CAN-SPAM s.7704(a)(4) forbids requiring anything beyond a single web
// page, and every regime forbids charging or demanding information. The optional
// reason box below is exactly that — optional, after the fact, and skippable.

import { useState, useTransition } from "react";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/utils/supabase/client";

type Props = {
  token: string;
  organizationName: string | null;
  listName: string | null;
  maskedAddress: string | null;
  alreadyUnsubscribed: boolean;
};

export function UnsubscribeForm({
  token,
  organizationName,
  listName,
  maskedAddress,
  alreadyUnsubscribed,
}: Props) {
  const [done, setDone] = useState(alreadyUnsubscribed);
  const [failed, setFailed] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const sender = organizationName ?? "this sender";

  function handleUnsubscribe() {
    setFailed(false);
    startTransition(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("outreach_unsubscribe", {
        p_token: token,
        // The generated RPC args are optional, not nullable — omit rather than
        // widening the generated type.
        p_user_agent:
          typeof navigator === "undefined" ? undefined : navigator.userAgent,
        p_reason: reason.trim() || undefined,
      });
      // The RPC is idempotent and returns ok for an already-unsubscribed token,
      // so anything falsy here is a genuine failure worth showing.
      if (error || !(data as { ok?: boolean } | null)?.ok) {
        setFailed(true);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Check className="size-5 text-primary" aria-hidden />
          <h1 className="text-lg font-semibold text-foreground">
            You&apos;re unsubscribed
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {maskedAddress ? (
            <>
              <span className="font-medium text-foreground">{maskedAddress}</span>{" "}
              will not receive any further email from {sender}.
            </>
          ) : (
            <>You will not receive any further email from {sender}.</>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          This applies to every one of their campaigns, not just this one, and it
          takes effect immediately.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold text-foreground">
          Stop receiving these emails?
        </h1>
        <p className="text-sm text-muted-foreground">
          {maskedAddress ? (
            <>
              <span className="font-medium text-foreground">{maskedAddress}</span>{" "}
              is subscribed to email from{" "}
              <span className="font-medium text-foreground">{sender}</span>
              {listName ? <> ({listName})</> : null}.
            </>
          ) : (
            <>
              You are receiving email from{" "}
              <span className="font-medium text-foreground">{sender}</span>.
            </>
          )}
        </p>
      </div>

      <Button
        onClick={handleUnsubscribe}
        disabled={pending}
        className="w-full"
        size="lg"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            Unsubscribing…
          </>
        ) : (
          "Unsubscribe me"
        )}
      </Button>

      {failed ? (
        <p className="text-sm text-destructive">
          Something went wrong on our end. Please try once more — or reply to the
          message with the word <span className="font-medium">unsubscribe</span>{" "}
          and we&apos;ll stop contacting you.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="unsubscribe-reason"
          className="text-xs text-muted-foreground"
        >
          Anything you want to tell them? (optional)
        </label>
        <Textarea
          id="unsubscribe-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          // 16px minimum prevents the iOS zoom-on-focus jump.
          className="text-base"
          placeholder="Not required"
        />
      </div>
    </div>
  );
}
