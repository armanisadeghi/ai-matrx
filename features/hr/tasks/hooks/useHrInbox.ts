"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchHrInbox } from "@/features/hr/tasks/service";
import type { HrInbox, HrInboxPageOffsets, HrInboxScope, HrInboxSection, HrRefusal } from "@/features/hr/tasks/types";
import { isRefusal } from "@/features/hr/tasks/types";

type State = {
    inbox: HrInbox | null;
    /** The engine's own refusal, rendered in place — never swallowed. */
    refusal: HrRefusal | null;
    /** A transport failure, which is a different thing from a refusal. */
    error: string | null;
    loading: boolean;
};

const INITIAL: State = { inbox: null, refusal: null, error: null, loading: true };
const EMPTY_PAGE_OFFSETS: HrInboxPageOffsets = Object.freeze({});

export function useHrInbox(scope: HrInboxScope, flowKey: string | null) {
    const [state, setState] = useState<State>(INITIAL);
    const contextKey = `${scope}\0${flowKey ?? ""}`;
    const [pages, setPages] = useState<{ contextKey: string; offsets: HrInboxPageOffsets }>({
        contextKey,
        offsets: {},
    });
    const pageOffsets = pages.contextKey === contextKey ? pages.offsets : EMPTY_PAGE_OFFSETS;
    const [refreshGeneration, setRefreshGeneration] = useState(0);
    const requestVersion = useRef(0);

    const load = useCallback(
        async (quiet = false) => {
            const version = ++requestVersion.current;
            if (!quiet) setState((s) => ({ ...s, loading: true }));
            try {
                const envelope = await fetchHrInbox(scope, { flowKey, pageOffsets });
                if (version !== requestVersion.current) return;
                if (isRefusal(envelope)) {
                    setState({ inbox: null, refusal: envelope, error: null, loading: false });
                    return;
                }
                setState({ inbox: envelope.data, refusal: null, error: null, loading: false });
            } catch (e) {
                if (version !== requestVersion.current) return;
                setState({
                    inbox: null,
                    refusal: null,
                    error: e instanceof Error ? e.message : "Could not load your HR inbox",
                    loading: false,
                });
            }
        },
        [scope, flowKey, pageOffsets],
    );

    useEffect(() => {
        void load();
    }, [load, refreshGeneration]);

    const setPage = useCallback((section: HrInboxSection, offset: number) => {
        setPages((current) => ({
            contextKey,
            offsets: { ...(current.contextKey === contextKey ? current.offsets : {}), [section]: offset },
        }));
    }, [contextKey]);
    // A mutation must reload even when it was already on the first page: React may otherwise
    // bail out of the identical `{}` state update and leave a decided/resolved row visible.
    const resetPages = useCallback(() => {
        setPages({ contextKey, offsets: {} });
        setRefreshGeneration((generation) => generation + 1);
    }, [contextKey]);
    return { ...state, pageOffsets, setPage, resetPages, reload: load };
}
