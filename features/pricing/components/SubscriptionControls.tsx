"use client";

import { useEffect, useState } from "react";
import { Button } from "@ai-matrx/design-system/controls";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { fetchWithOrganization } from "@/lib/organizations/fetchWithOrganization";
import { toast } from "@/lib/toast";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/** A visible return path to invoices, payment methods and cancellation. */
export type SubscriptionScope =
  | { kind: "personal" }
  | { kind: "organization"; organizationId: string };

export function SubscriptionControls({
  livemode,
  scope = { kind: "personal" },
  label = "Manage subscription",
  hasPurchasedSubscription = false,
}: {
  livemode: boolean;
  scope?: SubscriptionScope;
  label?: string;
  hasPurchasedSubscription?: boolean;
}) {
  const userId = useAppSelector(selectUserId);
  if (!userId) return null;
  return <AccountSubscriptionControls key={`${userId}:${livemode}:${scope.kind}:${scope.kind === "organization" ? scope.organizationId : ""}:${hasPurchasedSubscription}`} userId={userId} livemode={livemode} scope={scope} label={label} hasPurchasedSubscription={hasPurchasedSubscription} />;
}

function AccountSubscriptionControls({ userId, livemode, scope, label, hasPurchasedSubscription }: { userId: string; livemode: boolean; scope: SubscriptionScope; label: string; hasPurchasedSubscription: boolean }) {
  const [hasCustomer, setHasCustomer] = useState(hasPurchasedSubscription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    // A verified purchased row already establishes the management affordance.
    // The portal validates its own fresh payer; a second client presence read
    // must not hide management while slow, filtered or unavailable.
    if (hasPurchasedSubscription) return;
    let active = true;
    const customers = createClient().schema("billing").from("customer").select("id").eq("livemode", livemode);
    const ownedCustomer = scope.kind === "personal"
      ? customers.eq("beneficiary_user_id", userId)
      : customers.eq("organization_id", scope.organizationId).is("beneficiary_user_id", null);
    void ownedCustomer
      .maybeSingle()
      .then(({ data, error: readError }) => {
        if (active) {
          setHasCustomer(!!data);
          setError(!!readError);
        }
      });
    return () => {
      active = false;
    };
  }, [userId, livemode, scope, hasPurchasedSubscription]);

  async function manage() {
    setBusy(true);
    try {
      const response = await fetchWithOrganization("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: scope.kind }),
      }, { organizationId: scope.kind === "organization" ? scope.organizationId : null });
      const body: unknown = await response.json();
      if (
        !response.ok ||
        !body ||
        typeof body !== "object" ||
        !("url" in body) ||
        typeof body.url !== "string"
      ) {
        throw new Error("Couldn't open billing. Please try again.");
      }
      window.location.assign(body.url);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't open billing.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <div role="alert" className="text-sm text-destructive">
        Billing could not be loaded. Refresh to try again.
        <ErrorAlchemyMenu />
      </div>
    );
  if (!hasCustomer) return null;
  return (
    <div className="flex justify-center">
      <Button variant="outline" disabled={busy} onClick={manage}>
        {busy ? "Opening billing…" : label}
      </Button>
    </div>
  );
}
