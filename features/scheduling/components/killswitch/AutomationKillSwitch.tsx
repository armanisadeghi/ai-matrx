"use client";

/**
 * THE pause-everything switch, one strip on the automation admin pages (platform seat and
 * organization seat). The strip has a fixed height in both states, so turning it on moves
 * nothing below it. ON is loud: red band, a lit indicator, and the consequence in words.
 */
import { useCallback, useEffect, useState } from "react";
import { OctagonAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { IndicatorStrip } from "@ai-matrx/design-system/controls";
import {
  fetchKillSwitch,
  setOrgKillSwitch,
  setPlatformKillSwitch,
  type KillSwitchState,
} from "@/features/scheduling/service/killSwitch";

export function AutomationKillSwitch({ seat, orgId }: { seat: "admin" | "org"; orgId: string | null }) {
  const [state, setState] = useState<KillSwitchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setState(await fetchKillSwitch(seat === "org" ? orgId : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [seat, orgId]);
  useEffect(() => {
    void load();
  }, [load]);

  const platformOn = state?.platform ?? false;
  const effective = seat === "org" ? (state?.effectiveForOrg ?? false) : platformOn;
  const heldByPlatform = seat === "org" && platformOn;
  const scopeWord = seat === "admin" ? "the platform" : "this organization";

  const flip = async (on: boolean) => {
    setBusy(true);
    try {
      if (seat === "admin") await setPlatformKillSwitch(on);
      else if (orgId) await setOrgKillSwitch(orgId, on);
      setConfirming(false);
      await load();
      toast.success(on ? "All automations are paused" : "Pause switch is off");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="automation-kill-switch"
      data-state={state ? (effective ? "on" : "off") : "loading"}
      role={effective ? "alert" : "status"}
      className={`flex h-10 shrink-0 items-center gap-3 rounded-md border px-3 text-sm ${
        effective
          ? "border-destructive bg-destructive text-destructive-foreground"
          : "border-border bg-muted/30 text-muted-foreground"
      }`}
    >
      <IndicatorStrip
        items={[
          {
            id: "kill_switch",
            icon: OctagonAlert,
            label: "Pause switch",
            on: effective,
            tone: "danger",
            detail: effective ? `Every automation of ${scopeWord} is stopped` : undefined,
          },
        ]}
      />
      <span className="min-w-0 flex-1 truncate">
        {error
          ? error
          : !state
            ? "Reading the pause switch"
            : effective
              ? heldByPlatform
                ? "Paused by the platform. Every automation is stopped."
                : `All automations of ${scopeWord} are stopped. Turning off resumes nothing.`
              : "Automations are running."}
      </span>
      {state && !heldByPlatform && (
        <Button
          variant={effective ? "outline" : "danger"}
          disabled={busy}
          onClick={() => (effective ? void flip(false) : setConfirming(true))}
        >
          {effective ? "Turn off" : "Pause all"}
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Pause all automations?"
        description="Every automation stops until you turn this off."
        confirmLabel="Pause all"
        variant="destructive"
        busy={busy}
        onConfirm={() => void flip(true)}
      />
    </div>
  );
}
