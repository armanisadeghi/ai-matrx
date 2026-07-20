// features/education/compliance/components/AgeBandPrivacyCard.tsx
//
// The age-band + COPPA-status card for the "Your data & privacy" surface. Lets a
// user declare their age band (stored on users.profiles.age_band) and shows the
// live gate verdict: an under-13 with no active guardian link sees the "a parent
// must approve" state with a link to the guardian-consent flow (reused, not
// re-built). Setting the band re-checks the gate so the status updates in place.

"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, Loader2, CalendarClock } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { coppaService } from "../coppaService";
import { useAiComplianceGate } from "../useAiComplianceGate";
import type { AgeBand } from "../types";

const BANDS: { value: AgeBand; label: string }[] = [
  { value: "under_13", label: "Under 13" },
  { value: "13_17", label: "13–17" },
  { value: "adult", label: "18+" },
];

export function AgeBandPrivacyCard() {
  const gate = useAiComplianceGate();
  const [saving, setSaving] = useState<AgeBand | null>(null);

  const setBand = async (band: AgeBand) => {
    setSaving(band);
    const res = await coppaService.setAgeBand(band);
    setSaving(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    gate.reload();
  };

  const current = gate.gate?.ageBand ?? null;
  const blocked = gate.gate ? !gate.gate.aiAllowed : false;
  const pendingVerify = gate.gate?.reason === "guardian_verification_pending";

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Age &amp; parental consent</h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        We use your age band to keep the account compliant with children&apos;s
        privacy rules (COPPA). Under-13 accounts need a parent&apos;s approval
        before using AI features.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {BANDS.map((b) => (
          <Button
            key={b.value}
            size="sm"
            variant={current === b.value ? "default" : "outline"}
            disabled={saving !== null || gate.loading}
            onClick={() => setBand(b.value)}
          >
            {saving === b.value ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {b.label}
          </Button>
        ))}
      </div>

      {gate.loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking status…
        </div>
      ) : blocked ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="space-y-1">
            {pendingVerify ? (
              <>
                <p className="font-medium">Waiting for a parent to verify consent.</p>
                <p className="text-muted-foreground">
                  A parent is linked but still needs to complete a verifiable-consent
                  step (COPPA). Ask them to tap <strong>Verify consent</strong> on the{" "}
                  <Link href="/education/family" className="text-primary hover:underline">
                    Family page
                  </Link>
                  . It unlocks automatically once they do.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">A parent must approve before AI features unlock.</p>
                <p className="text-muted-foreground">
                  Set up parent approval on the{" "}
                  <Link href="/education/family" className="text-primary hover:underline">
                    Family page
                  </Link>
                  . It unlocks once they approve and verify.
                </p>
              </>
            )}
          </div>
        </div>
      ) : current ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-xs text-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500" />
          <span>
            {current === "under_13"
              ? "A parent has approved this account — AI features are unlocked."
              : "AI features are available on this account."}
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Pick your age band above so we can apply the right privacy protections.
        </p>
      )}
    </section>
  );
}
