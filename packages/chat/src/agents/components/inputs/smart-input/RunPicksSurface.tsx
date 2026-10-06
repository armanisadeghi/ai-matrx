"use client";

/**
 * RunPicksSurface — THE two-list surface for a run's per-conversation picks
 * (Tools, Skills). The domain pickers (RunToolPicker, RunSkillPicker) own
 * their data and Redux writes; this owns the one layout both share:
 *
 *   [top slot — e.g. the "Server can add tools" switch]
 *   [notice — one line, e.g. "This model can't use tools"]
 *   ┌ Added for this run · N  Clear ┐ ┌ Search N <noun>             ┐
 *   │ This agent's <noun> · N       │ │ Group                     n │
 *   │   …                           │ │   ☐ Item   description      │
 *   └───────────────────────────────┘ └─────────────────────────────┘
 *
 * A container query, not a viewport check: at ≥ 42rem of its own width it
 * is two columns; narrower (attach popover, Quickset, the phone sheet) one
 * pane at a time behind a segmented control.
 */

import { useState, type ComponentType, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { cn, Skeleton } from "@ai-matrx/design-system";
import { Switch } from "@ai-matrx/chat/ui/switch";
import {
  PickerEmpty,
  PickerRow,
  PickerSearchField,
  PickerSectionLabel,
} from "@ai-matrx/chat/utils/resource-picker/ResourcePickerSubViewHeader";
import { Button, SegmentedControl } from "@ai-matrx/design-system/controls";

type IconType = ComponentType<{ className?: string }>;

export interface PicksCatalogItem {
  id: string;
  label: string;
  /** One line under the label (truncated); full text goes in `title`. */
  secondary?: string;
  title?: string;
  /** The agent already has it — shown ticked, not addable. */
  locked?: boolean;
  /** Short right-side note (e.g. "On agent", "Listed"). */
  note?: string;
}

export interface PicksCatalogGroup {
  label: string;
  items: PicksCatalogItem[];
}

export interface PicksAddedItem {
  id: string;
  label: string;
  secondary?: string;
}

export function RunPicksSurface({
  noun,
  icon,
  topSlot,
  notice,
  agentCount,
  agentSection,
  added,
  onToggle,
  onClear,
  catalogSize,
  groups,
  searchCatalog,
  catalogState,
  addDisabledReason,
}: {
  /** Plural noun, lower case: "tools", "skills". */
  noun: string;
  icon: IconType;
  topSlot?: ReactNode;
  notice?: ReactNode;
  agentCount: ReactNode;
  /** The agent's own list (rows via `PicksLine`, or a state). */
  agentSection: ReactNode;
  added: PicksAddedItem[];
  onToggle: (id: string) => void;
  onClear: () => void;
  catalogSize: number;
  groups: PicksCatalogGroup[];
  /** Ranked matches for a non-empty query. */
  searchCatalog: (query: string) => PicksCatalogItem[];
  /** Replaces the catalog list while it is not ready (loading / failed). */
  catalogState?: ReactNode;
  /** Set when nothing can be added right now; shown as the catalog body. */
  addDisabledReason?: string;
}) {
  const [search, setSearch] = useState("");
  const [pane, setPane] = useState<"agent" | "add">("agent");
  const addedIds = new Set(added.map((a) => a.id));
  const query = search.trim();
  const matches = query ? searchCatalog(query) : [];

  const catalogRow = (item: PicksCatalogItem) => {
    const selected = addedIds.has(item.id);
    return (
      <PickerRow
        key={item.id}
        leading={<CheckBox on={item.locked || selected} muted={item.locked} />}
        label={item.label}
        secondary={item.secondary || undefined}
        title={item.title || undefined}
        selected={selected}
        pressed={item.locked || selected}
        disabled={item.locked}
        trailing={
          selected ? (
            <span className="shrink-0 text-xs text-primary">Added</span>
          ) : item.note ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {item.note}
            </span>
          ) : null
        }
        onClick={() => onToggle(item.id)}
      />
    );
  };

  const agentPane = (
    <div
      className={cn(
        "min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-1.5",
        pane === "agent" ? "flex" : "hidden",
        "@2xl:flex @2xl:border-r @2xl:border-border",
      )}
    >
      {added.length > 0 ? (
        <>
          <PickerSectionLabel
            action={
              <Button variant="quiet" onClick={onClear}>Clear</Button>
            }
          >
            Added for this run · {added.length}
          </PickerSectionLabel>
          <div className="flex flex-col">
            {added.map((item) => (
              <PickerRow
                key={item.id}
                icon={icon}
                iconClassName="text-primary"
                label={item.label}
                secondary={item.secondary}
                title="Remove from this run"
                trailing={
                  <X className="h-4 w-4 shrink-0 text-muted-foreground" />
                }
                onClick={() => onToggle(item.id)}
              />
            ))}
          </div>
        </>
      ) : null}
      <PickerSectionLabel
        action={
          <span className="text-xs tabular-nums text-muted-foreground">
            {agentCount}
          </span>
        }
      >
        This agent&apos;s {noun}
      </PickerSectionLabel>
      {agentSection}
    </div>
  );

  const addPane = (
    <div
      className={cn(
        "min-h-0 flex-1 flex-col",
        pane === "add" ? "flex" : "hidden",
        "@2xl:flex",
      )}
    >
      <div className="shrink-0 p-1.5 pb-0">
        <PickerSearchField
          value={search}
          onChange={setSearch}
          placeholder={
            catalogSize > 0 ? `Search ${catalogSize} ${noun}` : `Search ${noun}`
          }
          disabled={!!addDisabledReason}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {addDisabledReason ? (
          <PickerEmpty>{addDisabledReason}</PickerEmpty>
        ) : catalogState ? (
          catalogState
        ) : query ? (
          matches.length === 0 ? (
            <PickerEmpty>
              No {noun} match &ldquo;{query}&rdquo;
            </PickerEmpty>
          ) : (
            matches.map(catalogRow)
          )
        ) : groups.length === 0 ? (
          <PickerEmpty>No {noun} available</PickerEmpty>
        ) : (
          groups.map((group) => (
            <section key={group.label}>
              <PickerSectionLabel
                action={
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {group.items.length}
                  </span>
                }
              >
                {group.label}
              </PickerSectionLabel>
              {group.items.map(catalogRow)}
            </section>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="@container flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className={cn(
          "flex shrink-0 flex-col gap-1.5 border-b border-border p-1.5",
          !topSlot && !notice && "@2xl:hidden",
        )}
      >
        {topSlot}
        {notice}
        <SegmentedControl aria-label="Pane"
          className="@2xl:hidden"
          fill
          value={pane}
          onValueChange={(next) => setPane(next === "add" ? "add" : "agent")}
          data={[
            {
              value: "agent",
              ariaLabel: `Agent's ${noun}`,
              label: (
                <span className="flex items-center gap-1.5">
                  Agent&apos;s {noun}
                  <span className="tabular-nums text-muted-foreground">
                    {agentCount}
                    {added.length > 0 ? ` +${added.length}` : ""}
                  </span>
                </span>
              ),
            },
            { value: "add", label: `Add ${noun}` },
          ]}
        />
      </div>
      <div className="flex min-h-0 flex-1 @2xl:grid @2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @2xl:grid-rows-[minmax(0,1fr)]">
        {agentPane}
        {addPane}
      </div>
    </div>
  );
}

/** The one-line switch row a domain puts in `topSlot`. */
export function PicksSwitchRow({
  label,
  detail,
  title,
  checked,
  disabled,
  disabledTitle,
  onCheckedChange,
}: {
  label: string;
  /** Short muted note before the switch (e.g. "Agent default"). */
  detail?: string;
  title?: string;
  checked: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-foreground hover:bg-accent pointer-coarse:h-11",
        disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
      )}
      title={disabled ? disabledTitle : title}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? (
        <span className="shrink-0 text-xs text-muted-foreground">{detail}</span>
      ) : null}
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        className="shrink-0"
      />
    </label>
  );
}

/** One-line notice under the top slot (icon + text, truncated). */
export function PicksNotice({
  icon: Icon,
  children,
}: {
  icon: IconType;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 text-xs text-amber-700 dark:text-amber-300">
      <Icon className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span className="truncate">{children}</span>
    </div>
  );
}

/** A read-only line for one of the agent's own items. */
export function PicksLine({
  icon: Icon,
  label,
  detail,
  title,
}: {
  icon: IconType;
  label: ReactNode;
  detail?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex h-9 min-w-0 items-center gap-2.5 rounded-lg px-1.5 pointer-coarse:h-11"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {label}
      </span>
      {detail ? (
        <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
          {detail}
        </span>
      ) : null}
    </div>
  );
}

/** Small muted line for an empty agent list. */
export function PicksNote({ children }: { children: ReactNode }) {
  return <p className="px-2 py-2 text-xs text-muted-foreground">{children}</p>;
}

export function PicksSkeletons() {
  return (
    <div className="flex flex-col gap-1.5 p-1.5">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-7 w-full rounded-md" />
      ))}
    </div>
  );
}

function CheckBox({ on, muted }: { on?: boolean; muted?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
        on
          ? muted
            ? "border-muted-foreground/40 bg-muted text-muted-foreground"
            : "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/40",
      )}
    >
      {on ? <Check className="h-3 w-3" /> : null}
    </span>
  );
}
