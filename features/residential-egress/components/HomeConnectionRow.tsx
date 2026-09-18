/**
 * features/residential-egress/components/HomeConnectionRow.tsx
 *
 * One computer's home connection, as a row under the device card it belongs
 * to (and as a card of its own for a helper-only computer, which has no
 * device card).
 *
 * THE BADGE IS DERIVED, NEVER STORED: `enabled` is what the person asked for
 * and `connected` is what the gateway sees, so Paused beats Offline — a
 * computer the person switched off is not "offline", it is off because they
 * said so. The row never invents a third state.
 *
 * Copy is the contract's (§ Names): "Home connection". Never "proxy",
 * "egress", "residential" or "IP" in anything a person reads.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { HouseWifi, Loader2, Trash2 } from "lucide-react";
import { Badge, Button, EditableLabel, Switch } from "@ai-matrx/design-system";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { formatFileSize } from "@ai-matrx/kit/format";

import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import {
  removeHomeConnection,
  renameHomeConnection,
  setHomeConnectionEnabled,
} from "../service";
import {
  HOME_CONNECTION_STATUS_LABEL,
  homeConnectionStatus,
  type EgressDeviceRow,
  type HomeConnectionStatus,
} from "../types";

const STATUS_CLASS: Record<HomeConnectionStatus, string> = {
  connected: "border-primary/40 text-primary",
  offline: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  paused: "border-border text-muted-foreground",
  not_set_up: "border-border text-muted-foreground",
};

function usedLabel(iso: string | null): string {
  if (!iso) return "never used";
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "used moments ago";
  if (minutes < 60) return `used ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `used ${hours} hours ago`;
  return `used ${Math.round(hours / 24)} days ago`;
}

export function HomeConnectionRow({
  device,
  deviceName,
  /** The hook's read error, when there is one. A row NEVER shows a status it could not read. */
  readError,
  showName = false,
  onChanged,
  className,
}: {
  device: EgressDeviceRow | null;
  /** The computer's name, for copy that has to name it. */
  deviceName: string;
  readError?: string | null;
  /**
   * Render the computer's own (editable) name. True where this row IS the
   * card — a helper-only computer with no device card above it to name it.
   */
  showName?: boolean;
  onChanged: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const status = homeConnectionStatus(device);

  // A status we could not read is said out loud, never dressed up as
  // "Not set up" — those are different facts and only one of them is true.
  if (readError) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400",
          className,
        )}
      >
        <HouseWifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Home connection status could not be read: {readError}. Nothing has
          changed on this computer.
        </span>
      </div>
    );
  }

  async function toggle(next: boolean) {
    if (!device) return;
    setBusy(true);
    try {
      await setHomeConnectionEnabled(device.id, next);
      onChanged();
    } catch (err) {
      toast.error(
        `${deviceName} could not be ${next ? "turned on" : "paused"}: ${extractErrorMessage(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!device) return;
    const ok = await confirm({
      title: `Remove ${device.display_name} as a home connection?`,
      description:
        `AI Matrx will stop using this computer's internet connection, and the ` +
        `helper running on it will sign out and ask to be connected again ` +
        `before it can be used. Anything AI Matrx is doing through it right now ` +
        `stops immediately. Your files, folders and sync on this computer are ` +
        `not affected.`,
      confirmLabel: "Remove this computer",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeHomeConnection(device.id);
      toast.success(`${device.display_name} is no longer a home connection.`);
      onChanged();
    } catch (err) {
      toast.error(
        `${device.display_name} could not be removed: ${extractErrorMessage(err)}. It is still connected.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border px-3 py-2",
        className,
      )}
    >
      <HouseWifi
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      {showName && device ? (
        <EditableLabel
          value={device.display_name}
          ariaLabel="Computer name"
          maxLength={120}
          className="min-w-0 max-w-[16rem]"
          displayClassName="text-xs font-medium text-foreground"
          onCommit={async (next) => {
            try {
              await renameHomeConnection(device.id, next.trim());
              onChanged();
            } catch (err) {
              toast.error(
                `That computer could not be renamed: ${extractErrorMessage(err)}`,
              );
            }
          }}
        />
      ) : (
        <span className="text-xs font-medium text-foreground">
          Home connection
        </span>
      )}
      <Badge
        variant="outline"
        className={cn("h-4 px-1.5 text-[10px]", STATUS_CLASS[status])}
      >
        {HOME_CONNECTION_STATUS_LABEL[status]}
      </Badge>

      {device ? (
        <>
          <span className="text-[11px] text-muted-foreground">
            {usedLabel(device.last_used_at)} ·{" "}
            {device.streams_relayed.toLocaleString()} page
            {device.streams_relayed === 1 ? "" : "s"} ·{" "}
            {formatFileSize(device.bytes_relayed)}
          </span>
          <span className="flex-1" />
          {busy ? (
            <Loader2
              className="h-3.5 w-3.5 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : null}
          <Switch
            checked={device.enabled}
            disabled={busy}
            onCheckedChange={(next) => void toggle(next)}
            aria-label={`Use ${device.display_name}'s internet connection when AI Matrx gets blocked`}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => void remove()}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="ml-1">Remove</span>
          </Button>
        </>
      ) : (
        <>
          <span className="text-[11px] text-muted-foreground">
            This computer is not lending its internet connection. Set it up to
            let AI Matrx browse through it when a site blocks our servers.
          </span>
          <span className="flex-1" />
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" asChild>
            <Link href="/connect-computer">Set up</Link>
          </Button>
        </>
      )}

      {device?.last_error ? (
        <p className="w-full text-[11px] text-amber-600 dark:text-amber-400">
          {device.last_error}
        </p>
      ) : null}

      {device && !device.enabled ? (
        <p className="w-full text-[11px] text-muted-foreground">
          Paused. Turn this back on and {device.display_name} starts carrying
          blocked pages again within 30 seconds.
        </p>
      ) : null}
    </div>
  );
}
