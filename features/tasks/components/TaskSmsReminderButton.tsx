"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { BellRingTapButton } from "@/components/icons/tap-buttons";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  enqueueMyTaskSmsReminder,
  taskSmsReminderBlockedCopy,
} from "@/features/sms/task-reminder";

const MESSAGING_SETTINGS_HREF = "/user-settings/communication/messaging";

export function TaskSmsReminderButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [queuing, setQueuing] = useState(false);

  const queueReminder = async () => {
    const approved = await confirm({
      title: "Text this task reminder?",
      description:
        "AI Matrx will text your verified phone. You can reply DONE to complete this non-recurring task.",
      confirmLabel: "Text reminder",
    });
    if (!approved) return;

    setQueuing(true);
    try {
      const result = await enqueueMyTaskSmsReminder(taskId);
      if (result.outcome === "queued") {
        toast.success("Task reminder queued");
        return;
      }
      if (result.outcome === "duplicate") {
        toast.info("This task reminder is already queued");
        return;
      }

      const blocked = taskSmsReminderBlockedCopy(result.blockedReason);
      toast.error(blocked.message, {
        action: blocked.openMessagingSettings
          ? {
              label: "Open settings",
              onClick: () => router.push(MESSAGING_SETTINGS_HREF),
            }
          : undefined,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not queue the task text reminder.",
      );
    } finally {
      setQueuing(false);
    }
  };

  return (
    <BellRingTapButton
      variant="transparent"
      ariaLabel="Text task reminder"
      tooltip={queuing ? "Queuing task reminder" : "Text this task reminder"}
      label={queuing ? "Queuing…" : "Text reminder"}
      disabled={queuing}
      onClick={() => void queueReminder()}
      className="h-6 min-h-6 text-[10px]"
    />
  );
}
