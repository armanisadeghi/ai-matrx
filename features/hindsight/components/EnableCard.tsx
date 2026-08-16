"use client";

/**
 * EnableCard — the "turn on continuous review" onboarding card for one agent
 * the user owns. Enrolling invalidates the hindsight cache, so the host
 * surface re-renders into its enrolled state on success.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Telescope } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import { enroll } from "../api";

export function EnableCard({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const queryClient = useQueryClient();
  const [goal, setGoal] = useState("");

  const enable = useMutation({
    mutationFn: () =>
      enroll({
        subject_kind: "agent",
        subject_id: agentId,
        goal: goal.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Continuous review is on");
      queryClient.invalidateQueries({ queryKey: ["hindsight"] });
    },
    onError: (err: Error) => toast.error(`Could not enable review: ${err.message}`),
  });

  return (
    <Card className="mx-auto max-w-2xl p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Telescope className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">
            Let {agentName} learn from its own conversations
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn this on and a reviewer reads {agentName}&apos;s real
            conversations as they happen — what worked, what didn&apos;t — and
            proposes specific improvements. You see each proposal with its
            evidence and decide: apply it with one click, or dismiss it.
            Nothing ever changes without you.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <label className="text-xs font-medium uppercase text-muted-foreground">
          Anything the reviewer should focus on? (optional)
        </label>
        <Textarea
          className="mt-1"
          rows={2}
          placeholder="e.g. Answers should always cite the source document. Watch for cases where it guesses."
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
      </div>

      <Button
        className="mt-4"
        disabled={enable.isPending}
        onClick={() => enable.mutate()}
        data-testid="hindsight-enable"
      >
        <Eye className="mr-1.5 h-4 w-4" />
        {enable.isPending ? "Turning on…" : "Turn on continuous review"}
      </Button>
    </Card>
  );
}
