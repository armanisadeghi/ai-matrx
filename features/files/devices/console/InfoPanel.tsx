/**
 * What is true about this computer right now: the device row (always), plus what the Mac itself
 * reports over the protocol when it is connected (sysinfo.get). Unmeasured values read "—".
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Trash2 } from "lucide-react";
import { useDesktopRequest } from "@ai-matrx/desktop-protocol/react";
import type { DesktopClient } from "@ai-matrx/desktop-protocol/client";
import type { RelayDeviceStatusEvent } from "@ai-matrx/desktop-protocol";
import { formatDurationSeconds, formatFileSize } from "@ai-matrx/kit/format";

import { cn } from "@/lib/utils";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

import { lastSeenIso, osLine, sinceLabel } from "../platform";
import { useNow } from "../useNow";
import type { DeviceRow } from "../types";
import type { ConsoleStatus } from "./connection";
import { removeDevice } from "./remove-device";

function Row({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    // data-row-id: a row is never a resting place for the floating assists control.
    <div data-row-id={label} className="flex min-h-11 items-start gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0">
      <span className="w-24 shrink-0 text-[15px] leading-5 text-muted-foreground">{label}</span>
      <span
        className={cn("min-w-0 flex-1 text-right text-[15px] leading-5 text-foreground [overflow-wrap:anywhere]", mono && "font-mono text-[13px]")}
        suppressHydrationWarning
      >
        {value}
      </span>
      {copy ? (
        <button
          type="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          className="-my-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => {
            void navigator.clipboard?.writeText(copy).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="px-4 pb-1.5 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="overflow-hidden rounded-[10px] border border-border bg-card">{children}</div>
    </section>
  );
}

export function InfoPanel({
  client,
  live,
  device,
  relay,
  status,
  visible,
}: {
  client: DesktopClient;
  live: boolean;
  device: DeviceRow;
  relay: RelayDeviceStatusEvent | null;
  status: ConsoleStatus;
  visible: boolean;
}) {
  const now = useNow();
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const info = useDesktopRequest("sysinfo.get", {}, { enabled: live, client });
  const s = info.data;
  const dash = "—";

  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2 lg:px-3", !visible && "hidden")}>
      <Group title="Computer">
        <Row label="Name" value={s?.device_name ?? device.instance_name ?? dash} />
        <Row label="System" value={s ? `${osLine(s.platform, s.os_version)} · ${s.arch}` : osLine(device.platform, device.os_version)} />
        <Row label="Host" value={s?.hostname ?? dash} mono />
        <Row label="User" value={s?.user.username ?? dash} mono />
        <Row label="Home" value={s?.paths.home ?? dash} mono />
        <Row label="CPU" value={s ? `${s.cpu.model} · ${s.cpu.cores} cores` : dash} />
        <Row label="Memory" value={s ? `${formatFileSize(s.memory.total_bytes - s.memory.free_bytes)} of ${formatFileSize(s.memory.total_bytes)} used` : dash} />
        <Row label="Up for" value={s ? formatDurationSeconds(s.uptime_seconds, { style: "coarse" }) : dash} />
        <Row label="Power" value={s ? (s.on_battery === null ? "Desktop" : s.on_battery ? "Battery" : "Plugged in") : dash} />
        <Row label="Sleep" value={s ? (s.sleep_prevented ? "Kept awake while you are connected" : "Normal") : dash} />
      </Group>
      <Group title="Connection">
        <Row label="Status" value={status.label} />
        <Row
          label="Last seen"
          value={
            status.pill === "live" ? "Now" : sinceLabel(lastSeenIso(device, relay), now)
          }
        />
        <Row label="App" value={s?.app_version ?? relay?.app_version ?? device.app_version ?? dash} />
        <Row label="Protocol" value={s?.protocol_version ?? relay?.protocol_version ?? dash} />
        <Row label="Device ID" value={device.id} mono copy={device.id} />
      </Group>
      <button
        type="button"
        disabled={removing}
        className="mb-6 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-border bg-card text-[15px] font-medium text-destructive-ink hover:bg-destructive/5 disabled:opacity-50"
        onClick={async () => {
          const ok = await confirm({
            title: "Remove this computer?",
            description: "It disconnects now and can no longer be reached from here.",
            confirmLabel: "Remove",
            variant: "destructive",
          });
          if (!ok) return;
          setRemoving(true);
          try {
            await removeDevice(device);
            toast.success(`${device.instance_name?.trim() || "Computer"} removed`);
            router.push("/devices");
          } catch (error) {
            toast.error("Could not remove it", { description: error instanceof Error ? error.message : String(error) });
            setRemoving(false);
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
        Remove this computer
      </button>
    </div>
  );
}
