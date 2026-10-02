/**
 * What is true about this computer right now: the device row (always), plus what the Mac itself
 * reports over the protocol when it is connected (sysinfo.get). Unmeasured values read "—".
 */

"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useDesktopRequest } from "@ai-matrx/desktop-protocol/react";
import type { DesktopClient } from "@ai-matrx/desktop-protocol/client";
import type { RelayDeviceStatusEvent } from "@ai-matrx/desktop-protocol";
import { formatDurationSeconds, formatFileSize } from "@ai-matrx/kit/format";

import { cn } from "@/lib/utils";

import { osLine, platformLabel, relaySinceIso, sinceLabel } from "../platform";
import { useNow } from "../useNow";
import type { DeviceRow } from "../types";
import type { ConsoleStatus } from "./connection";

function Row({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-h-11 items-center gap-3 border-b border-border/60 px-4 py-2 last:border-b-0">
      <span className="w-28 shrink-0 text-[15px] text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 flex-1 truncate text-right text-[15px] text-foreground", mono && "font-mono text-[13px]")} suppressHydrationWarning>
        {value}
      </span>
      {copy ? (
        <button
          type="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
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
  const info = useDesktopRequest("sysinfo.get", {}, { enabled: live, client });
  const s = info.data;
  const dash = "—";

  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2 lg:px-3", !visible && "hidden")}>
      <Group title="Computer">
        <Row label="Name" value={s?.device_name ?? device.instance_name ?? dash} />
        <Row label="System" value={s ? `${platformLabel(s.platform)} ${s.os_version} · ${s.arch}` : osLine(device.platform, device.os_version)} />
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
            status.pill === "live" ? "Now" : sinceLabel((relay && !relay.online ? relaySinceIso(relay.since_ms) : null) ?? device.last_seen, now)
          }
        />
        <Row label="App" value={s?.app_version ?? relay?.app_version ?? device.app_version ?? dash} />
        <Row label="Protocol" value={s?.protocol_version ?? relay?.protocol_version ?? dash} />
        <Row label="Device ID" value={device.id} mono copy={device.id} />
      </Group>
    </div>
  );
}
