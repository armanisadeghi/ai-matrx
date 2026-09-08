"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Copy, Loader2 } from "lucide-react";
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
      const response = await fetch(`/api/agents/templates/${templateId}/use`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to use template");
      }

      const { agentId } = await response.json();

      startTransition(() => {
        // agent-link-ok: instantiating a template creates a user agent owned by this user
        router.push(`/agents/${agentId}/build`);
      });
    } catch (error) {
      console.error("Error creating agent from template:", error);
      toast.error("Failed to create agent from template. Please try again.");
      setIsLoading(false);
    }
  };

  const busy = isLoading || isPending;

  return (
    <Button
      className="bg-success hover:bg-success/90"
      onClick={handleUseTemplate}
      disabled={busy}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Copy className="h-4 w-4 mr-2" />
      )}
      {busy ? "Creating Agent..." : "Use This Template"}
    </Button>
  );
}
