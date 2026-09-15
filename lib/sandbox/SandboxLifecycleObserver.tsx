"use client";
import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAuthReady, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { readSandboxOperationReceipts } from "@/lib/durable-run/sandbox-operation-receipt";
import { clearActor, hydrateActor } from "@/lib/redux/slices/sandboxLifecycleSlice";

/** Inactive until GO: safe shell mount that only mirrors current actor receipts into Redux. */
export function SandboxLifecycleObserver() {
  const dispatch = useAppDispatch(); const authReady = useAppSelector(selectAuthReady); const actorId = useAppSelector(selectUserId); const previous = useRef<string | null>(null);
  useEffect(() => { if (!authReady) return; if (!actorId) { previous.current = null; dispatch(clearActor()); return; } if (previous.current === actorId) return; previous.current = actorId; dispatch(hydrateActor({ actorId, receipts: readSandboxOperationReceipts(window.localStorage, actorId) })); }, [actorId, authReady, dispatch]);
  return null;
}
