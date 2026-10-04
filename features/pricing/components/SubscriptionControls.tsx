"use client";

import { useEffect, useState } from "react";
import { Button } from "@ai-matrx/design-system/controls";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { fetchWithOrganization } from "@/lib/organizations/fetchWithOrganization";
import { toast } from "@/lib/toast";

/** A visible return path to invoices, payment methods and cancellation. */
export function SubscriptionControls({ livemode }: { livemode: boolean }) {
  const userId = useAppSelector(selectUserId);
  const [hasCustomer, setHasCustomer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setHasCustomer(false);
    setError(false);
    if (!userId) return;
    void createClient()
      .schema("billing")
      .from("customer")
      .select("id")
      .eq("beneficiary_user_id", userId)
      .eq("livemode", livemode)
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
  }, [userId, livemode]);

  async function manage() {
    setBusy(true);
    try {
      const response = await fetchWithOrganization("/api/stripe/portal", {
        method: "POST",
      });
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
      <p role="alert" className="text-sm text-destructive">
        Billing could not be loaded. Refresh to try again.
      </p>
    );
  if (!hasCustomer) return null;
  return (
    <div className="flex justify-center">
      <Button variant="outline" disabled={busy} onClick={manage}>
        {busy ? "Opening billing…" : "Manage subscription"}
      </Button>
    </div>
  );
}
