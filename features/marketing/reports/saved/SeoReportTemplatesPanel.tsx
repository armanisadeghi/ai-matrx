"use client";

// features/marketing/reports/saved/SeoReportTemplatesPanel.tsx — which report
// template is active here (site, else brand, else organization, else the
// platform default) and a way to choose another at any of those rungs.
//
// The list comes from the `seo_report` tool's `templates` action; the active
// one is the knob `seo.report.template_id` as `knob_index` resolves it for this
// site and brand; a choice is written through the key's declared write door
// into the SITE'S organization (never the active organization).

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, LayoutTemplate } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  RegionSkeleton,
  SegmentedControl,
} from "@ai-matrx/design-system/controls";
import { InfoHint } from "@/components/official/InfoHint";
import { knobRefusalSentence } from "@/lib/scoped-config/service";
import { extractErrorMessage } from "@/utils/errors";
import { chooseSeoReportTemplate, type TemplateRung } from "./service";
import { useSeoReportTemplates, useTemplateKnob } from "./hooks";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const RUNG_LABEL: Record<string, string> = {
  site: "Site",
  brand: "Brand",
  organization: "Organization",
  platform_default: "Platform default",
};

export function SeoReportTemplatesPanel({
  organizationId,
  siteId,
  brandId,
}: {
  organizationId: string;
  siteId: string;
  brandId: string | null;
}) {
  const queryClient = useQueryClient();
  const scopes = [
    ...(brandId ? [{ kind: "brand" as const, id: brandId }] : []),
    { kind: "site" as const, id: siteId },
  ];
  const knob = useTemplateKnob(organizationId, scopes);
  const { state, reload } = useSeoReportTemplates({ site_id: siteId });
  const [rung, setRung] = useState<TemplateRung>("site");
  const [pending, setPending] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const activeId =
    typeof knob.data?.effective_value === "string" ? knob.data.effective_value : null;
  const origin = knob.data?.origin ?? null;

  const scopeIdFor = (r: TemplateRung): string | null =>
    r === "site" ? siteId : r === "brand" ? brandId : organizationId;

  const choose = async (templateId: string) => {
    const scopeId = scopeIdFor(rung);
    if (!scopeId) return;
    setPending(templateId);
    setRefusal(null);
    try {
      const result = await chooseSeoReportTemplate({ organizationId, rung, scopeId, templateId });
      if (!result.ok) setRefusal(knobRefusalSentence(result));
      await queryClient.invalidateQueries({ queryKey: ["marketing", "seo-reports", "template-knob"] });
      reload();
    } catch (error) {
      setRefusal(extractErrorMessage(error));
    } finally {
      setPending(null);
    }
  };

  return (
    <section aria-label="Report templates" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Templates</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Set for</span>
          <SegmentedControl<TemplateRung>
            aria-label="Set the template for"
            value={rung}
            onValueChange={setRung}
            data={[
              { value: "site", label: "Site" },
              { value: "brand", label: "Brand", disabled: !brandId },
              { value: "organization", label: "Organization" },
            ]}
          />
        </div>
      </div>
      {refusal ? (
        <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
          <span className="truncate">Not changed</span>
          <InfoHint text={refusal.slice(0, 140)} label="Why it was not changed" />
        <ErrorAlchemyMenu /></p>
      ) : null}
      {state.kind === "loading" || knob.isLoading ? (
        <RegionSkeleton shape="rows" count={2} aria-label="Loading templates" />
      ) : state.kind === "error" ? (
        <p role="alert" className="text-xs text-destructive">{state.message.slice(0, 140)}<ErrorAlchemyMenu /></p>
      ) : state.data.templates.length === 0 ? (
        <EmptyState icon={<LayoutTemplate />} title="No report templates" />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {state.data.templates.map((template) => {
            const active = template.template_id === (activeId ?? state.data.selected_template_id);
            return (
              <li key={template.template_id} className="flex items-center gap-3 px-3 py-2">
                <LayoutTemplate className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {template.name ?? "Untitled template"}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">v{template.version}</span>
                {template.platform_default ? <Badge>Platform</Badge> : <Badge>Organization</Badge>}
                {active ? (
                  <Badge tone="success" data-testid="active-template">
                    Active · {RUNG_LABEL[origin ?? "platform_default"] ?? "Platform default"}
                  </Badge>
                ) : null}
                <Button
                  variant="outline"
                  icon={<Check />}
                  disabled={pending !== null || (active && origin === rung)}
                  onClick={() => void choose(template.template_id)}
                >
                  {pending === template.template_id ? "Saving…" : `Use for ${RUNG_LABEL[rung].toLowerCase()}`}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
