"use client";

import { useState } from "react";
import { BrainCircuit } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { openLiveRunWindowAction } from "@/features/overlays/openers/liveRunWindow";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

/** Mandate key — which agent runs is DB-bound, never coded here. */
const ENDOWMENT_ANALYSIS_MANDATE = "marketing.endowment_analysis";

/**
 * The Endowment Model, live (common-docs/systems/local-listings/ENDOWMENTS.md):
 * give the analyst a company/industry and it streams a ranked authority
 * portfolio across the nine endowments into the floating run window.
 */
export function EndowmentAnalysisCard({
  defaultCompany,
  defaultIndustry,
  brandId,
}: {
  defaultCompany?: string;
  defaultIndustry?: string;
  brandId: string;
}) {
  const dispatch = useAppDispatch();
  const [company, setCompany] = useState(defaultCompany ?? "");
  const [industry, setIndustry] = useState(defaultIndustry ?? "");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    if (!company.trim() && !industry.trim()) {
      toast.info("Give the analyst a company name or an industry to work with.");
      return;
    }
    setRunning(true);
    try {
      const launch = await dispatch(
        launchAgentExecution({
          mandateKey: ENDOWMENT_ANALYSIS_MANDATE,
          surfaceKey: `marketing-local:endowment:${brandId}`,
          sourceFeature: "marketing",
          isEphemeral: false,
          runtime: {
            variables: {
              company_name: company.trim(),
              industry: industry.trim(),
              location: location.trim(),
              context_notes: notes.trim(),
            },
          },
          config: { autoRun: false, displayMode: "direct" },
        }),
      ).unwrap();
      dispatch(
        setUserInputText({
          conversationId: launch.conversationId,
          text: "Analyze this business's endowments and produce the ranked authority portfolio.",
        }),
      );
      dispatch(
        openLiveRunWindowAction({
          instanceId: `endowment:${brandId}`,
          conversationId: launch.conversationId,
          label: `Endowment analysis — ${company.trim() || industry.trim()}`,
        }),
      );
      await dispatch(executeInstance({ conversationId: launch.conversationId })).unwrap();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The endowment analysis failed to start.",
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <SectionCard
      title="Endowment analysis"
      anchor="local-endowment-analysis"
      headerExtra={
        <Button
          size="sm"
          className="h-7 gap-1 px-3 text-xs"
          onClick={() => void handleRun()}
          disabled={running}
        >
          <BrainCircuit className="size-3.5" aria-hidden />
          {running ? "Analyzing…" : "Analyze"}
        </Button>
      }
    >
      <p className="mb-2 text-xs text-muted-foreground">
        Every business already owns assets some publishing ecosystem wants — data, expertise,
        media, processes, people, place, capital, hiring, and code. The analyst maps all nine to
        concrete artifacts and the platforms that distribute them, then asks which registry this
        business could operate itself.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Company</Label>
          <Input
            className="h-8 text-sm"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            placeholder="e.g. All Green Electronics Recycling"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Industry</Label>
          <Input
            className="h-8 text-sm"
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            placeholder="e.g. electronics recycling / ITAD"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Location (optional)</Label>
          <Input
            className="h-8 text-sm"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="City / region — drives the place and capital endowments"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">What you know (optional)</Label>
          <Textarea
            rows={1}
            className="min-h-8 text-sm"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Certifications held, services, size, existing assets…"
          />
        </div>
      </div>
    </SectionCard>
  );
}
