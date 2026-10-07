"use client";

/**
 * Data: a dense list (badges, quiet row actions, delete in three tiers), a
 * small table and cards. One surface level, hairline rows ≈36px, bordered
 * 8px cards, never a card inside a card.
 */

import { useState } from "react";
import { MoreHorizontalTapButton, PencilTapButton, TrashTapButton } from "@ai-matrx/tap-target/buttons";
import { CalendarClock, FileText, Trash2, Users, Workflow, type LucideIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { Group, ROWS, STATUS, Section, type Row } from "./kit";
import { Badge, Button } from "@ai-matrx/design-system/controls";
import { formatCount } from "@ai-matrx/kit/format";

/* Quiet row actions: muted until the row is hovered or focused; always
   visible where there is no hover (touch). They go LEFT of the status chips,
   so the hidden state never reserves a slot before the "…" menu. */
const QUIET =
  "flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100";

function DenseList() {
  const [rows, setRows] = useState<readonly Row[]>(ROWS.slice(0, 4));
  const [confirming, setConfirming] = useState<Row | null>(null);

  const remove = (row: Row) => {
    const index = rows.findIndex((r) => r.id === row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    return index;
  };

  // Tier 1: quiet. The row goes to the trash and the toast offers undo.
  const trash = (row: Row) => {
    const index = remove(row);
    toast.success("Moved to trash", {
      action: {
        label: "Undo",
        onClick: () =>
          setRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev.slice(0, index), row, ...prev.slice(index)])),
      },
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex min-h-9 items-center gap-2 border-b border-border pl-3 pr-[3px]">
        <span className="text-[0.8125rem] font-semibold">Forms</span>
        <span className="text-[0.6875rem] text-muted-foreground">{rows.length}</span>
        <span className="flex-1" />
        <Button variant="quiet" onClick={() => setRows(ROWS.slice(0, 4))}>
          Reset
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">All rows deleted</div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="group flex min-h-9 items-center gap-2 pl-3 pr-[3px] hover:bg-accent/40">
              <div className="min-w-0 flex-1 py-1.5">
                <div className="truncate text-[0.8125rem] font-medium leading-4">{r.name}</div>
                <div className="truncate text-[0.6875rem] leading-4 text-muted-foreground">
                  Updated {r.updated} · {r.owner}
                </div>
              </div>
              {/* Hover-revealed actions sit LEFT of the chips: hidden, they leave no gap
                  between the chip and the always-visible More (owner, 2026-10-03). */}
              <div className={QUIET}>
                <PencilTapButton variant="transparent" ariaLabel="Rename" />
                <TrashTapButton
                  variant="transparent"
                  ariaLabel="Move to trash"
                  iconColor="text-destructive"
                  onClick={() => trash(r)}
                />
              </div>
              <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <MoreHorizontalTapButton variant="transparent" ariaLabel="More" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuItem>Rename</DropdownMenuItem>
                  <DropdownMenuItem>Duplicate</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirming(r)}>
                    <Trash2 aria-hidden /> Delete permanently
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      {/* Tier 2: confirm, naming the cost. */}
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming ? `Delete “${confirming.name}”?` : "Delete?"}
        description={confirming ? `Removes ${formatCount(confirming.runs)} responses for everyone. This can't be undone.` : undefined}
        confirmLabel="Delete form"
        variant="destructive"
        contentClassName="sm:max-w-md"
        onConfirm={() => {
          if (confirming) remove(confirming);
          setConfirming(null);
        }}
      />
    </div>
  );
}

function DangerZone() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/40 py-2 pl-3 pr-[3px]">
      <div className="min-w-0 flex-1">
        <div className="text-[0.8125rem] font-semibold">Delete this organization</div>
        <div className="text-xs text-muted-foreground">Every project, agent and file, for everyone</div>
      </div>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden /> Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete Riverside Dental?"
        description="Deletes 14 projects, 32 agents and 1,208 files for 9 people. This can't be undone."
        confirmLabel="Delete organization"
        variant="destructive"
        contentClassName="sm:max-w-md"
        onConfirm={() => setOpen(false)}
      />
    </div>
  );
}

function SmallTable() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full table-fixed border-collapse text-[0.8125rem]">
        <thead>
          <tr className="border-b border-border text-left text-[0.6875rem] font-medium text-muted-foreground">
            <th className="h-8 px-3 font-medium">Name</th>
            <th className="hidden h-8 w-32 px-3 font-medium sm:table-cell">Owner</th>
            <th className="h-8 w-16 px-3 text-right font-medium">Runs</th>
            <th className="h-8 w-24 px-3 font-medium">Status</th>
            <th className="hidden h-8 w-24 px-3 font-medium md:table-cell">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {ROWS.map((r) => (
            <tr key={r.id} className="hover:bg-accent/40">
              <td className="h-9 truncate px-3 font-medium">{r.name}</td>
              <td className="hidden h-9 truncate px-3 text-muted-foreground sm:table-cell">{r.owner}</td>
              <td className="h-9 px-3 text-right tabular-nums">{formatCount(r.runs)}</td>
              <td className="h-9 px-3">
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              </td>
              <td className="hidden h-9 px-3 text-xs text-muted-foreground md:table-cell">{r.updated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CARDS: ReadonlyArray<{ icon: LucideIcon; title: string; rows: ReadonlyArray<readonly [string, string]> }> = [
  { icon: Users, title: "Client onboarding", rows: [["Owner", "Ana Ruiz"], ["Members", "6 people"], ["Last run", "Today, 9:41"]] },
  { icon: Workflow, title: "Intake triage", rows: [["Owner", "Ben Ortiz"], ["Steps", "4"], ["Last run", "Yesterday"]] },
  { icon: FileText, title: "Referral letters", rows: [["Owner", "Chris Lee"], ["Templates", "12"], ["Last edit", "2w ago"]] },
  { icon: CalendarClock, title: "Weekly check-in", rows: [["Owner", "Ana Ruiz"], ["Repeats", "Mondays"], ["Next", "Oct 6, 9:00"]] },
];

function Cards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {CARDS.map((c) => (
        <article key={c.title} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex min-h-9 items-center gap-2 border-b border-border pl-3 pr-[3px]">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-ink">
              <c.icon className="size-3.5" aria-hidden />
            </div>
            <h3 className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold">{c.title}</h3>
            <MoreHorizontalTapButton variant="transparent" ariaLabel="More" />
          </div>
          <dl className="divide-y divide-border">
            {c.rows.map(([k, v]) => (
              <div key={k} className="flex min-h-8 items-center justify-between gap-3 px-3 text-[0.8125rem]">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="truncate font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  );
}

export function Data() {
  return (
    <Section id="data" title="Data">
      <div className="grid gap-6">
        <Group label="List · trash is tier 1, More › Delete is tier 2">
          <DenseList />
        </Group>
        <Group label="Table">
          <SmallTable />
        </Group>
      </div>
      <Group label="Cards">
        <Cards />
      </Group>
      <Group label="Danger zone · tier 3, settings only">
        <DangerZone />
      </Group>
    </Section>
  );
}
