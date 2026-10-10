/**
 * /devices — your computers, Termius bones: a large title that hands off to the header as you
 * scroll, one inset grouped list (16px gutter, 10px radius) of 64px rows: 40px platform glyph,
 * name, OS · last seen, and an 8px dot the relay itself fills in (online now, or not).
 */

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Laptop } from "lucide-react";
import type { RelayDeviceStatusEvent } from "@ai-matrx/desktop-protocol";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { getAccessTokenOrNull } from "@/lib/python-client";
import { cn } from "@/lib/utils";

import { PlatformIcon, lastSeenIso, osLine, sinceLabel } from "../platform";
import { useNow } from "../useNow";
import type { DeviceRow } from "../types";
import { fetchRelayStatus } from "./relay";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
/** Re-ask the relay this often while the list is open. */
const STATUS_POLL_MS = 30_000;
/** Computers not seen for this long sit behind "Show older" (still one tap away, never hidden). */
const OLDER_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

function useRelayStatuses(ids: string[]): Record<string, RelayDeviceStatusEvent | null | undefined> {
  const [statuses, setStatuses] = useState<Record<string, RelayDeviceStatusEvent | null | undefined>>({});
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return undefined;
    const abort = new AbortController();
    const load = async () => {
      const token = await getAccessTokenOrNull().catch(() => null);
      if (!token || abort.signal.aborted) return;
      const results = await Promise.all(key.split(",").map(async (id) => [id, await fetchRelayStatus(id, token, abort.signal)] as const));
      if (!abort.signal.aborted) setStatuses(Object.fromEntries(results));
    };
    void load();
    const timer = setInterval(() => void load(), STATUS_POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      abort.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key]);
  return statuses;
}

function DeviceListRow({ device, status, now }: { device: DeviceRow; status: RelayDeviceStatusEvent | null | undefined; now: number }) {
  const name = device.instance_name?.trim() || "Unnamed device";
  const online = status?.online === true;
  const lastIso = lastSeenIso(device, status);
  const seen = online ? "Online" : lastIso ? `Last seen ${sinceLabel(lastIso, now)}` : "Never connected";
  return (
    <Link
      href={`/devices/${device.id}`}
      className="flex h-16 items-center gap-3 border-b border-border/60 px-4 last:border-b-0 hover:bg-muted/40 active:bg-muted/60"
    >
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-muted">
        <PlatformIcon platform={device.platform} className="h-[22px] w-[22px] text-foreground/80" />
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-card",
            status === undefined ? "bg-muted-foreground/30" : online ? "bg-emerald-500" : "bg-muted-foreground/60",
          )}
          aria-label={status === undefined ? "Checking" : online ? "Online" : "Offline"}
          role="img"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-semibold leading-[22px] text-foreground">{name}</span>
        <span className="block truncate text-[13px] leading-[18px] text-muted-foreground" suppressHydrationWarning>
          {osLine(device.platform, device.os_version)} · {seen}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
    </Link>
  );
}

export function DeviceList({ devices, error }: { devices: DeviceRow[]; error: string | null }) {
  const now = useNow();
  const statuses = useRelayStatuses(devices.map((d) => d.id));
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [titleHidden, setTitleHidden] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const isOlder = (d: DeviceRow) => {
    if (statuses[d.id]?.online) return false;
    const iso = lastSeenIso(d, statuses[d.id]);
    return !iso || now - Date.parse(iso) > OLDER_AFTER_MS;
  };
  const recent = devices.filter((d) => !isOlder(d));
  const older = devices.filter(isOlder);

  // iOS large title: once it scrolls under the header, the header carries the title.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([entry]) => setTitleHidden(entry ? !entry.isIntersecting : false), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="h-full overflow-hidden bg-textured">
      <PageHeader
        desktop={<span className="text-sm font-medium text-foreground">Devices</span>}
        mobile={<span className={cn("text-[15px] font-semibold text-foreground transition-opacity", titleHidden ? "opacity-100" : "opacity-0")}>Devices</span>}
      />
      <div className="h-full overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[var(--shell-header-h)]">
        <div className="mx-auto max-w-2xl px-4">
          <h1 ref={titleRef} className="pb-2 pt-1 text-[34px] font-bold leading-[41px] tracking-tight text-foreground lg:hidden">
            Devices
          </h1>
          {error ? (
            <div className="rounded-[10px] border border-border bg-card px-4 py-3 text-sm text-destructive">{error}<ErrorAlchemyMenu error={error} /></div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-10 text-center lg:mt-4">
              <Laptop className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
              <p className="text-[17px] font-semibold text-foreground">No computers yet</p>
              <p className="text-sm text-muted-foreground">Sign in to Matrx 2 on your computer</p>
            </div>
          ) : (
            <>
              {recent.length > 0 ? (
                <div className="overflow-hidden rounded-[10px] border border-border bg-card lg:mt-4">
                  {recent.map((d) => (
                    <DeviceListRow key={d.id} device={d} status={statuses[d.id]} now={now} />
                  ))}
                </div>
              ) : null}
              {older.length > 0 ? (
                <div className="mt-6">
                  <button
                    type="button"
                    aria-expanded={showOlder}
                    className="flex h-11 items-center gap-1 px-1 text-[15px] text-primary"
                    onClick={() => setShowOlder((v) => !v)}
                  >
                    <ChevronRight className={cn("h-4 w-4 transition-transform", showOlder && "rotate-90")} aria-hidden="true" />
                    {showOlder ? "Hide older" : `Show older (${older.length})`}
                  </button>
                  {showOlder ? (
                    <div className="overflow-hidden rounded-[10px] border border-border bg-card">
                      {older.map((d) => (
                        <DeviceListRow key={d.id} device={d} status={statuses[d.id]} now={now} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
