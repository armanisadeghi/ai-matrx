"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchHrInbox } from "@/features/hr/tasks/service";
import type { HrInbox, HrInboxScope, HrRefusal } from "@/features/hr/tasks/types";
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

export function useHrInbox(scope: HrInboxScope, flowKey: string | null) {
    const [state, setState] = useState<State>(INITIAL);

    const load = useCallback(
        async (quiet = false) => {
            if (!quiet) setState((s) => ({ ...s, loading: true }));
            try {
                const envelope = await fetchHrInbox(scope, { flowKey });
                if (isRefusal(envelope)) {
                    setState({ inbox: null, refusal: envelope, error: null, loading: false });
                    return;
                }
                setState({ inbox: envelope, refusal: null, error: null, loading: false });
            } catch (e) {
                setState({
                    inbox: null,
                    refusal: null,
                    error: e instanceof Error ? e.message : "Could not load your HR inbox",
                    loading: false,
                });
            }
        },
        [scope, flowKey],
    );

    useEffect(() => {
        void load();
    }, [load]);

    return { ...state, reload: load };
}
