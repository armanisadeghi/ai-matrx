"use client";

// Make one-time free-time coupons (billing.coupon_create). Existing-account coupons are codes
// (MX-XXXX-XXXX) a signed-in person redeems; new-account coupons are one-time sign-up links the
// database returns ONCE — so the result view here is the only place a link is ever shown.
// Months are capped by billing/free_period_max_months and the batch by billing/coupon_batch_max,
// both read live; recipients make one coupon each (pasted emails/phones, or picked people for
// existing-account coupons).

import { useEffect, useState } from "react";
import { Send, X } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@ai-matrx/design-system/controls";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { UserSearchField } from "@/features/user-search/UserSearchField";
import { fetchPlans } from "@/features/admin/limits/service";
import type { Plan } from "@/features/admin/limits/types";
import { createCoupons, fetchFreeTimeKnobs, type FreeTimeKnobs } from "../service/coupons";
import {
  KIND_LABEL,
  couponRedeemable,
  monthsLabel,
  parseRecipients,
  validateMonths,
  type CouponKind,
  type CouponRecipient,
  type CreatedCoupon,
} from "../lib/coupons";
import { USERS_ADMIN_LOCATION } from "../constants";
import { freeTimePlans, planOptionLabel } from "./GiveFreeMonthsDialog";

import { Spinner } from "@/components/ui/loaders/Spinner";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
interface PickedPerson {
  id: string;
  label: string;
}

export function CreateCouponDialog({
  open,
  onClose,
  onCreated,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onSend: (coupon: CreatedCoupon, redeemable: string, planName: string, recipientLabel: string | null) => void;
}) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [knobs, setKnobs] = useState<FreeTimeKnobs | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<CouponKind>("existing_account");
  const [planKey, setPlanKey] = useState("");
  const [months, setMonths] = useState("1");
  const [count, setCount] = useState("1");
  const [pasted, setPasted] = useState("");
  const [people, setPeople] = useState<PickedPerson[]>([]);
  const [query, setQuery] = useState("");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedCoupon[] | null>(null);

  const [seeded, setSeeded] = useState(false);
  if (open && !seeded) {
    setSeeded(true);
    setKind("existing_account");
    setMonths("1");
    setCount("1");
    setPasted("");
    setPeople([]);
    setQuery("");
    setExpires("");
    setNote("");
    setCreated(null);
  }
  if (!open && seeded) setSeeded(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([fetchPlans(), fetchFreeTimeKnobs()])
      .then(([rows, k]) => {
        if (cancelled) return;
        setPlans(freeTimePlans(rows));
        setKnobs(k);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const { recipients: pastedRecipients, invalid } = parseRecipients(pasted);
  const recipients: CouponRecipient[] = [
    ...(kind === "existing_account" ? people.map((p) => ({ user_id: p.id })) : []),
    ...pastedRecipients,
  ];
  const monthsNum = Number(months);
  const countNum = Number(count);
  const monthsError = knobs ? validateMonths(monthsNum, knobs.maxMonths) : null;
  const total = recipients.length > 0 ? recipients.length : countNum;
  const batchError =
    !knobs ? null
    : !Number.isInteger(total) || total < 1 ? "At least 1 coupon"
    : total > knobs.batchMax ? `At most ${knobs.batchMax} at once`
    : null;
  const planName = (key: string) => plans?.find((p) => p.plan_key === key)?.name ?? key;
  const labelFor = (c: CreatedCoupon) =>
    (c.recipient_user_id ? people.find((p) => p.id === c.recipient_user_id)?.label : null) ??
    c.recipient_email ??
    c.recipient_phone ??
    null;

  const create = async () => {
    if (!planKey || monthsError || batchError || invalid.length > 0) return;
    setSaving(true);
    try {
      const rows = await createCoupons({
        kind,
        planKey,
        months: monthsNum,
        count: recipients.length > 0 ? recipients.length : countNum,
        recipients,
        expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
        note: note.trim() || null,
      });
      setCreated(rows);
      toast.success(`${rows.length} coupon${rows.length === 1 ? "" : "s"} made`);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const createdText = (created ?? [])
    .map((c) => [couponRedeemable(c, origin), labelFor(c)].filter(Boolean).join("  "))
    .join("\n");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{created ? "Coupons made" : "New coupons"}</DialogTitle>
          <DialogDescription>
            {created
              ? created[0]?.kind === "new_account"
                ? "Links show only now. Copy or send them before closing."
                : `${created.length} one-time code${created.length === 1 ? "" : "s"}`
              : knobs
                ? `Up to ${monthsLabel(knobs.maxMonths)}, ${knobs.batchMax} per batch`
                : "One-time free time"}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="space-y-2">
            <div className="flex justify-end">
              <CopyButtons
                size="sm"
                label="New coupons"
                human={() => createdText}
                agent={() => ({
                  kind: "free-time-coupons",
                  location: USERS_ADMIN_LOCATION,
                  description: "One-time free-time coupons just made in the admin console.",
                  data: {
                    coupons: (created ?? []).map((c) => ({
                      redeem: couponRedeemable(c, origin),
                      kind: c.kind,
                      plan: c.plan_key,
                      months: c.months,
                      recipient: labelFor(c),
                      expires_at: c.expires_at,
                    })),
                  },
                })}
              />
            </div>
            <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded border border-border type-body">
              {created.map((c) => {
                const redeemable = couponRedeemable(c, origin) ?? c.code;
                return (
                  <li key={c.id} className="flex items-center gap-2 px-2 py-1.5">
                    <code className="min-w-0 flex-1 truncate font-mono type-secondary" title={redeemable}>
                      {redeemable}
                    </code>
                    <span className="max-w-[140px] truncate type-secondary text-muted-foreground">{labelFor(c) ?? ""}</span>
                    <Button
                      icon={<Send />}
                      variant="outline"
                      onClick={() => onSend(c, redeemable, planName(c.plan_key), labelFor(c))}
                    >
                      Send
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            {loadError && <p className="type-body text-destructive">{loadError}<ErrorAlchemyMenu error={loadError} /></p>}
            <div className="grid grid-cols-2 gap-2">
              <Select value={kind} onValueChange={(v) => setKind(v as CouponKind)}>
                <SelectTrigger aria-label="Kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as CouponKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={planKey} onValueChange={setPlanKey} disabled={!plans}>
                <SelectTrigger aria-label="Plan">
                  <SelectValue placeholder={plans ? "Choose a plan" : "Loading plans…"} />
                </SelectTrigger>
                <SelectContent>
                  {(plans ?? []).map((plan) => (
                    <SelectItem key={plan.plan_key} value={plan.plan_key}>
                      {planOptionLabel(plan, plans ?? [])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="block space-y-1 text-xs text-muted-foreground">
                <span>Months</span>
                <Input type="number" min={1} max={knobs?.maxMonths} value={months} onChange={(e) => setMonths(e.target.value)} />
                {monthsError && <span className="text-destructive">{monthsError}<ErrorAlchemyMenu error={monthsError} /></span>}
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">
                <span>How many</span>
                <Input
                  type="number"
                  min={1}
                  max={knobs?.batchMax}
                  value={recipients.length > 0 ? String(recipients.length) : count}
                  disabled={recipients.length > 0}
                  title={recipients.length > 0 ? "One per recipient" : undefined}
                  onChange={(e) => setCount(e.target.value)}
                />
                {batchError && <span className="text-destructive">{batchError}<ErrorAlchemyMenu error={batchError} /></span>}
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">
                <span>Expires</span>
                <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </label>
            </div>
            {kind === "existing_account" && (
              <div className="space-y-2">
                <UserSearchField
                  value={query}
                  onValueChange={setQuery}
                  directory="admin"
                  title="Add a recipient"
                  placeholder="Add a person (optional)…"
                  excludeUserIds={people.map((p) => p.id)}
                  onUserSelect={(user) => {
                    setPeople((prev) =>
                      prev.some((p) => p.id === user.id)
                        ? prev
                        : [...prev, { id: user.id, label: user.displayName || user.email || user.id }],
                    );
                    setQuery("");
                  }}
                />
                {people.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {people.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 type-secondary">
                        {p.label}
                        <button
                          type="button"
                          aria-label={`Remove ${p.label}`}
                          onClick={() => setPeople((prev) => prev.filter((x) => x.id !== p.id))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>Emails or phones (optional, one per line)</span>
              <Textarea rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} />
              {invalid.length > 0 && (
                <span className="text-destructive">Not an email or phone: {invalid.slice(0, 3).join(", ")}</span>
              )}
            </label>
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>Note (optional)</span>
              <Input value={note} placeholder="Conference giveaway" onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="quiet" onClick={onClose}>
            {created ? "Done" : "Cancel"}
          </Button>
          {!created && (
            <Button
              icon={saving && <Spinner size="xs" className="text-current" />}
              variant="primary"
              onClick={() => void create()}
              disabled={saving || !planKey || !knobs || !!monthsError || !!batchError || invalid.length > 0}
            >
              Make {total > 0 && Number.isFinite(total) ? total : ""} coupon{total === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
