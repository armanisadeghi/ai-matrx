"use client";

/**
 * AgentHindsightPanel — Hindsight for ONE agent the user owns (Layer 2).
 *
 * The admin console watches the whole platform; this panel is the product
 * surface: a user turns on continuous review for their own agent, and from
 * then on a reviewer agent periodically reads the agent's REAL conversations
 * and proposes concrete improvements the user can apply or reject with one
 * click — no prompt engineering required.
 *
 * The server scopes everything to the caller (a non-admin only ever sees
 * their own enrollments), so this component simply asks for the enrollment
 * matching this agent. Doors render for the product audience: the agent opens
 * at /agents/{id}, transcripts at /chat/{id}.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import { enroll, listEnrollments } from "../api";
import { DoorAudienceProvider } from "./door-audience";
import { EnrollmentDetailPanel } from "./EnrollmentDetailPanel";

function EnableCard({ agentId, agentName }: { agentId: string; agentName: string }) {
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
          <Sparkles className="h-5 w-5" />
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

export function AgentHindsightPanel({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const enrollments = useQuery({
    queryKey: ["hindsight", "enrollments"],
    queryFn: () => listEnrollments(),
  });

  if (enrollments.isLoading) return <Skeleton className="h-64" />;
  if (enrollments.isError) {
    return (
      <Card className="p-4 text-sm text-red-600 dark:text-red-400">
        Could not load review status: {(enrollments.error as Error).message}
      </Card>
    );
  }

  const mine = (enrollments.data ?? []).find(
    (e) => e.subject_kind === "agent" && e.subject_id === agentId,
  );

  return (
    <DoorAudienceProvider audience="product">
      {mine ? (
        <EnrollmentDetailPanel
          enrollmentId={mine.id}
          onArchived={() => enrollments.refetch()}
        />
      ) : (
        <EnableCard agentId={agentId} agentName={agentName} />
      )}
    </DoorAudienceProvider>
  );
}
