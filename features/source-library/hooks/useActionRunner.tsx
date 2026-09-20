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

import { useCallback, useRef, useState } from "react";
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
import { sourceVocabulary, type SourceVocabulary } from "../vocabulary";
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
            source_ids: null,
            filter: toVideoQuery({
                ...DEFAULT_ENTITY_LIST_QUERY,
                ...selection.filter,
                page: 1,
            }),
        };
    }
    return { source_ids: selection.ids, filter: null };
}

/**
 * The Action registry declares these two transcription controls. They are
 * top-level estimate/job fields, rather than opaque Action params, because the
 * server freezes them into the durable estimate before it creates a job.
 *
 * Free captions with paid fallback off is the safe default. A person can opt
 * into paid work, but that choice always causes a fresh estimate before Start
 * becomes available.
 */
function transcriptionOptions(
    action: ActionDeclaration,
    params: Record<string, unknown>,
): { allow_paid?: boolean; prefer_lane?: "free_captions" | "paid_agent" } {
    if (action.key !== "transcribe") return {};
    return {
        allow_paid: params.allow_paid === true,
        prefer_lane: params.prefer_lane === "paid_agent" ? "paid_agent" : "free_captions",
    };
}

function initialActionParams(action: ActionDeclaration): Record<string, unknown> {
    if (action.key !== "transcribe") return {};
    return { allow_paid: false, prefer_lane: "free_captions" };
}

export function useActionRunner(
    libraryId: string,
    actions: ActionDeclaration[],
    onJobStarted?: (jobId: string) => void,
    /** D6b (jobs-bar cold-walk-12): this Library's own words for the confirm
     *  dialog, the job's own name and the "started on N …" toast. Omitted
     *  (e.g. in a test with no Library row yet) falls back to the neutral
     *  "item(s)" vocabulary rather than YouTube's. */
    vocabulary: SourceVocabulary = sourceVocabulary(null),
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
    const estimateSequence = useRef(0);

    const loadEstimate = useCallback(
        (
            action: ActionDeclaration,
            selection: EntityBulkSelection<VideoRow>,
            nextParams: Record<string, unknown>,
        ) => {
            if (!actionNeedsEstimate(action)) return;
            const sequence = ++estimateSequence.current;
            setEstimateLoading(true);
            setEstimate(null);
            setEstimateError(null);
            setEstimateRemedy(null);
            const options = transcriptionOptions(action, nextParams);
            void estimateAction(dispatch, libraryId, {
                action: action.key,
                selection: selectionToDescriptor(selection),
                ...options,
                params: nextParams,
            })
                .then((result) => {
                    if (sequence === estimateSequence.current) setEstimate(result);
                })
                .catch((error: unknown) => {
                    if (sequence !== estimateSequence.current) return;
                    setEstimateError(
                        error instanceof MediaApiError
                            ? error.message
                            : `The cost of running ${action.label.toLowerCase()} on this selection could not be worked out, so nothing was started.`,
                    );
                    setEstimateRemedy(
                        error instanceof MediaApiError ? error.remedy : null,
                    );
                })
                .finally(() => {
                    if (sequence === estimateSequence.current) setEstimateLoading(false);
                });
        },
        [dispatch, libraryId],
    );

    const close = useCallback(
        (result: EntityBulkActionResult | void) => {
            estimateSequence.current += 1;
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
                const nextParams = initialActionParams(action);
                setPending({ action, selection, resolve });
                setEstimate(null);
                setEstimateError(null);
                setEstimateRemedy(null);
                setSubmitError(null);
                setParams(nextParams);
                // An Action the server declared as not-yet has nothing to price, and
                // asking for an estimate would answer 501 and put a failure sentence
                // on a dialog whose real message is the declaration's own.
                if (action.available !== false) {
                    loadEstimate(action, selection, nextParams);
                }
            }),
        [loadEstimate],
    );

    const updateParams = useCallback(
        (nextParams: Record<string, unknown>) => {
            setParams(nextParams);
            if (pending) loadEstimate(pending.action, pending.selection, nextParams);
        },
        [loadEstimate, pending],
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
                ...transcriptionOptions(pending.action, params),
                params,
                name: `${pending.action.label} ${pending.selection.count} ${
                    pending.selection.count === 1
                        ? vocabulary.item.one
                        : vocabulary.item.many.toLowerCase()
                }`,
            });
            setStartedJobIds((current) => [job.id, ...current]);
            onJobStarted?.(job.id);
            close({
                message: `${pending.action.label} started on ${pending.selection.count} ${
                    pending.selection.count === 1
                        ? vocabulary.item.one
                        : vocabulary.item.many.toLowerCase()
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
            vocabulary={vocabulary}
            estimate={estimate}
            estimateLoading={estimateLoading}
            estimateError={estimateError}
            estimateRemedy={estimateRemedy}
            params={params}
            onParamsChange={updateParams}
            submitting={submitting}
            submitError={submitError}
            onCancel={() => close(undefined)}
            onConfirm={() => void confirmRun()}
        />
    );

    return { bulkActions, startedJobIds, dialog };
}
