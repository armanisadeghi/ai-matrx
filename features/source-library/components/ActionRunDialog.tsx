"use client";

/**
 * THE HONEST CONFIRM — nothing is spent before this screen has been read.
 *
 * The contract's §7.2 is explicit: "nothing paid runs without this having been
 * shown and confirmed", and a job with `paid_count > 0` and no valid token is
 * refused with `estimate_required`. This dialog is the client half of that law,
 * and it is deliberately dull: the server's OWN numbers, in the server's own
 * words, before a single button that starts anything.
 *
 * It also shows the numbers for a FREE selection, which the contract says the
 * client "should still show" — because "this is free" is a claim, and a person
 * is entitled to see what it is free over.
 *
 * The form under the numbers is generated from the Action's `params_schema`
 * (§8). Nothing about any specific Action is written here; the only places with
 * real knowledge are the two record pickers — Rulebook and agent — which exist
 * because "pick the thing this runs against" is a door into another feature,
 * not a text box for a uuid.
 */

import { useCallback, useEffect, useState } from "react";
import {
    BadgeDollarSign,
    Captions,
    CircleAlert,
    Clock,
    Loader2,
    TriangleAlert,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Skeleton, Switch } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { formatCost, formatCount, formatSecondsEstimate } from "../format";
import type { ActionDeclaration, EstimateResult } from "../types";
import { RulebookParamPicker } from "./RulebookParamPicker";
import { AgentParamPicker } from "./AgentParamPicker";

export interface ActionRunDialogProps {
    open: boolean;
    action: ActionDeclaration | null;
    selectionCount: number;
    /** "matching" means the person asked for everything the filter matches. */
    selectionMode: "ids" | "matching";
    estimate: EstimateResult | null;
    estimateLoading: boolean;
    /** A sentence from the server. Rendered instead of a Start button. */
    estimateError: string | null;
    estimateRemedy: string | null;
    params: Record<string, unknown>;
    onParamsChange: (next: Record<string, unknown>) => void;
    submitting: boolean;
    submitError: string | null;
    onCancel: () => void;
    onConfirm: () => void;
}

interface SchemaProperty {
    type?: string;
    enum?: string[];
    format?: string;
    title?: string;
    description?: string;
    default?: unknown;
}

function readSchema(action: ActionDeclaration | null): {
    properties: Record<string, SchemaProperty>;
    required: string[];
} {
    const schema = action?.params_schema;
    if (!schema || typeof schema !== "object") return { properties: {}, required: [] };
    const raw = schema as Record<string, unknown>;
    const properties =
        raw.properties && typeof raw.properties === "object"
            ? (raw.properties as Record<string, SchemaProperty>)
            : {};
    const required = Array.isArray(raw.required)
        ? raw.required.filter((value): value is string => typeof value === "string")
        : [];
    // A schema the contract left as a placeholder ("…": "…") has no usable
    // property shape. Rendering it as a field would be a control that cannot
    // mean anything, so it is skipped and the dialog says nothing about it.
    const usable: Record<string, SchemaProperty> = {};
    for (const [key, value] of Object.entries(properties)) {
        if (value && typeof value === "object" && !key.includes("…")) usable[key] = value;
    }
    return { properties: usable, required };
}

function humanize(key: string): string {
    return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function ActionRunDialog(props: ActionRunDialogProps) {
    const {
        open,
        action,
        selectionCount,
        selectionMode,
        estimate,
        estimateLoading,
        estimateError,
        estimateRemedy,
        params,
        onParamsChange,
        submitting,
        submitError,
        onCancel,
        onConfirm,
    } = props;

    const { properties, required } = readSchema(action);

    const setParam = useCallback(
        (key: string, value: unknown) => onParamsChange({ ...params, [key]: value }),
        [onParamsChange, params],
    );

    // Schema defaults land once, when the dialog opens for an Action.
    useEffect(() => {
        if (!open || !action) return;
        const withDefaults: Record<string, unknown> = {};
        for (const [key, property] of Object.entries(properties)) {
            if (params[key] === undefined && property.default !== undefined) {
                withDefaults[key] = property.default;
            }
        }
        if (Object.keys(withDefaults).length) {
            onParamsChange({ ...params, ...withDefaults });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, action?.key]);

    if (!action) return null;

    // 🚨 `available: false` IS A DECLARATION, NOT A HIDDEN ROW. The server names
    // an Action whose runner is not wired and says in a sentence what is missing,
    // so a person planning work can see what the platform intends to do. What it
    // must never do is pretend: before this, the declaration's `available` was not
    // even in the TypeScript interface, so `summarize` and `organize` were live
    // buttons that opened this dialog and answered 501 on Start. Not-yet is stated
    // here, in the server's own words, and the Start button is ABSENT — never
    // present-and-dead, and never wearing a sentence the server did not write.
    const notYet = action.available === false;

    const missing = required.filter(
        (key) => params[key] === undefined || params[key] === "" || params[key] === null,
    );
    const paid = (estimate?.paid_count ?? 0) > 0;
    const blocked = Boolean(estimateError) || missing.length > 0;
    const needsEstimate = action.requires_estimate || action.cost_class !== "free";
    const waiting = needsEstimate && estimateLoading;

    return (
        <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
            <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {action.label} {formatCount(selectionCount)}{" "}
                        {selectionCount === 1 ? "video" : "videos"}
                    </DialogTitle>
                    <DialogDescription>{action.description}</DialogDescription>
                </DialogHeader>

                {selectionMode === "matching" && (
                    <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                        This is everything matching the filters on screen, not only the
                        rows you can see.
                    </p>
                )}

                {notYet && (
                    <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                        <TriangleAlert
                            className="mt-0.5 size-4 shrink-0 text-amber-500"
                            aria-hidden
                        />
                        <span>
                            {action.unavailable_reason ??
                                `${action.label} is declared but is not wired up yet, so nothing would happen.`}
                        </span>
                    </p>
                )}

                {!notYet && needsEstimate && (
                    <section className="rounded-lg border border-border">
                        <h3 className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            What this will cost
                        </h3>

                        {waiting && (
                            <div className="space-y-2 p-3">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-1/2" />
                                <Skeleton className="h-4 w-2/3" />
                            </div>
                        )}

                        {!waiting && estimateError && (
                            <div className="flex items-start gap-2 p-3 text-sm text-destructive">
                                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                                <span>
                                    {estimateError}
                                    {estimateRemedy ? (
                                        <span className="ml-1 text-muted-foreground">
                                            ({estimateRemedy.replace(/_/g, " ")})
                                        </span>
                                    ) : null}
                                    <span className="mt-1 block text-muted-foreground">
                                        Nothing has been started and nothing has been spent.
                                    </span>
                                </span>
                            </div>
                        )}

                        {!waiting && !estimateError && estimate && (
                            <dl className="divide-y divide-border text-sm">
                                <Row
                                    icon={<Captions className="size-4" aria-hidden />}
                                    label="Free, from YouTube's own captions"
                                    value={`${formatCount(estimate.free_count)} ${estimate.free_count === 1 ? "video" : "videos"}`}
                                />
                                <Row
                                    icon={<BadgeDollarSign className="size-4" aria-hidden />}
                                    label="Paid — a model watches the video"
                                    value={`${formatCount(estimate.paid_count)} ${estimate.paid_count === 1 ? "video" : "videos"}`}
                                />
                                {estimate.already_done > 0 && (
                                    <Row
                                        label="Already done — skipped"
                                        value={formatCount(estimate.already_done)}
                                    />
                                )}
                                {estimate.skipped_count > 0 && (
                                    <Row
                                        label="Cannot be done at all"
                                        value={formatCount(estimate.skipped_count)}
                                    />
                                )}
                                <Row
                                    label="Cost"
                                    value={
                                        paid
                                            ? `${formatCost(estimate.cost.paid_cost_estimate, estimate.cost.currency)} (between ${formatCost(estimate.cost.paid_cost_low, estimate.cost.currency)} and ${formatCost(estimate.cost.paid_cost_high, estimate.cost.currency)})`
                                            : "Free"
                                    }
                                    hint={estimate.cost.basis}
                                    strong
                                />
                                <Row
                                    icon={<Clock className="size-4" aria-hidden />}
                                    label="About how long"
                                    value={formatSecondsEstimate(
                                        estimate.time.wall_seconds_estimate,
                                    )}
                                    hint={`${estimate.time.parallelism} at a time`}
                                />
                            </dl>
                        )}

                        {!waiting && estimate?.warnings.length ? (
                            <ul className="space-y-1 border-t border-border p-3 text-sm text-amber-700 dark:text-amber-400">
                                {estimate.warnings.map((warning) => (
                                    <li key={warning} className="flex items-start gap-2">
                                        <TriangleAlert
                                            className="mt-0.5 size-4 shrink-0"
                                            aria-hidden
                                        />
                                        <span>{warning}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </section>
                )}

                {!notYet && Object.keys(properties).length > 0 && (
                    <div className="space-y-3">
                        {Object.entries(properties).map(([key, property]) => {
                            const label = property.title ?? humanize(key);
                            const value = params[key];

                            if (key === "agent_id") {
                                return (
                                    <AgentParamPicker
                                        key={key}
                                        label={label}
                                        value={typeof value === "string" ? value : null}
                                        onChange={(next) => setParam(key, next)}
                                    />
                                );
                            }

                            if (key === "rulebook_id") {
                                return (
                                    <RulebookParamPicker
                                        key={key}
                                        label={label}
                                        value={typeof value === "string" ? value : null}
                                        onChange={(next) => setParam(key, next)}
                                    />
                                );
                            }

                            if (property.type === "boolean") {
                                return (
                                    <div
                                        key={key}
                                        className="flex items-center justify-between gap-3"
                                    >
                                        <Label htmlFor={`param-${key}`}>{label}</Label>
                                        <Switch
                                            id={`param-${key}`}
                                            checked={Boolean(value)}
                                            onCheckedChange={(next: boolean) =>
                                                setParam(key, next)
                                            }
                                        />
                                    </div>
                                );
                            }

                            if (property.enum?.length) {
                                return (
                                    <div key={key} className="space-y-1.5">
                                        <Label htmlFor={`param-${key}`}>{label}</Label>
                                        <Select
                                            value={typeof value === "string" ? value : ""}
                                            onValueChange={(next) => setParam(key, next)}
                                        >
                                            <SelectTrigger
                                                id={`param-${key}`}
                                                className="h-11"
                                            >
                                                <SelectValue placeholder="Choose one" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {property.enum.map((option) => (
                                                    <SelectItem key={option} value={option}>
                                                        {humanize(option)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                );
                            }

                            return (
                                <div key={key} className="space-y-1.5">
                                    <Label htmlFor={`param-${key}`}>{label}</Label>
                                    <Input
                                        id={`param-${key}`}
                                        className="h-11"
                                        value={typeof value === "string" ? value : ""}
                                        onChange={(
                                            event: React.ChangeEvent<HTMLInputElement>,
                                        ) => setParam(key, event.target.value)}
                                    />
                                    {property.description ? (
                                        <p className="text-xs text-muted-foreground">
                                            {property.description}
                                        </p>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}

                {!notYet && missing.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                        {action.label} needs {missing.map(humanize).join(", ").toLowerCase()}{" "}
                        before it can start.
                    </p>
                )}

                {submitError && (
                    <p className="flex items-start gap-2 text-sm text-destructive">
                        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {submitError}
                    </p>
                )}

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        className="h-11"
                        onClick={onCancel}
                        disabled={submitting}
                    >
                        {notYet ? "Close" : "Cancel"}
                    </Button>
                    {notYet ? null : (
                    <Button
                        className="h-11 gap-2"
                        onClick={onConfirm}
                        disabled={waiting || blocked || submitting}
                    >
                        {submitting ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : null}
                        {paid
                            ? `Spend up to ${formatCost(estimate?.cost.paid_cost_high ?? 0, estimate?.cost.currency)} and start`
                            : `Start ${action.label.toLowerCase()}`}
                    </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function Row({
    icon,
    label,
    value,
    hint,
    strong,
}: {
    icon?: React.ReactNode;
    label: string;
    value: string;
    hint?: string;
    strong?: boolean;
}) {
    return (
        <div className="flex items-start justify-between gap-3 px-3 py-2">
            <dt className="flex min-w-0 items-start gap-2 text-muted-foreground">
                {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
                <span className="min-w-0">
                    {label}
                    {hint ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground/80">
                            {hint}
                        </span>
                    ) : null}
                </span>
            </dt>
            <dd
                className={
                    strong
                        ? "shrink-0 text-right font-medium tabular-nums text-foreground"
                        : "shrink-0 text-right tabular-nums"
                }
            >
                {value}
            </dd>
        </div>
    );
}
