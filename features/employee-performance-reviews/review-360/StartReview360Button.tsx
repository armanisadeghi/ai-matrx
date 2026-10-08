"use client";

// "Start 360 review" on the employee's HR profile: finds the manager from the HR record the
// profile already read (header.manager_employee_id → that profile's login), then starts.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { useRecordsClient } from "@ai-matrx/records/react";

import { fetchHrEmployeeProfile } from "@/features/hr/service";
import type { HrEmployeeProfile } from "@/features/hr/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";

import { Review360Host, useConfidentialServerStep } from "./Review360Host";
import { readReview360Knobs, startReview360 } from "./service";

export function StartReview360Button({ profile }: { profile: HrEmployeeProfile }) {
  // Only an HR seat that sees the login (self or hr_admin) can start one; the server refuses others.
  if (profile.header.login_user_id === undefined) return null;
  return (
    <Review360Host organizationId={profile.organization_id}>
      <StartButton profile={profile} />
    </Review360Host>
  );
}

function StartButton({ profile }: { profile: HrEmployeeProfile }) {
  const client = useRecordsClient();
  const serverStep = useConfidentialServerStep();
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const [busy, setBusy] = useState(false);
  const h = profile.header;

  const start = async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      let manager: { name: string | null; userId: string | null } | null = null;
      if (h.manager_employee_id) {
        const m = await fetchHrEmployeeProfile({ employeeId: h.manager_employee_id });
        manager = { name: h.manager_name, userId: m.ok ? (m.data.header.login_user_id ?? null) : null };
      }
      const knobs = await readReview360Knobs(profile.organization_id, userId);
      if (!knobs.ok) throw new Error(knobs.message);
      const started = await startReview360({
        client,
        organizationId: profile.organization_id,
        serverStep,
        hrUserId: userId,
        employee: { employeeId: h.employee_id, name: h.display_name, userId: h.login_user_id ?? null },
        manager,
        knobs: knobs.data,
        origin: window.location.origin,
      });
      if (!started.ok) throw new Error(started.message);
      toast.success("360 review started");
      router.push(`/hr/performance?org=${profile.organization_id}`);
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" icon={<ClipboardCheck />} onClick={() => void start()} disabled={busy}>
      {busy ? "Starting…" : "Start 360 review"}
    </Button>
  );
}
