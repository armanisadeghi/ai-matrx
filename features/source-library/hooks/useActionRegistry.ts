"use client";

/**
 * The Action bar is the SERVER'S menu.
 *
 * 🚨 ONE DECLARATION SERVER-SIDE MUST BE ENOUGH TO APPEAR HERE. Nothing in this
 * feature holds a list of actions, a label, a description, a cost class or a
 * params schema — they all arrive from `GET /media/actions` (§8). An action the
 * server adds tomorrow renders tomorrow with no frontend change; an action it
 * retires disappears. A hardcoded fallback list would defeat the whole point,
 * so there is none: if the registry cannot be read, the bar says so in the
 * server's own words and offers a retry, and no buttons are invented.
 */

import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { MediaApiError, listActions } from "../api";
import type { ActionDeclaration } from "../types";

export interface ActionRegistryState {
    actions: ActionDeclaration[];
    loading: boolean;
    /** A sentence. Rendered instead of buttons — never beside invented ones. */
    error: string | null;
    remedy: string | null;
    reload: () => Promise<void>;
}

export function useActionRegistry(): ActionRegistryState {
    const dispatch = useAppDispatch();
    // 🚨 THE ACTIVE ORGANIZATION RESOLVES AFTER THE FIRST RENDER, and every call
    // through `callApi` refuses without it ("Select an organization before
    // sending this request"). A read fired once on mount therefore fails and
    // never retries — measured live on the Library page. Naming it as a
    // dependency is the whole fix: the read re-runs the moment it lands.
    const organizationId = useAppSelector(selectOrganizationId);
    const [actions, setActions] = useState<ActionDeclaration[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [remedy, setRemedy] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        setRemedy(null);
        try {
            const declared = await listActions(dispatch);
            setActions(declared);
        } catch (caught) {
            setActions([]);
            if (caught instanceof MediaApiError) {
                setError(
                    caught.status === 404
                        ? "This server does not publish an Action registry yet, so there is nothing that can be run on a selection here. It arrives with the Media Source Catalog server release."
                        : caught.message,
                );
                setRemedy(caught.remedy);
            } else {
                setError(
                    "The list of things you can do with a selection could not be read from the server.",
                );
            }
        } finally {
            setLoading(false);
        }
    }, [dispatch]);

    useEffect(() => {
        void reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload, organizationId]);

    return { actions, loading, error, remedy, reload };
}

/** Anything not `free` costs something, so it goes through the estimate first. */
export function actionNeedsEstimate(action: ActionDeclaration): boolean {
    return action.requires_estimate || action.cost_class !== "free";
}
