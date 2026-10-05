"use client";

// Send one coupon by in-app message, email or text. The text is a short editable draft carrying
// the code (existing account) or the one-time sign-up link (new account — only available right
// after creation, because the database keeps just the link's hash). Every send goes through the
// platform's own path and is then recorded on the coupon (billing.coupon_mark_sent).

import { useState } from "react";
import { Loader2, Mail, MessageSquare, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { UserSearchField } from "@/features/user-search/UserSearchField";
import { sendCoupon } from "../service/coupons";
import { draftCouponMessage, normalizePhone, type CouponKind, type SendChannel } from "../lib/coupons";

export interface SendCouponTarget {
  couponId: string;
  kind: CouponKind;
  months: number;
  planName: string;
  /** The code, or the full one-time link. */
  redeemable: string;
  userId: string | null;
  userLabel: string | null;
  email: string | null;
  phone: string | null;
}

const CHANNELS: Array<{ id: SendChannel; label: string; Icon: typeof Mail }> = [
  { id: "dm", label: "Message", Icon: MessageSquare },
  { id: "email", label: "Email", Icon: Mail },
  { id: "sms", label: "Text", Icon: Smartphone },
];

function defaultChannel(t: SendCouponTarget): SendChannel {
  if (t.phone) return "sms";
  if (t.email) return "email";
  return t.kind === "existing_account" ? "dm" : "email";
}

export function SendCouponDialog({
  target,
  onClose,
  onSent,
}: {
  target: SendCouponTarget | null;
  onClose: () => void;
  onSent?: () => void;
}) {
  const organizationId = useAppSelector(selectOrganizationId);
  const [channel, setChannel] = useState<SendChannel>("dm");
  const [userId, setUserId] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (target && seededFor !== target.couponId) {
    setSeededFor(target.couponId);
    setChannel(defaultChannel(target));
    setUserId(target.userId);
    setUserLabel(target.userLabel ?? "");
    setEmail(target.email ?? "");
    setPhone(target.phone ?? "");
    setSubject(`${target.months} free month${target.months === 1 ? "" : "s"} of AI Matrx`);
    setMessage(
      draftCouponMessage({
        kind: target.kind,
        redeemable: target.redeemable,
        planName: target.planName,
        months: target.months,
        origin: window.location.origin,
      }),
    );
  }
  if (!target && seededFor) setSeededFor(null);

  const dmAllowed = target?.kind === "existing_account";
  const phoneOk = channel !== "sms" || normalizePhone(phone) !== null;
  const ready =
    message.trim().length > 0 &&
    (channel === "dm" ? !!userId : channel === "email" ? !!email.trim() || !!userId : phoneOk);

  const send = async () => {
    if (!target || !ready) return;
    setSending(true);
    try {
      await sendCoupon({
        couponId: target.couponId,
        channel,
        message: message.trim(),
        subject: subject.trim() || "A gift from AI Matrx",
        userId,
        email: email.trim() || null,
        phone: channel === "sms" ? normalizePhone(phone) : null,
        organizationId,
      });
      toast.success(channel === "dm" ? "Message sent" : channel === "email" ? "Email sent" : "Text sent");
      onSent?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send coupon</DialogTitle>
          <DialogDescription className="truncate">{target?.redeemable}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-1" role="tablist" aria-label="Channel">
            {CHANNELS.map(({ id, label, Icon }) => {
              const disabled = id === "dm" && !dmAllowed;
              return (
                <Button
                  icon={<Icon />}
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={channel === id}
                  variant={channel === id ? "primary" : "outline"}
                  disabled={disabled}
                  title={disabled ? "A new-account coupon goes to an email or phone" : undefined}
                  className="flex-1"
                  onClick={() => setChannel(id)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
          {(channel === "dm" || (channel === "email" && dmAllowed)) && (
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>Person</span>
              <UserSearchField
                value={userLabel}
                onValueChange={(v) => {
                  setUserLabel(v);
                  setUserId(null);
                }}
                directory="admin"
                title="Send to"
                placeholder="Find a person…"
                onUserSelect={(user) => {
                  setUserId(user.id);
                  setUserLabel(user.displayName || user.email || user.id);
                  if (!email && user.email) setEmail(user.email);
                  if (!phone && user.phone) setPhone(user.phone);
                }}
              />
            </label>
          )}
          {channel === "email" && (
            <>
              <label className="block space-y-1 text-xs text-muted-foreground">
                <span>Email</span>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">
                <span>Subject</span>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
            </>
          )}
          {channel === "sms" && (
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>Phone</span>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              {!phoneOk && phone.trim() && <span className="text-destructive">Not a phone number</span>}
            </label>
          )}
          <label className="block space-y-1 text-xs text-muted-foreground">
            <span>Message</span>
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={sending && <Loader2 className="animate-spin" />} variant="primary" onClick={() => void send()} disabled={sending || !ready}>
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
