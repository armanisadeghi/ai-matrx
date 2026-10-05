"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Copy, Loader2 } from "lucide-react";
import { createAgentFromTemplate } from "./templateService";
import { toast } from "@/lib/toast-service";

interface UseTemplateButtonProps {
  templateId: string;
}

export function UseTemplateButton({ templateId }: UseTemplateButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);

  const handleUseTemplate = async () => {
    if (isLoading || isPending) return;
    setIsLoading(true);

    try {
      const made = await createAgentFromTemplate(templateId);
      if ("cancelled" in made) {
        setIsLoading(false); // the organization picker was closed: not now
        return;
      }
      if ("error" in made) throw new Error(made.error);
      const { agentId } = made;

      startTransition(() => {
        // agent-link-ok: instantiating a template creates a user agent owned by this user
        router.push(`/agents/${agentId}/build`);
      });
    } catch (error) {
      console.error("Error creating agent from template:", error);
      toast.error(error instanceof Error ? error.message : "The agent could not be created from this template.");
      setIsLoading(false);
    }
  };

  const busy = isLoading || isPending;

  return (
    <Button
      icon={busy ? (
        <Loader2 className="animate-spin" />
      ) : (
        <Copy />
      )}
      variant="primary"
      onClick={handleUseTemplate}
      disabled={busy}
    >
      {busy ? "Creating Agent..." : "Use This Template"}
    </Button>
  );
}
