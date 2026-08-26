/**
 * features/hr/time/devices/DeviceFleetTable.tsx — the fleet, its health, and its trust controls.
 *
 * 🚨 **REVOKING IS DESTRUCTIVE AND IS CONFIRMED AS SUCH.** It bricks a tablet within one heartbeat,
 * wherever it is, and there is no undo from the device's side — a revoked tablet must be paired
 * again from scratch. So it goes through `confirm({ variant: "destructive" })` with the consequence
 * spelled out. Browser `window.confirm` is banned repo-wide, including here.
 *
 * 🚨 **SKEW IS SHOWN AS A CONSEQUENCE, NOT A NUMBER.** `clockSkewSeconds: 940` means nothing to an
 * HR administrator. *"Punches are being refused"* means something, and it is the thing they have to
 * act on (§3.3 — beyond `max_clock_skew_seconds` the punch is refused and the device is flagged).
 * The raw seconds stay beside it, because the person fixing the tablet needs them.
 *
 * Every column sorts AND filters — `MatrxColumnDef.filter` defaults to `"auto"`, and the only column
 * that opts out is the actions column, which is not data.
 */

"use client";

import { useState } from "react";
import { ShieldCheck, ShieldOff, ShieldX } from "lucide-react";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { KioskDeviceRow, KioskTrustState } from "@/features/hr/time/api/types";
import { toast } from "@/lib/toast";

import type { KioskDeviceAdminSource } from "./deviceAdminSource";

const TRUST_LABEL: Record<KioskTrustState, string> = {
  pending: "Waiting for approval",
  trusted: "Approved",
  suspended: "Paused",
  revoked: "Revoked",
};

/**
 * Device telemetry, rendered in the **reader's** zone — deliberately, and this is the one place in
 * the Time lane where that is correct. §9 rule 1 binds *punch* timestamps to their stamped `tz`
 * because a punch is a work record read by people in other zones. "When did this tablet last check
 * in" is a fact about a machine's connectivity, has no stamped zone on the row, and is read by the
 * administrator who is about to go and look at it.
 */
function formatLastSeen(iso: string | null): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function DeviceFleetTable({
  rows,
  source,
  onChanged,
}: {
  rows: KioskDeviceRow[];
  source: KioskDeviceAdminSource;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function changeTrust(row: KioskDeviceRow, trustState: KioskTrustState) {
    const destructive = trustState === "revoked";
    const ok = await confirm({
      title: destructive ? `Revoke ${row.deviceName}?` : `Pause ${row.deviceName}?`,
      description: destructive
        ? "This tablet stops recording time within a minute and cannot be used again until it is paired from scratch. Anyone standing at it will see a message telling them to speak to their manager."
        : "This tablet stops recording time within a minute. You can approve it again at any time.",
      confirmLabel: destructive ? "Revoke this tablet" : "Pause this tablet",
      variant: destructive ? "destructive" : "default",
    });
    if (!ok) return;

    setBusyId(row.id);
    try {
      await source.setTrust({
        deviceId: row.id,
        trustState,
        reason: destructive ? "Revoked from device management" : "Paused from device management",
      });
      toast.success(destructive ? "Tablet revoked" : "Tablet paused");
      onChanged();
    } catch (cause: unknown) {
      toast.error(cause instanceof Error ? cause.message : "That did not go through.");
    } finally {
      setBusyId(null);
    }
  }

  async function approve(row: KioskDeviceRow) {
    setBusyId(row.id);
    try {
      await source.setTrust({
        deviceId: row.id,
        trustState: "trusted",
        reason: "Approved from device management",
      });
      toast.success(`${row.deviceName} can now record time`);
      onChanged();
    } catch (cause: unknown) {
      toast.error(cause instanceof Error ? cause.message : "That did not go through.");
    } finally {
      setBusyId(null);
    }
  }

  async function setCapture(row: KioskDeviceRow, next: { photo?: boolean; geo?: boolean }) {
    setBusyId(row.id);
    try {
      await source.setCapture({
        deviceId: row.id,
        requirePhoto: next.photo ?? row.requirePhoto,
        requireGeo: next.geo ?? row.requireGeo,
      });
      // §4.9: turning capture on is never retroactive, and the surface says so rather than leaving
      // an administrator to assume it backfills.
      toast.success("Saved. This applies to punches from now on, not to past ones.");
      onChanged();
    } catch (cause: unknown) {
      toast.error(cause instanceof Error ? cause.message : "That did not go through.");
    } finally {
      setBusyId(null);
    }
  }

  const columns: MatrxColumnDef<KioskDeviceRow>[] = [
    { accessorKey: "deviceName", header: "Tablet" },
    {
      accessorKey: "locationName",
      header: "Location",
      cell: (row) => row.locationName ?? "No location set",
    },
    {
      id: "trustState",
      accessorFn: (row) => TRUST_LABEL[row.trustState],
      header: "Status",
      cell: (row) => (
        <Badge variant={row.trustState === "trusted" ? "success" : row.trustState === "revoked" ? "destructive" : "secondary"}>
          {TRUST_LABEL[row.trustState]}
        </Badge>
      ),
    },
    {
      id: "clock",
      accessorFn: (row) => row.clockSkewSeconds,
      header: "Clock",
      cell: (row) => {
        const beyond = Math.abs(row.clockSkewSeconds) > row.maxClockSkewSeconds;
        return (
          <div className="flex flex-col">
            {/* The consequence first. The number is for whoever fixes the tablet. */}
            <span className={beyond ? "font-medium text-destructive" : "text-foreground"}>
              {beyond ? "Punches are being refused" : "Correct"}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {row.clockSkewSeconds}s off · limit {row.maxClockSkewSeconds}s
            </span>
          </div>
        );
      },
    },
    {
      id: "lastSeen",
      accessorFn: (row) => row.lastSeenAt ?? "",
      header: "Last seen",
      cell: (row) => formatLastSeen(row.lastSeenAt),
    },
    {
      id: "capture",
      accessorFn: (row) => `${row.requirePhoto ? "photo" : ""} ${row.requireGeo ? "location" : ""}`.trim(),
      header: "Capture",
      cell: (row) => (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Switch
              checked={row.requirePhoto}
              disabled={busyId === row.id}
              onCheckedChange={(checked) => void setCapture(row, { photo: checked })}
            />
            Photo
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Switch
              checked={row.requireGeo}
              disabled={busyId === row.id}
              onCheckedChange={(checked) => void setCapture(row, { geo: checked })}
            />
            Location
          </label>
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      // Not data. The only column that opts out of sorting and filtering.
      sortable: false,
      filter: false,
      cell: (row) => (
        <div className="flex flex-wrap gap-2">
          {(row.trustState === "pending" || row.trustState === "suspended") && (
            <Button
              type="button"
              size="sm"
              disabled={busyId === row.id}
              onClick={() => void approve(row)}
              className="gap-1"
            >
              <ShieldCheck className="size-4" />
              Approve
            </Button>
          )}
          {row.trustState === "trusted" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busyId === row.id}
              onClick={() => void changeTrust(row, "suspended")}
              className="gap-1"
            >
              <ShieldOff className="size-4" />
              Pause
            </Button>
          )}
          {/* A revoked device is terminal — there is nothing left to do to it from here. */}
          {row.trustState !== "revoked" && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busyId === row.id}
              onClick={() => void changeTrust(row, "revoked")}
              className="gap-1"
            >
              <ShieldX className="size-4" />
              Revoke
            </Button>
          )}
        </div>
      ),
    },
  ];

  return <MatrxDataTable data={rows} columns={columns} getRowId={(row) => row.id} />;
}
