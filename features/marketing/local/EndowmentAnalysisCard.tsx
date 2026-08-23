"use client";

import { useState } from "react";
import { BrainCircuit, ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { launchFailureMessage } from "@/features/agents/redux/execution-system/utils/launch-failure-message";
import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import { useOpenLiveRunWindow } from "@/features/overlays/openers/liveRunWindow";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { EndowmentPortfolioPanel } from "@/features/marketing/local/EndowmentPortfolioPanel";
import {
  ENDOWMENT_ANALYSIS_MANDATE,
  ENDOWMENT_PORTFOLIO_MANDATE,
  coerceEndowmentPortfolio,
  type EndowmentPortfolio,
} from "@/features/marketing/local/endowment-portfolio";

/**
 * The Endowment Model, live (common-docs/systems/marketing/local-listings/ENDOWMENTS.md).
 *
 * TWO companion paths off ONE set of inputs, both DB-bound Mandates:
 *
 * - **Read the analysis** (`marketing.endowment_analysis`) — the narrative pass,
 *   streamed into the floating run window. Judgment a person reads.
 * - **Build the portfolio** (`marketing.endowment_portfolio`) — the structured
 *   pass, streamed inline and then rendered as WORK: every platform can be
 *   added to `web.listing_publisher` (the WS7 intake contract) and every
 *   artifact can be queued as a tracked task against the brand.
 */
export function EndowmentAnalysisCard({
  defaultCompany,
  defaultIndustry,
  brandId,
  organizationId,
}: {
  defaultCompany?: string;
  defaultIndustry?: string;
  brandId: string;
  /** The brand's org — artifact tasks belong to it, not the ambient active org. */
  organizationId: string;
}) {
  const dispatch = useAppDispatch();
  const openLiveRun = useOpenLiveRunWindow();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const portfolioRun = useLiveAgentRun();
  const [company, setCompany] = useState(defaultCompany ?? "");
  const [industry, setIndustry] = useState(defaultIndustry ?? "");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [running, setRunning] = useState(false);
  const [portfolio, setPortfolio] = useState<EndowmentPortfolio | null>(null);

  /** The one input set both Mandates consume (provision `marketing.local_endowment`). */
  const variables = () => ({
    company_name: company.trim(),
    industry: industry.trim(),
    location: location.trim(),
    context_notes: notes.trim(),
  });

  const hasSubject = () => {
    if (company.trim() || industry.trim()) return true;
    toast.info("Give the analyst a company name or an industry to work with.");
    return false;
  };

  const handleAnalyze = async () => {
    if (!hasSubject()) return;
    setRunning(true);
    const handle = openLiveRun({
      instanceId: `endowment:${brandId}`,
      label: `Endowment analysis — ${company.trim() || industry.trim()}`,
      pending: true,
    });
    try {
      await dispatch(
        launchAgentExecution({
          mandateKey: ENDOWMENT_ANALYSIS_MANDATE,
          surfaceKey: `marketing-local:endowment:${brandId}`,
          sourceFeature: "marketing",
          isEphemeral: false,
          runtime: { variables: variables() },
          config: { autoRun: true, displayMode: "direct" },
          onConversationCreated: (conversationId) =>
            handle.update({ conversationId, pending: false }),
        }),
      ).unwrap();
    } catch (error) {
      handle.close();
      toast.error(
        launchFailureMessage(error, "The endowment analysis failed to start."),
      );
    } finally {
      setRunning(false);
    }
  };

  const handleBuildPortfolio = async () => {
    if (!hasSubject()) return;
    setPortfolio(null);
    try {
      const result = await portfolioRun.run<EndowmentPortfolio>({
        mandateKey: ENDOWMENT_PORTFOLIO_MANDATE,
        surfaceKey: `marketing-local:endowment-portfolio:${brandId}`,
        sourceFeature: "marketing",
        organizationId,
        contextAnchor: { resource_type: "brand", resource_id: brandId },
        variables: variables(),
        expect: "json",
        timeoutMs: 300_000,
        coerce: (value) => coerceEndowmentPortfolio(value),
      });
      setPortfolio(result);
    } catch (error) {
      toast.error(
        launchFailureMessage(error, "The portfolio builder failed."),
      );
    }
  };

  const subject = company.trim() || industry.trim();

  return (
    <SectionCard
      title="Endowment analysis"
      anchor="local-endowment-analysis"
      headerExtra={
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-3 text-xs"
            onClick={() => void handleAnalyze()}
            disabled={running}
          >
            <BrainCircuit className="size-3.5" aria-hidden />
            {running ? "Analyzing…" : "Read the analysis"}
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 px-3 text-xs"
            onClick={() => void handleBuildPortfolio()}
            disabled={portfolioRun.isRunning}
          >
            <ListChecks className="size-3.5" aria-hidden />
            {portfolioRun.isRunning ? "Building…" : "Build portfolio"}
          </Button>
        </div>
      }
    >
      <p className="mb-2 text-xs text-muted-foreground">
        Every business already owns assets some publishing ecosystem wants — data, expertise,
        media, processes, people, place, capital, hiring, and code. The analyst maps all nine to
        concrete artifacts and the platforms that distribute them, then asks which registry this
        business could operate itself. <strong className="font-medium">Build portfolio</strong>{" "}
        returns the same judgment as actionable rows: add a platform to the publisher registry,
        queue an artifact as a task.
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

      {/* No spinner while AI works: the structured run streams here until it resolves. */}
      {portfolioRun.hasLiveRun && !portfolio ? (
        <LiveRunDisplay
          className="mt-3"
          conversationId={portfolioRun.conversationId}
          label={`Building the portfolio — ${subject}`}
          pending={portfolioRun.isRunning}
          onDismiss={portfolioRun.dismiss}
        />
      ) : null}

      {portfolio ? (
        <div className="mt-3">
          <EndowmentPortfolioPanel
            portfolio={portfolio}
            brandId={brandId}
            brandLabel={subject}
            surfaceUrl={`/marketing/local?brand=${brandId}#local-endowment-analysis`}
            organizationId={organizationId}
            canWriteRegistry={isSuperAdmin}
          />
        </div>
      ) : null}
    </SectionCard>
  );
}
