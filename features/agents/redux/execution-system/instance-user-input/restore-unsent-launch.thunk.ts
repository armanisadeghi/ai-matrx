// features/agents/redux/execution-system/instance-user-input/restore-unsent-launch.thunk.ts
//
// Bring an unsent agent window back after a reload: relaunch it from its
// recipe (unsent-launch-store.ts) under the SAME conversation id, with the same
// agent, window, variables and context, and nothing sent. The composer's own
// store then puts the typed text back and says so.
//
// Called by the `agent` address-bar hydrator BEFORE it asks the server for the
// conversation: a recipe exists only while a conversation is unsent, so there
// is nothing on the server to load.

import type { AppDispatch } from "@/lib/redux/store";
import { isSourceFeature } from "@/features/agents/types/instance.types";
import { launchAgentExecution } from "../thunks/launch-agent-execution.thunk";
import { setUserVariableValues } from "../instance-variable-values/instance-variable-values.slice";
import { readUnsentLaunch } from "./unsent-launch-store";
import type { AnyMandateKey } from "@/features/mandates/mandate-key";

/** True when a recipe existed and the window is being rebuilt from it. */
export function restoreUnsentLaunch(
  dispatch: AppDispatch,
  conversationId: string,
): boolean {
  const recipe = readUnsentLaunch(conversationId);
  if (!recipe) return false;

  void dispatch(
    launchAgentExecution({
      agentId: recipe.agentId,
      ...(recipe.mandateKey
        ? { mandateKey: recipe.mandateKey as AnyMandateKey }
        : {}),
      conversationId,
      surfaceKey: recipe.surfaceKey ?? `agent:${recipe.agentId}`,
      sourceFeature:
        recipe.sourceFeature && isSourceFeature(recipe.sourceFeature)
          ? recipe.sourceFeature
          : "agent-runner",
      config: {
        displayMode: recipe.displayMode,
        // A reload is never a decision to spend a paid run.
        autoRun: false,
        ...(recipe.allowChat !== null ? { allowChat: recipe.allowChat } : {}),
        ...(recipe.showVariablePanel !== null
          ? { showVariablePanel: recipe.showVariablePanel }
          : {}),
      },
      runtime: {
        surfaceName: recipe.surfaceName,
        ...(Object.keys(recipe.hostValues).length > 0
          ? { variables: recipe.hostValues }
          : {}),
        ...(Object.keys(recipe.context).length > 0
          ? { context: recipe.context }
          : {}),
      },
    }),
  )
    .unwrap()
    .then(() => {
      if (Object.keys(recipe.userValues).length > 0) {
        dispatch(
          setUserVariableValues({ conversationId, values: recipe.userValues }),
        );
      }
    })
    .catch((err: unknown) => {
      console.error(
        `[unsent-launch] could not rebuild the unsent window ${conversationId}`,
        err,
      );
    });
  return true;
}
