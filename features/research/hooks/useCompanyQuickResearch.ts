"use client";

/**
 * ONE-CALL company research — the headless version of the /research/topics/new
 * wizard, for surfaces (e.g. content-plan Setup) that need a finished research
 * report without leaving their screen:
 *
 *   create topic (system "Company Research" template) → seed its template
 *   keywords → run the full pipeline (search → scrape → analyze → synthesize)
 *   → assemble the final Document.
 *
 * Composes ONLY existing public capabilities: `createTopic` / `addKeywords` /
 * `getTemplates` (Supabase-direct CRUD) and `useResearchApi().runPipeline` /
 * `.generateDocument` (the paid Python pipeline). Nothing here is a second
 * write path.
 *
 * MONEY: a run is a full multi-stage pipeline (tens of AI calls). Callers MUST
 * get an explicit user confirm before calling `run` — this hook never
 * self-triggers. The pipeline streams NDJSON; both paid steps are DRAINED to
 * completion so "document assembled" is a fact, not an acceptance. If the user
 * navigates away mid-run the server keeps working (a disconnect never cancels
 * server work) but the document-assembly chain in this tab dies — the topic
 * page in /research can finish it manually.
 */
import { useRef, useState } from "react";

import { addKeywords, createTopic, getTemplates } from "../service";
import type { ResearchTopic } from "../types";
import { useResearchApi } from "./useResearchApi";

/** System template "Company Research" (`research.rs_template`, `is_system`). */
export const COMPANY_RESEARCH_TEMPLATE_ID =
  "dd53f982-a851-4701-9368-505982260271";

/** Used only if the template row carries no keyword patterns. */
const FALLBACK_KEYWORD_PATTERNS = [
  "${name}",
  "${name} reviews",
  "${name} services",
];

export type QuickResearchStage =
  | "idle"
  | "creating"
  | "running"
  | "assembling"
  | "done"
  | "error";

export interface CompanyQuickResearchInput {
  /** Tenancy for the topic — usually the owning record's org (e.g. the site's). */
  organizationId: string;
  companyName: string;
  /** Site/root URL — becomes the description note and one search keyword. */
  websiteUrl?: string | null;
  /** Fires the moment the topic row exists, before any paid work. */
  onTopicCreated?: (topic: ResearchTopic) => void;
  /**
   * Live progress line for host UIs — REAL events parsed off the pipeline's
   * NDJSON stream (deduped, noise filtered), plus the stage transitions.
   */
  onProgress?: (message: string) => void;
}

/** Stream events too chatty or too raw to show a human. */
const NOISY_EVENTS = new Set(["chunk", "heartbeat", "ping", "token"]);

/** One NDJSON line → a short human label, or null to skip. */
function describeStreamEvent(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;
  const event = typeof row.event === "string" ? row.event : null;
  if (event && NOISY_EVENTS.has(event)) return null;
  const data =
    row.data && typeof row.data === "object" && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : null;
  for (const key of ["message", "status", "stage", "type"]) {
    const value = data?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.replaceAll("_", " ").trim();
    }
  }
  if (event && event !== "data") return event.replaceAll("_", " ");
  return null;
}

export function useCompanyQuickResearch() {
  const api = useResearchApi();
  const [stage, setStage] = useState<QuickResearchStage>("idle");
  const [topic, setTopic] = useState<ResearchTopic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  /**
   * Reject non-2xx loudly, then read the NDJSON stream to its END — surfacing
   * each parseable event as a live progress label (consecutive dupes dropped).
   */
  async function drain(
    response: Response,
    what: string,
    onProgress?: (message: string) => void,
  ): Promise<void> {
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `${what} failed (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`,
      );
    }
    const reader = response.body?.getReader();
    if (!reader) {
      await response.text();
      return;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let lastLabel: string | null = null;
    const emit = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const label = describeStreamEvent(JSON.parse(trimmed));
        if (label && label !== lastLabel) {
          lastLabel = label;
          onProgress?.(label);
        }
      } catch {
        // Partial or non-JSON line — progress display only, never fatal.
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) emit(line);
    }
    emit(buffer);
  }

  /** Resolves when the final Document is assembled. Throws loudly on any step. */
  async function run(input: CompanyQuickResearchInput): Promise<ResearchTopic> {
    if (busyRef.current) {
      throw new Error("A company research run is already in progress");
    }
    busyRef.current = true;
    setStage("creating");
    setTopic(null);
    setError(null);
    try {
      const name = input.companyName.trim();
      if (!name) throw new Error("Company name is required");
      input.onProgress?.(`Creating the research topic for ${name}…`);
      const website = input.websiteUrl?.trim() || null;
      const { topic: created } = await createTopic(input.organizationId, {
        name,
        description: [
          `Company research for ${name}.`,
          website ? `Website: ${website}` : null,
        ]
          .filter(Boolean)
          .join(" "),
        autonomy_level: "auto",
        template_id: COMPANY_RESEARCH_TEMPLATE_ID,
      });
      setTopic(created);
      input.onTopicCreated?.(created);

      // Keywords come from the template's `${name}` patterns — deterministic,
      // instant, no extra AI spend (the wizard's template path does the same).
      const template = (await getTemplates()).find(
        (row) => row.id === COMPANY_RESEARCH_TEMPLATE_ID,
      );
      const patterns = Array.isArray(template?.keyword_templates)
        ? template.keyword_templates.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0,
          )
        : [];
      const keywords = (
        patterns.length > 0 ? patterns : FALLBACK_KEYWORD_PATTERNS
      ).map((pattern) => pattern.replaceAll("${name}", name));
      if (website) keywords.push(website);
      await addKeywords(created.id, { keywords });

      setStage("running");
      input.onProgress?.(
        "Researching — search, scrape, analyze, synthesize…",
      );
      // Org asserted from the TOPIC row — the backend reloads it as authority.
      await drain(
        await api.runPipeline(created.id, created.organization_id),
        "Research run",
        input.onProgress,
      );

      setStage("assembling");
      input.onProgress?.("Assembling the final research report…");
      await drain(
        await api.generateDocument(created.id),
        "Document assembly",
        input.onProgress,
      );

      setStage("done");
      return created;
    } catch (caught) {
      setStage("error");
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      busyRef.current = false;
    }
  }

  return { stage, topic, error, run };
}
