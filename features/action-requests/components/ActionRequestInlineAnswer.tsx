"use client";

// features/action-requests/components/ActionRequestInlineAnswer.tsx — ANSWER AN
// ASK WHERE YOU ARE.
//
// The signed-in twin of the `/q/<token>` page: the SAME form
// (`ActionRequestAnswerForm`), answered through the person's own session
// (`completeActionRequestAsSelf`) instead of a bearer link. The server's
// confirmation replaces the form when it lands, so a second tap has nothing to
// press.

import { CheckCircle2 } from "lucide-react";

import {
  ActionRequestAnswerForm,
  useActionRequestAnswer,
} from "@/features/action-requests/components/ActionRequestAnswerForm";
import {
  completeActionRequestAsSelf,
  type PendingActionRequest,
} from "@/features/action-requests/self-service";

export function ActionRequestInlineAnswer({ request }: { request: PendingActionRequest }) {
  const { busy, refusal, done, submit } = useActionRequestAnswer((answer) =>
    completeActionRequestAsSelf(request.request_id, request.organization_id, answer),
  );

  if (done) {
    return (
      <div className="flex items-start gap-2 p-4">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
        <div className="flex flex-col gap-1">
          {/* THE SERVER'S OWN CONFIRMATION — "Got it, I'm on it." */}
          <p className="text-sm font-medium">{done.message}</p>
          {done.next ? <p className="text-sm text-muted-foreground">{done.next}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <ActionRequestAnswerForm
      render={request.render}
      busy={busy}
      refusal={refusal}
      onSubmit={submit}
      layout="card"
    />
  );
}
