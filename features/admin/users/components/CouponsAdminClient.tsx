"use client";

// Users & Access › Free time & coupons (/administration/users/coupons).
//
// Free time is never endless (Arman 2026-10-04; entitlements-knobs FEATURE.md rule 18): every
// coupon is one-time and every grant is dated, capped by billing/free_period_max_months. This
// tab lists every coupon (billing.coupon + its redemption), makes new ones (CreateCouponDialog),
// sends them by message / email / text (SendCouponDialog), withdraws them (coupon_revoke), and
// gives free months directly with no code (GiveFreeMonthsDialog → free_months_apply).
//
// DOOR LAW: a recipient or redeemer that is an account renders AdminUserRef (it opens the
// person); an email/phone recipient has no record yet, so it is shown as text.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Gift, Plus, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { readOf } from "@ai-matrx/design-system";
import { fetchPlans } from "@/features/admin/limits/service";
import { AdminUserRef } from "./AdminUserRef";
import { CreateCouponDialog } from "./CreateCouponDialog";
import { GiveFreeMonthsDialog } from "./GiveFreeMonthsDialog";
import { SendCouponDialog, type SendCouponTarget } from "./SendCouponDialog";
import { USERS_ADMIN_LOCATION } from "../constants";
import { fetchCoupons, revokeCoupon } from "../service/coupons";
import {
  KIND_LABEL,
  STATUS_LABEL,
  couponStatus,
  monthsLabel,
  type CouponRow,
  type CouponStatus,
} from "../lib/coupons";

const STATUS_CLASS: Record<CouponStatus, string> = {
  active: "text-emerald-600 border-emerald-500/40 bg-emerald-500/10",
  redeemed: "text-sky-600 border-sky-500/40 bg-sky-500/10",
  revoked: "text-rose-600 border-rose-500/40 bg-rose-500/10",
  expired: "text-muted-foreground border-border",
};

type Row = CouponRow & { status: CouponStatus; recipient: string };

function recipientText(r: CouponRow): string {
  return r.recipient_email ?? r.recipient_phone ?? (r.recipient_user_id ? "account" : "");
}

function summary(r: Row): string {
  return [
    `Coupon: ${r.kind === "new_account" ? "sign-up link" : r.code}`,
    `Kind: ${KIND_LABEL[r.kind]}`,
    `Plan: ${r.plan_key} · ${monthsLabel(r.months)}`,
    `Status: ${STATUS_LABEL[r.status]}`,
    r.recipient ? `Recipient: ${r.recipient}` : null,
    r.expires_at ? `Expires: ${new Date(r.expires_at).toLocaleDateString()}` : null,
    r.note ? `Note: ${r.note}` : null,
    `Created: ${new Date(r.created_at).toLocaleString()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function CouponsAdminClient() {
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [planNames, setPlanNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [giving, setGiving] = useState(false);
  const [sendTarget, setSendTarget] = useState<SendCouponTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [coupons, plans] = await Promise.all([fetchCoupons(), fetchPlans()]);
      setRows(coupons);
      setPlanNames(Object.fromEntries(plans.map((p) => [p.plan_key, p.name])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const data: Row[] = useMemo(() => {
    const now = new Date();
    return rows.map((r) => ({ ...r, status: couponStatus(r, now), recipient: recipientText(r) }));
  }, [rows]);

  const revoke = useCallback(
    async (row: Row) => {
      const ok = await confirm({
        title: "Revoke this coupon?",
        description:
          row.status === "redeemed"
            ? "It is already used. Revoking keeps the free time it gave."
            : "Nobody can redeem it after this. It cannot be restored.",
        confirmLabel: "Revoke",
        variant: "destructive",
      });
      if (!ok) return;
      try {
        await revokeCoupon(row.id);
        toast.success("Coupon revoked");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Revoke failed");
      }
    },
    [load],
  );

  const openSend = useCallback(
    (row: Row) => {
      setSendTarget({
        couponId: row.id,
        kind: row.kind,
        months: row.months,
        planName: planNames[row.plan_key] ?? row.plan_key,
        redeemable: row.code,
        userId: row.recipient_user_id,
        userLabel: null,
        email: row.recipient_email,
        phone: row.recipient_phone,
      });
    },
    [planNames],
  );

  const columns = useMemo((): MatrxColumnDef<Row>[] => {
    return [
      {
        id: "code",
        header: "Coupon",
        accessorFn: (r) => (r.kind === "new_account" ? "link" : r.code),
        cell: (r) =>
          r.kind === "new_account" ? (
            <span className="text-xs text-muted-foreground">Sign-up link</span>
          ) : (
            <code className="font-mono text-xs">{r.code}</code>
          ),
        width: 140,
      },
      {
        id: "kind",
        header: "Kind",
        accessorFn: (r) => KIND_LABEL[r.kind],
        filter: "select",
        width: 130,
      },
      {
        id: "plan",
        header: "Plan",
        accessorFn: (r) => planNames[r.plan_key] ?? r.plan_key,
        filter: "select",
        width: 110,
      },
      {
        id: "months",
        accessorKey: "months",
        header: "Months",
        width: 80,
      },
      {
        id: "recipient",
        header: "Recipient",
        accessorFn: (r) => r.recipient,
        cell: (r) =>
          r.recipient_user_id ? (
            <AdminUserRef userId={r.recipient_user_id} hideEmail />
          ) : r.recipient ? (
            <span className="truncate text-xs">{r.recipient}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 180,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => STATUS_LABEL[r.status],
        filter: "select",
        cell: (r) => {
          const redemption = r.redemptions[0];
          return (
            <div className="flex min-w-0 items-center gap-1.5">
              <Badge variant="outline" className={STATUS_CLASS[r.status]}>
                {STATUS_LABEL[r.status]}
              </Badge>
              {r.status === "redeemed" && redemption ? (
                <>
                  <AdminUserRef userId={redemption.redeemer_user_id} hideEmail />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(redemption.redeemed_at).toLocaleDateString()}
                  </span>
                </>
              ) : null}
            </div>
          );
        },
        width: 260,
      },
      {
        id: "sent",
        header: "Sent",
        accessorFn: (r) => r.sent.map((s) => s.channel).join(", "),
        cell: (r) => {
          const last = r.sent[r.sent.length - 1];
          return last ? (
            <span className="text-xs text-muted-foreground" title={last.address ?? undefined}>
              {last.channel.toUpperCase()} · {new Date(last.sent_at).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
        width: 120,
      },
      {
        id: "created_by",
        header: "Created by",
        accessorKey: "created_by",
        cell: (r) =>
          r.created_by ? <AdminUserRef userId={r.created_by} hideEmail /> : <span className="text-xs text-muted-foreground">—</span>,
        width: 150,
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Created",
        cell: (r) => <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>,
        width: 100,
      },
      {
        id: "note",
        accessorKey: "note",
        header: "Note",
        width: 160,
      },
      {
        id: "actions",
        header: "",
        sortable: false,
        cell: (r) => (
          <div className="flex items-center gap-1">
            <Button
              icon={<Send />}
              variant="quiet"
              disabled={r.status !== "active" || r.kind === "new_account"}
              title={r.kind === "new_account" ? "Links can be sent only when made" : "Send"}
              aria-label="Send coupon"
              onClick={(e) => {
                e.stopPropagation();
                openSend(r);
              }}
            />
            <Button
              icon={<Ban />}
              variant="quiet"
              disabled={r.status === "revoked"}
              title="Revoke"
              aria-label="Revoke coupon"
              onClick={(e) => {
                e.stopPropagation();
                void revoke(r);
              }}
            />
          </div>
        ),
        width: 90,
      },
    ];
  }, [planNames, openSend, revoke]);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          urlState={{ id: "user-coupons", selectedRow: false }}
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={loading}
          pageSize={50}
          read={readOf({ loading, error }, { what: "coupons", onRetry: () => void load() })}
          emptyState={{ title: "No coupons yet" }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search code, email, phone, note…",
            actions: (
              <div className="flex items-center gap-2">
                <Button icon={<Gift />} variant="outline" onClick={() => setGiving(true)}>
                  Give free months
                </Button>
                <Button icon={<Plus />} variant="primary" onClick={() => setCreating(true)}>
                  New coupons
                </Button>
              </div>
            ),
          }}
          copy={{
            label: "Coupon",
            listLabel: "Coupons (this view)",
            location: USERS_ADMIN_LOCATION,
            rowKind: "free-time-coupon",
            listKind: "free-time-coupons",
            humanRow: summary,
            rowAttributes: (r) => ({
              id: r.id,
              kind: r.kind,
              status: r.status,
              plan: r.plan_key,
              months: r.months,
            }),
          }}
        />
      </div>
      <CreateCouponDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => void load()}
        onSend={(c, redeemable, planName, recipientLabel) =>
          setSendTarget({
            couponId: c.id,
            kind: c.kind,
            months: c.months,
            planName,
            redeemable,
            userId: c.recipient_user_id,
            userLabel: c.recipient_user_id ? recipientLabel : null,
            email: c.recipient_email,
            phone: c.recipient_phone,
          })
        }
      />
      <GiveFreeMonthsDialog open={giving} people={[]} onClose={() => setGiving(false)} />
      <SendCouponDialog target={sendTarget} onClose={() => setSendTarget(null)} onSent={() => void load()} />
    </div>
  );
}
