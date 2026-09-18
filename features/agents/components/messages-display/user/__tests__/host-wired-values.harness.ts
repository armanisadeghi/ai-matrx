/**
 * The real reducer and the real instance-creation action, re-exported so the
 * guard beside this file drives production code rather than a fixture.
 */
import reducer from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { createInstanceFull } from "@/features/agents/redux/execution-system/create-instance-full";

export default reducer;

/** The exact action a launcher's `createInstance*` thunk emits. */
export function createInstanceFullPayloadForTest(conversationId: string) {
  // Only the variables bundle matters to this slice; the rest of the payload
  // belongs to the eight sibling slices the same action initialises.
  return createInstanceFull({
    conversationId,
    variables: { definitions: [], scopeValues: {} },
  } as unknown as Parameters<typeof createInstanceFull>[0]);
}
