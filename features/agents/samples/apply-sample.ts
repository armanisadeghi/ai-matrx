/**
 * Load a saved test case into a composer — its text, its variable values and
 * its attachments, all of them visible.
 *
 * Attachments come back as the same resource chips a person attaching them
 * would get (`messagePartsToResources`), never as hidden message parts: until
 * 2026-10-04 they were written to `messageParts` only, which every composer
 * ignores, so a test case looked as if its files had not loaded. A part with
 * no chip form stays on the request and is returned so the caller names it.
 */

import type { MessagePart } from "@ai-matrx/agents/generated/stream-events";
import type { ChatThunk } from "@ai-matrx/chat/store/root-state";
import { setUserVariableValues } from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  setUserInputMessageParts,
  setUserInputText,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { messagePartsToResources } from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/message-part-resources";
import { replaceInstanceResources } from "@ai-matrx/chat/agents/redux/execution-system/thunks/copy-instance-request-draft.thunk";
import { isJsonObject } from "@/types/json";
import {
  sampleAttachmentParts,
  sampleInputText,
  type AgentSampleRow,
} from "./service";

export function applySampleToComposer({
  conversationId,
  sample,
}: {
  conversationId: string;
  sample: Pick<AgentSampleRow, "metadata" | "user_input" | "variables">;
}): ChatThunk<MessagePart[]> {
  return (dispatch) => {
    const values = isJsonObject(sample.variables) ? sample.variables : {};
    dispatch(setUserVariableValues({ conversationId, values }));
    dispatch(
      setUserInputText({
        conversationId,
        text: sampleInputText(sample),
        userValues: values,
      }),
    );
    const { resources, unattached } = messagePartsToResources(
      sampleAttachmentParts(sample),
    );
    dispatch(replaceInstanceResources({ conversationId, resources }));
    dispatch(
      setUserInputMessageParts({
        conversationId,
        parts: unattached.length > 0 ? unattached : null,
      }),
    );
    return unattached;
  };
}
