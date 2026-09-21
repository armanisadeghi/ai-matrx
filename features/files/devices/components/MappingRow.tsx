/**
 * features/files/devices/components/MappingRow.tsx
 *
 * One synced folder, one dense row. Dropbox's device page gives the bones
 * (folder → destination → status → controls); Linear gives the density.
 *
 * Every state here is the engine's own sentence. Where the remedy is a
 * physical act on that machine, the row SAYS which machine and offers no
 * button — a control that cannot work is worse than no control (law 4).
 */

"use client";

import { useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpFromLine,
  ArrowDownToLine,
  Brain,
  Folder,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ai-matrx/design-system";

import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { formatFileSize } from "@/features/files/utils/format";

import { describeMappingReport } from "../honest-states";
import { setDesiredState, setDirection, setKnob } from "../service";
import {
  DIRECTION_LABELS,
  KNOWLEDGE_KNOB,
  type SyncDirection,
  type SyncMappingRow,
} from "../types";

const DIRECTION_ICON: Record<SyncDirection, typeof ArrowLeftRight> = {
  two_way: ArrowLeftRight,
  upload_only: ArrowUpFromLine,
  download_only: ArrowDownToLine,
};

const TONE_CLASS = {
  neutral: "border-border text-muted-foreground",
  active: "border-primary/40 text-primary",
  warning: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  danger: "border-destructive/50 text-destructive",
} as const;

function relative(iso: string | null, now: number): string {
  if (!iso) return "never";
  const delta = now - new Date(iso).getTime();
  if (delta < 60_000) return "just now";
  const minutes = Math.round(delta / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function MappingRow({
  mapping,
  deviceName,
  now,
  onChanged,
}: {
  mapping: SyncMappingRow;
  deviceName: string;
  /** The shared clock — `Date.now()` in a render body is an impure read. */
  now: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const report = describeMappingReport({
    state: mapping.state,
    stateReason: mapping.state_reason,
    lastSeenAt: mapping.last_seen_at,
    now,
  });
  const state = report.state;
  const DirectionIcon = DIRECTION_ICON[mapping.direction];
  const indexing = Boolean(mapping.knobs?.[KNOWLEDGE_KNOB]);

  // The user asked for one thing; the device still reports another. Say so
  // rather than pretending the control failed (C4's whole point).
  const converging =
    (mapping.desired_state === "paused" && mapping.state !== "paused") ||
    (mapping.desired_state === "active" &&
      (mapping.state === "paused" || mapping.state === "pending")) ||
    (mapping.desired_state === "removed" && mapping.state !== "removed");

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      toast.error(
        `${failure} ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  const paused = mapping.desired_state === "paused";

  return (
    <div className="flex items-start gap-3 border-t border-border px-3 py-2 text-xs first:border-t-0">
      <Folder
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="truncate font-medium text-foreground"
            title={mapping.local_path}
          >
            {mapping.local_path_display ?? mapping.local_path}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 text-muted-foreground">
                <DirectionIcon className="h-3 w-3" aria-hidden="true" />
                {DIRECTION_LABELS[mapping.direction].label}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {DIRECTION_LABELS[mapping.direction].detail}
            </TooltipContent>
          </Tooltip>
          <span className="text-muted-foreground">
            {mapping.folder_id
              ? "a folder in the cloud"
              : "your whole cloud folder"}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge
            variant="outline"
            className={cn("h-4 px-1.5 text-[10px]", TONE_CLASS[report.tone])}
          >
            {report.badge}
          </Badge>
          {converging ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              {mapping.desired_state === "paused"
                ? "Pausing…"
                : mapping.desired_state === "removed"
                  ? "Removing…"
                  : "Resuming…"}
            </span>
          ) : null}
          <span className="text-muted-foreground">
            {mapping.items_total !== null
              ? `${mapping.items_total.toLocaleString()} items`
              : "item count not reported"}
            {mapping.bytes_total !== null
              ? ` · ${formatFileSize(mapping.bytes_total)}`
              : ""}
            {" · synced "}
            {relative(mapping.last_synced_at, now)}
          </span>
        </div>

        {/* ONE sentence. Fresh: the daemon's own remedy sentence wins over
            ours. Stale: neither is spoken in the present tense (L5-2). */}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {report.sentence}
        </p>

        {state.remedy.kind === "on_device" ? (
          <p className="mt-0.5 text-[11px] font-medium text-foreground">
            {state.remedy.label} — open AI Matrx on {deviceName}.
          </p>
        ) : null}
        {state.remedy.kind === "link" ? (
          <Link
            href={state.remedy.href}
            className="mt-0.5 inline-block text-[11px] font-medium text-destructive underline underline-offset-2"
          >
            {state.remedy.label}
          </Link>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1">
              <Brain
                className={cn(
                  "h-3.5 w-3.5",
                  indexing ? "text-primary" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <Switch
                checked={indexing}
                disabled={busy}
                aria-label="Use these files for knowledge"
                onCheckedChange={(next) =>
                  void run(
                    () => setKnob(mapping, KNOWLEDGE_KNOB, next),
                    "Could not change knowledge indexing.",
                  )
                }
              />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {indexing
              ? "Saved for this folder: its files should feed knowledge, so agents can search and cite them. Indexing starts when the file service begins honouring this setting — nothing from this folder is searchable yet."
              : "Files here sync and are not marked to feed knowledge."}
          </TooltipContent>
        </Tooltip>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          disabled={busy || mapping.desired_state === "removed"}
          onClick={() =>
            void run(
              () => setDesiredState(mapping, paused ? "active" : "paused"),
              paused ? "Could not resume." : "Could not pause.",
            )
          }
        >
          {paused ? (
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span className="ml-1">{paused ? "Resume" : "Pause"}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              disabled={busy}
              aria-label="More options for this folder"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-xs">Direction</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={mapping.direction}
              onValueChange={(next) =>
                void run(
                  () => setDirection(mapping, next as SyncDirection),
                  "Could not change the direction.",
                )
              }
            >
              {(
                Object.keys(DIRECTION_LABELS) as SyncDirection[]
              ).map((value) => (
                <DropdownMenuRadioItem
                  key={value}
                  value={value}
                  className="text-xs"
                >
                  <span className="flex flex-col">
                    <span>{DIRECTION_LABELS[value].label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {DIRECTION_LABELS[value].detail}
                    </span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs text-destructive focus:text-destructive"
              disabled={mapping.desired_state === "removed"}
              onSelect={(event) => {
                event.preventDefault();
                void (async () => {
                  const ok = await confirm({
                    title: "Stop syncing this folder?",
                    // The consequence, stated before the click (law: a
                    // destructive click names what is lost).
                    description: `${deviceName} will stop syncing ${mapping.local_path_display ?? mapping.local_path}. The files already on that device stay where they are, and the copies in the cloud stay too — but changes stop flowing in both directions, and this folder stops being marked to feed knowledge.`,
                    confirmLabel: "Stop syncing",
                    variant: "destructive",
                  });
                  if (!ok) return;
                  await run(
                    () => setDesiredState(mapping, "removed"),
                    "Could not remove the folder from sync.",
                  );
                })();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Stop syncing this folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
