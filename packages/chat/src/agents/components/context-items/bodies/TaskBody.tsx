"use client";

/**
 * Task drawer body: the task editor is an app feature, so the host registers it. A bare host
 * draws the generic body with a one-line label (PACKAGE-INDEPENDENCE.md section 5.1).
 */

import { hostSlot } from "../../../../host/ui-slots";
import type { ContextItemBodyProps } from "../types";
import { UnregisteredBody } from "./UnregisteredBody";

function TaskBodyStandIn(props: ContextItemBodyProps) {
  return <UnregisteredBody name="TaskBody" what="The task editor" props={props} />;
}

export const TaskBody = hostSlot("TaskBody", TaskBodyStandIn);
