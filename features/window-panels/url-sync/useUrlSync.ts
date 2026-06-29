import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { registerSyncEntry, unregisterSyncEntry } from "@/lib/redux/slices/urlSyncSlice";

/**
 * useUrlSync
 * 
 * Automatically registers and unregisters an open panel component to the URL.
 * Any component that renders this hook will have its state mapped to ?panels= in the URL.
 * 
 * @param typeKey The unique key representing the type of panel (e.g. "agent")
 * @param instanceId The unique UUID or identifier of this specific panel instance
 * @param args Additional metadata required to perfectly restore the panel (e.g. { v: "fc" })
 */
export function useUrlSync(typeKey?: string, instanceId?: string, args?: Record<string, string>) {
    const dispatch = useAppDispatch();
    
    // Convert args to a stable string for dependency comparison
    const argsKey = args ? Object.keys(args).sort().map(k => `${k}=${args[k]}`).join('&') : '';

    useEffect(() => {
        if (!typeKey || !instanceId) return undefined;

        dispatch(registerSyncEntry({ typeKey, instanceId, args }));
        
        return () => {
            dispatch(unregisterSyncEntry({ typeKey, instanceId }));
        };
    }, [typeKey, instanceId, argsKey, dispatch]);
}
