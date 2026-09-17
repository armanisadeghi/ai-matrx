"use client";

/**
 * Turns the SERVER'S Action registry into the list's bulk actions.
 *
 * Every button on the selection bar is one `ActionDeclaration` from
 * `GET /media/actions`. Nothing is hardcoded — not the label, not the order, not
 * the cost class, not the parameters — so one declaration server-side is enough
 * for a new Action to appear here, and a retired one disappears.
 *
 * WHY THE CONFIRM IS NOT THE SHELL'S. `EntityBulkAction.confirm` is synchronous,
 * and an honest confirm for this feature cannot be: the numbers it must show
 * come from `POST …/estimate`, which is a round trip. So `run` opens this
 * feature's own dialog and AWAITS the person's decision — the shell still owns
 * the pending state, the toast, and keeping the selection on failure, because
 * `run` is still the promise it is watching.
 */

import { useCallback, useState } from "react";
import { BadgeDollarSign, Play } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import type {
    EntityBulkAction,
    EntityBulkActionResult,
    EntityBulkSelection,
} from "@/lib/entity-list/selection";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import { MediaApiError, createJob, estimateAction } from "../api";
import { toVideoQuery } from "../catalog/service";
import type {
    ActionDeclaration,
    EstimateResult,
    SelectionDescriptor,
    VideoRow,
} from "../types";
import { ActionRunDialog } from "../components/ActionRunDialog";
import { actionNeedsEstimate } from "./useActionRegistry";

interface Pending {
    action: ActionDeclaration;
    selection: EntityBulkSelection<VideoRow>;
    resolve: (result: EntityBulkActionResult | void) => void;
}

export interface UseActionRunner {
    bulkActions: EntityBulkAction<VideoRow>[];
    /** Job ids this mount started, newest first. The panel renders them. */
    startedJobIds: string[];
    dialog: React.ReactNode;
}

/**
 * The selection as the contract's descriptor.
 *
 * "Everything matching this filter" travels as the FILTER, never as 412 ids —
 * §4.2: "the same query object is the selection descriptor in §7 … so 'all 412'
 * never travels as 412 ids".
 */
export function selectionToDescriptor(
    selection: EntityBulkSelection<VideoRow>,
): SelectionDescriptor {
    if (selection.mode === "matching") {
        return {
            video_ids: null,
            filter: toVideoQuery({
                ...DEFAULT_ENTITY_LIST_QUERY,
                ...selection.filter,
                page: 1,
            }),
        };
    }
    return { video_ids: selection.ids, filter: null };
}

export function useActionRunner(
    libraryId: string,
    actions: ActionDeclaration[],
    onJobStarted?: (jobId: string) => void,
): UseActionRunner {
    const dispatch = useAppDispatch();
    const [pending, setPending] = useState<Pending | null>(null);
    const [estimate, setEstimate] = useState<EstimateResult | null>(null);
    const [estimateLoading, setEstimateLoading] = useState(false);
    const [estimateError, setEstimateError] = useState<string | null>(null);
    const [estimateRemedy, setEstimateRemedy] = useState<string | null>(null);
    const [params, setParams] = useState<Record<string, unknown>>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [startedJobIds, setStartedJobIds] = useState<string[]>([]);

    const close = useCallback(
        (result: EntityBulkActionResult | void) => {
            pending?.resolve(result);
            setPending(null);
            setEstimate(null);
            setEstimateError(null);
            setEstimateRemedy(null);
            setParams({});
            setSubmitError(null);
            setSubmitting(false);
        },
        [pending],
    );

    const open = useCallback(
        (action: ActionDeclaration, selection: EntityBulkSelection<VideoRow>) =>
            new Promise<EntityBulkActionResult | void>((resolve) => {
                setPending({ action, selection, resolve });
                setEstimate(null);
                setEstimateError(null);
                setEstimateRemedy(null);
                setSubmitError(null);
                setParams({});

                if (!actionNeedsEstimate(action)) return;

                setEstimateLoading(true);
                void estimateAction(dispatch, libraryId, {
                    action: action.key,
                    selection: selectionToDescriptor(selection),
                    allow_paid: true,
                })
                    .then((result) => {
                        setEstimate(result);
                    })
                    .catch((error: unknown) => {
                        setEstimateError(
                            error instanceof MediaApiError
                                ? error.message
                                : `The cost of running ${action.label.toLowerCase()} on this selection could not be worked out, so nothing was started.`,
                        );
                        setEstimateRemedy(
                            error instanceof MediaApiError ? error.remedy : null,
                        );
                    })
                    .finally(() => setEstimateLoading(false));
            }),
        [dispatch, libraryId],
    );

    const confirmRun = useCallback(async () => {
        if (!pending) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const job = await createJob(dispatch, libraryId, {
                action: pending.action.key,
                selection: selectionToDescriptor(pending.selection),
                estimate_token: estimate?.estimate_token ?? null,
                allow_paid: (estimate?.paid_count ?? 0) > 0,
                params,
                name: `${pending.action.label} ${pending.selection.count} videos`,
            });
            setStartedJobIds((current) => [job.id, ...current]);
            onJobStarted?.(job.id);
            close({
                message: `${pending.action.label} started on ${pending.selection.count} ${
                    pending.selection.count === 1 ? "video" : "videos"
                }. Watch it below — it keeps running if you close this tab.`,
                refresh: true,
            });
        } catch (error) {
            setSubmitting(false);
            setSubmitError(
                error instanceof MediaApiError
                    ? error.message
                    : "The server would not start this, and nothing was spent.",
            );
        }
    }, [close, dispatch, estimate, libraryId, onJobStarted, params, pending]);

    const bulkActions: EntityBulkAction<VideoRow>[] = actions.map((action) => ({
        id: action.key,
        label: action.label,
        icon: action.cost_class === "free" ? Play : BadgeDollarSign,
        variant: "outline" as const,
        run: (selection) => open(action, selection),
    }));

    const dialog = (
        <ActionRunDialog
            open={pending !== null}
            action={pending?.action ?? null}
            selectionCount={pending?.selection.count ?? 0}
            selectionMode={pending?.selection.mode ?? "ids"}
            estimate={estimate}
            estimateLoading={estimateLoading}
            estimateError={estimateError}
            estimateRemedy={estimateRemedy}
            params={params}
            onParamsChange={setParams}
            submitting={submitting}
            submitError={submitError}
            onCancel={() => close(undefined)}
            onConfirm={() => void confirmRun()}
        />
    );

    return { bulkActions, startedJobIds, dialog };
}
