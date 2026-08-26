"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCheck, History, Hourglass, TimerReset } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { toast } from "@/lib/toast";

import { HrRefusalNotice } from "@/features/hr/tasks/components/HrRefusalNotice";
import { HrTaskTable } from "@/features/hr/tasks/components/HrTaskTable";
import { useHrInbox } from "@/features/hr/tasks/hooks/useHrInbox";
import { bulkDecide } from "@/features/hr/tasks/service";
import { groupByUrgency, relativeDue, URGENCY_LABEL } from "@/features/hr/tasks/urgency";
import type {
    HrBulkOutcome,
    HrInboxRow,
    HrInboxScope,
    HrRefusal,
} from "@/features/hr/tasks/types";
import { isRefusal } from "@/features/hr/tasks/types";

const SCOPES: { key: HrInboxScope; label: string; hint: string }[] = [
    { key: "mine", label: "Mine", hint: "Waiting on you" },
    { key: "team", label: "My team", hint: "Waiting on someone who reports to you" },
    { key: "queue", label: "HR queue", hint: "Everything open in this organization" },
];

function Section({
    icon: Icon,
    title,
    subtitle,
    children,
}: {
    icon: typeof Hourglass;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="space-y-3">
            <div className="flex items-baseline gap-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                {subtitle ? (
                    <span className="text-xs text-muted-foreground">{subtitle}</span>
                ) : null}
            </div>
            {children}
        </section>
    );
}

/**
 * THE ONE HR TASK INBOX (`/hr/tasks`).
 *
 * SPEC-UI-IA §5.9 and SPEC-WORKFLOW-ENGINE §5.2: one surface for every
 * actionable HR item, for every persona. No pillar builds its own queue and a
 * second inbox at any other path is a defect, not a variant. The five sections
 * of §5.2 all live on this one page — they are sections, not separate inboxes.
 *
 * Employee-side symmetry is not a special case here and needs no code: an
 * attestation, an acknowledgment and a signature request reach `/hr/tasks`
 * through exactly the same `hr.workflow_step` rows as "approve my report's
 * leave", because from the person's point of view both are an item waiting on
 * them. One inbox means one.
 */
export function HrTaskInbox({ initialScope }: { initialScope: HrInboxScope }) {
    const router = useRouter();
    const params = useSearchParams();
    const scope = (params.get("scope") as HrInboxScope | null) ?? initialScope;
    const flowKey = params.get("flow");

    const { inbox, refusal, error, loading, reload } = useHrInbox(scope, flowKey);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [rejectOpen, setRejectOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [bulkOutcomes, setBulkOutcomes] = useState<HrBulkOutcome[] | null>(null);
    const [bulkRefusal, setBulkRefusal] = useState<HrRefusal | null>(null);
    const [pending, startTransition] = useTransition();

    function setScope(next: HrInboxScope) {
        const query = new URLSearchParams(params.toString());
        query.set("scope", next);
        setSelectedIds([]);
        startTransition(() => router.replace(`/hr/tasks?${query.toString()}`));
    }

    async function runBulk(decision: "approve" | "reject", reason?: string) {
        setBusy(true);
        setBulkRefusal(null);
        setBulkOutcomes(null);
        try {
            const envelope = await bulkDecide(selectedIds, decision, reason ?? null);
            if (isRefusal(envelope)) {
                // WF_BULK_LIMIT / WF_BULK_FORBIDDEN — the whole batch, with the
                // engine's own sentence. Never a generic failure toast.
                setBulkRefusal(envelope);
                return;
            }
            // §5.2: the result names EACH step's outcome. A skip is shown with
            // its reason, not folded into a success count.
            setBulkOutcomes(envelope.results);
            setSelectedIds([]);
            toast.success(
                `${envelope.succeeded} decided${envelope.skipped ? `, ${envelope.skipped} skipped` : ""}`,
            );
            await reload(true);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "The bulk decision could not be sent");
        } finally {
            setBusy(false);
        }
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="rounded-lg border border-destructive/40 bg-card p-4 text-sm">
                    <p className="font-medium text-destructive">Your HR inbox could not be loaded.</p>
                    <p className="mt-1 text-muted-foreground">{error}</p>
                    <Button className="mt-3" size="sm" variant="outline" onClick={() => reload()}>
                        Try again
                    </Button>
                </div>
            </div>
        );
    }

    const scopeRows = inbox?.scope_rows ?? [];
    const mine = inbox?.needs_my_decision ?? [];
    const bulkable = mine.filter((row) => row.allow_bulk_decide);

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                {SCOPES.map((option) => {
                    // §5.9: scopes are shown only where the persona has them.
                    // The HR queue is ABSENT — not disabled — without standing.
                    if (option.key === "queue" && inbox && !inbox.can_view_queue) return null;
                    const active = option.key === scope;
                    return (
                        <Button
                            key={option.key}
                            size="sm"
                            variant={active ? "default" : "outline"}
                            title={option.hint}
                            disabled={pending}
                            onClick={() => setScope(option.key)}
                        >
                            {option.label}
                        </Button>
                    );
                })}
                {flowKey ? (
                    <Button size="sm" variant="ghost" asChild>
                        <Link href={`/hr/tasks?scope=${scope}`}>Clear “{flowKey}” filter</Link>
                    </Button>
                ) : null}
                {inbox ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                        as of {new Date(inbox.as_of).toLocaleTimeString()}
                    </span>
                ) : null}
            </div>

            <div className="flex-1 min-h-0 space-y-8 overflow-y-auto p-4">
                {refusal ? <HrRefusalNotice refusal={refusal} action="Reading this queue" /> : null}
                {bulkRefusal ? (
                    <HrRefusalNotice refusal={bulkRefusal} action="The bulk decision" />
                ) : null}

                {bulkOutcomes ? (
                    <div className="rounded-lg border border-border bg-card p-4">
                        <p className="text-sm font-medium">Per-step outcomes</p>
                        <ul className="mt-2 space-y-1 text-sm">
                            {bulkOutcomes.map((outcome) => (
                                <li key={outcome.step_id} className="flex gap-2">
                                    <span
                                        className={
                                            outcome.granted
                                                ? "text-foreground"
                                                : "text-destructive"
                                        }
                                    >
                                        {outcome.granted ? "decided" : "skipped"}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {outcome.detail ?? outcome.reason ?? outcome.step_id}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <Button
                            className="mt-3"
                            size="sm"
                            variant="ghost"
                            onClick={() => setBulkOutcomes(null)}
                        >
                            Dismiss
                        </Button>
                    </div>
                ) : null}

                {/* --- 1. Needs my decision, grouped by urgency (§5.9) --- */}
                {groupByUrgency(mine).map(({ bucket, rows }) => (
                    <Section
                        key={bucket}
                        icon={CheckCheck}
                        title={`Needs my decision — ${URGENCY_LABEL[bucket]}`}
                        subtitle={`${rows.length} item${rows.length === 1 ? "" : "s"}`}
                    >
                        <HrTaskTable
                            rows={rows}
                            isLoading={loading}
                            selectedIds={selectedIds}
                            onSelectedIdsChange={setSelectedIds}
                            emptyTitle="Nothing here"
                            bulkActions={(selected) => (
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        disabled={busy || selected.length === 0}
                                        onClick={() => void runBulk("approve")}
                                    >
                                        Approve {selected.length}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busy || selected.length === 0}
                                        onClick={() => setRejectOpen(true)}
                                    >
                                        Reject {selected.length}
                                    </Button>
                                </div>
                            )}
                        />
                    </Section>
                ))}

                {!loading && mine.length === 0 && !refusal ? (
                    <Section icon={CheckCheck} title="Needs my decision">
                        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
                            Nothing is waiting on you right now.
                            {inbox && bulkable.length === 0 && scopeRows.length > 0 ? (
                                <> Other work in this organization is listed below.</>
                            ) : null}
                        </div>
                    </Section>
                ) : null}

                {/* --- 2. Auto-applying soon, with a visible countdown (policy rule 4) --- */}
                {inbox && inbox.auto_applying_soon.length > 0 ? (
                    <Section
                        icon={TimerReset}
                        title="Auto-applying soon"
                        subtitle="These decide themselves unless you act"
                    >
                        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                            {inbox.auto_applying_soon.map((row) => (
                                <li
                                    key={row.step_id}
                                    className="flex items-center justify-between gap-3 p-3 text-sm"
                                >
                                    <Link
                                        href={`/hr/tasks/${row.instance_id}?step=${row.step_id}`}
                                        className="truncate font-medium hover:underline"
                                    >
                                        {row.flow_key}
                                    </Link>
                                    <span className="shrink-0 text-destructive">
                                        applies {relativeDue(row.timeout_at)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Section>
                ) : null}

                {/* --- 3. Failures assigned to me --- */}
                {inbox && inbox.failures_assigned_to_me.length > 0 ? (
                    <Section
                        icon={AlertTriangle}
                        title="Failures assigned to me"
                        subtitle="A request that could not finish, waiting on a human"
                    >
                        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                            {inbox.failures_assigned_to_me.map((row) => (
                                <li key={row.failure_id} className="flex items-center gap-3 p-3 text-sm">
                                    <Link
                                        href={`/hr/tasks/${row.instance_id}?failure=${row.failure_id}`}
                                        className="truncate font-medium hover:underline"
                                    >
                                        {row.failure_class}
                                    </Link>
                                    <span className="text-muted-foreground">{row.state}</span>
                                </li>
                            ))}
                        </ul>
                    </Section>
                ) : null}

                {/* --- 4. Team / HR queue (scope_rows) --- */}
                {scope !== "mine" && inbox ? (
                    <Section
                        icon={Hourglass}
                        title={scope === "team" ? "Waiting on my team" : "Open across the organization"}
                        subtitle={`${scopeRows.length} item${scopeRows.length === 1 ? "" : "s"} — waiting on somebody else`}
                    >
                        <HrTaskTable
                            rows={scopeRows}
                            isLoading={loading}
                            showDelivery={false}
                            emptyTitle="Nothing open in this scope"
                        />
                    </Section>
                ) : null}

                {/* --- 5. Waiting on others (mine) + recently decided --- */}
                {inbox && inbox.waiting_on_others.length > 0 ? (
                    <Section
                        icon={Hourglass}
                        title="Waiting on others"
                        subtitle="Requests you filed or that are about you"
                    >
                        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                            {inbox.waiting_on_others.map((row) => (
                                <li key={row.instance_id} className="flex items-center gap-3 p-3 text-sm">
                                    <Link
                                        href={`/hr/tasks/${row.instance_id}`}
                                        className="truncate font-medium hover:underline"
                                    >
                                        {row.flow_key}
                                    </Link>
                                    <span className="text-muted-foreground">{row.state}</span>
                                </li>
                            ))}
                        </ul>
                    </Section>
                ) : null}

                {inbox && inbox.recently_decided.length > 0 ? (
                    <Section
                        icon={History}
                        title="Recently decided"
                        subtitle="Your own decisions, last 30 days"
                    >
                        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                            {inbox.recently_decided.map((row) => (
                                <li key={row.decision_id} className="flex items-center gap-3 p-3 text-sm">
                                    <Link
                                        href={`/hr/tasks/${row.instance_id}`}
                                        className="truncate font-medium hover:underline"
                                    >
                                        {row.decision}
                                    </Link>
                                    <span className="text-muted-foreground">
                                        {row.decided_at
                                            ? new Date(row.decided_at).toLocaleString()
                                            : ""}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Section>
                ) : null}
            </div>

            {/* §5.2: bulk REJECT always requires one reason applied to the whole batch. */}
            <TextInputDialog
                open={rejectOpen}
                onOpenChange={(open) => !busy && setRejectOpen(open)}
                title={`Reject ${selectedIds.length} item${selectedIds.length === 1 ? "" : "s"}`}
                description="One reason is recorded against every item in this batch. It is kept in the decision ledger and the requester sees it."
                placeholder="Why are these being rejected?"
                confirmLabel="Reject"
                multiline
                busy={busy}
                validate={(value) =>
                    value.trim().length < 3 ? "A rejection needs a real reason." : null
                }
                onConfirm={async (reason) => {
                    await runBulk("reject", reason);
                    setRejectOpen(false);
                }}
            />
        </div>
    );
}
