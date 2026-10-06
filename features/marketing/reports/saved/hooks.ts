"use client";

// features/marketing/reports/saved/hooks.ts — the saved-reports reads as queries,
// and the two screen-run calls (templates, save) through `useToolAction`.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useToolAction } from "@ai-matrx/chat/action-requests/hooks/useToolAction";
import type { ToolEnvelope } from "@ai-matrx/chat/action-requests/screen-run";
import type { KnobScopeRef } from "@/lib/scoped-config/service";
import {
  fetchSavedSeoReports,
  fetchSeoReportVersions,
  fetchTemplateKnob,
} from "./service";
import { generateStateFromOutcome, refusalFrom, type GenerateState } from "./generate-outcome";
import {
  SEO_REPORT_TOOL,
  type SeoReportDraft,
  type SeoReportSaveData,
  type SeoReportSubject,
  type SeoReportTemplatesData,
} from "./types";

export const savedSeoReportsKey = (subject: SeoReportSubject | null) =>
  ["marketing", "seo-reports", "list", subject?.type ?? "all", subject?.id ?? "all"] as const;

export function useSavedSeoReports(subject: SeoReportSubject | null) {
  return useQuery({
    queryKey: savedSeoReportsKey(subject),
    queryFn: () => fetchSavedSeoReports({ subject }),
  });
}

export function useSeoReportVersions(sourceId: string | null) {
  return useQuery({
    queryKey: ["marketing", "seo-reports", "versions", sourceId],
    queryFn: () => fetchSeoReportVersions(sourceId as string),
    enabled: !!sourceId,
  });
}

export const templateKnobKey = (organizationId: string | null, scopes: KnobScopeRef[]) =>
  ["marketing", "seo-reports", "template-knob", organizationId, ...scopes.map((s) => `${s.kind}:${s.id}`)] as const;

export function useTemplateKnob(organizationId: string | null, scopes: KnobScopeRef[]) {
  return useQuery({
    queryKey: templateKnobKey(organizationId, scopes),
    queryFn: () => fetchTemplateKnob({ organizationId: organizationId as string, scopes }),
    enabled: !!organizationId,
  });
}

export type TemplatesState =
  | { kind: "loading" }
  | { kind: "ready"; data: SeoReportTemplatesData }
  | { kind: "error"; message: string };

/**
 * The templates this subject can use, from the `seo_report` tool's `templates`
 * action (free; `custom.doc_template` is not client-readable today).
 */
export function useSeoReportTemplates(subject: { site_id?: string; brand_id?: string }) {
  const tool = useToolAction<ToolEnvelope<SeoReportTemplatesData>>(SEO_REPORT_TOOL);
  const [state, setState] = useState<TemplatesState>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);
  const { run } = tool;
  const siteId = subject.site_id;
  const brandId = subject.brand_id;
  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    void run({
      action: "templates",
      ...(siteId ? { site_id: siteId } : {}),
      ...(brandId ? { brand_id: brandId } : {}),
    }).then((outcome) => {
      if (!live) return;
      if (outcome.status === "ok" && outcome.output?.data) {
        setState({ kind: "ready", data: outcome.output.data });
      } else if (outcome.status === "error") {
        setState({ kind: "error", message: outcome.error.message });
      } else {
        setState({ kind: "error", message: "The templates did not load." });
      }
    });
    return () => {
      live = false;
    };
  }, [run, siteId, brandId, nonce]);
  return { state, reload: () => setNonce((n) => n + 1) };
}

/** The Generate button's run: `seo_report save` through the screen-run door. */
export function useGenerateSeoReport() {
  const tool = useToolAction<ToolEnvelope<SeoReportSaveData>>(SEO_REPORT_TOOL);
  const queryClient = useQueryClient();
  const [state, setState] = useState<GenerateState>({ kind: "idle" });
  const generate = async (draft: SeoReportDraft) => {
    try {
      const outcome = await tool.run({ action: "save", ...draft });
      const next = generateStateFromOutcome(outcome);
      setState(next);
      if (next.kind === "saved") {
        await queryClient.invalidateQueries({ queryKey: ["marketing", "seo-reports"] });
      }
      return next;
    } catch (error) {
      const next = refusalFrom(error instanceof Error ? error.message : String(error), null);
      setState(next);
      return next;
    }
  };
  return { generate, state, running: tool.running, approvalDialog: tool.approvalDialog };
}
