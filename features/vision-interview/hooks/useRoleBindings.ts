// features/vision-interview/hooks/useRoleBindings.ts
//
// THE ROOM'S ONE REQUIRED SERVER CALL.
//
// `interview.session.role_bindings` is what makes a stage tab a real room:
// per role, the agent the server bound and a conversation id that is stable
// per role, per session, across runs. Nothing in the browser can produce it —
// each role resolves through a MANDATE (`vision_interview.<role>`), and
// resolving a mandate is the server's authority, never the client's.
//
// So the room asks for it the moment it opens, for EVERY session, before the
// person can talk. It needs no workflow run and it is idempotent (the same
// conversation ids come back on every call), which is exactly why it can be
// unconditional: a brand-new session lands in a talkable room with the person
// doing nothing at all.
//
// Resilience, because a dead tab is the worst possible outcome: retries with
// capped exponential backoff for as long as the room is open, and every wait
// is visible — `rolesPhase` / `rolesError` drive an honest surface with a
// Retry control, never a spinner that means nothing.

import { useCallback, useEffect, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { ensureSessionRolesCall, rolesFromPayload } from "../roomApi";
import {
  roleBindingsFailed,
  roleBindingsResolved,
  roleBindingsResolving,
} from "../redux/vision-interview.slice";

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;

export function useRoleBindings(sessionId: string): { retryRoles: () => void } {
  const dispatch = useAppDispatch();
  // Bumping this tears down any pending backoff and starts a fresh attempt
  // immediately — what the room's Retry control does.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const run = async () => {
      if (disposed) return;
      dispatch(roleBindingsResolving());
      // callApi captures its own failures into the error store — the room's
      // job here is to stay honest on screen and to keep trying.
      const result = await dispatch(ensureSessionRolesCall(sessionId));
      if (disposed) return;

      const roles = result.error ? null : rolesFromPayload(result.data);
      if (roles && Object.keys(roles).length > 0) {
        dispatch(roleBindingsResolved({ sessionId, roles }));
        return;
      }

      dispatch(
        roleBindingsFailed(
          result.error?.message ??
            "The server answered without any expert rooms for this interview.",
        ),
      );
      attempt += 1;
      const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
      timer = setTimeout(() => void run(), delay);
    };

    void run();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [dispatch, sessionId, generation]);

  const retryRoles = useCallback(() => setGeneration((g) => g + 1), []);

  return { retryRoles };
}
