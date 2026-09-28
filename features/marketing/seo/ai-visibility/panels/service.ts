// features/marketing/seo/ai-visibility/panels/service.ts
//
// AI-visibility panels (WP4 build step 5) — reads only, direct to Supabase.
//
// A panel is a saved set of buyer questions asked on a cadence. The SERVER owns
// every write and every provider call (`aidream/services/seo/ai_visibility_panel.py`,
// scheduled daily, priced before it spends); this client only ever selects.
//
// THE TREND IS A ROLLUP, NOT A STORED SERIES. `seo.ai_visibility_response` rows
// are already timestamped and already carry `target_mentioned` / `target_cited`
// / the answer text, so presence over time is derived from the rows themselves —
// the same shape as coverage's share-of-voice (D-W4-14), and for the same
// reason: a stored trend can disagree with the answers beneath it, and the day
// it does, neither number is believable again.
//
// 🚨 NO POOLED HEADLINE. The old "named in X% of answers, up N points" mixed
// questions that contain the brand with questions that don't, across every
// engine, and called a first-vs-last bucket difference a trend. It is gone
// (brief: "Six named metrics replace the pooled headline"); the six named
// metrics come from the server (`panel-api.ts` → `/metrics`). What stays here
// is per-question and per-message COUNTS — never a pooled rate.
//
// 🚨 NULL IS UNMEASURED, NEVER ZERO. A prompt no engine has answered has no
// presence rate — it does not have a rate of 0%. Every function here returns
// null for an empty denominator, and no caller may coalesce that to a zero.

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import type { Database } from "@/types/database.types";

export type AiVisibilityPanelRow =
  Database["seo"]["Tables"]["ai_visibility_panel"]["Row"];

/** How far back a panel trend looks by default. */
export const PANEL_TREND_DAYS = 90;
/** Hard ceiling on answer rows read for one trend. */
const MAX_TREND_ROWS = 2000;

export interface PanelPrompt {
  key: string;
  text: string;
  intent?: string | null;
}

export interface PanelKeyMessage {
  key: string;
  label: string;
  terms: string[];
}

export interface PanelAnswer {
  id: string;
  query: string;
  engine: string;
  observedAt: string;
  mentioned: boolean;
  cited: boolean;
  answerText: string;
}

export interface PromptStanding {
  key: string;
  text: string;
  enginesMentioning: string[];
  enginesAbsent: string[];
  /** Engines the panel asks that have never answered this question. */
  enginesUnmeasured: string[];
  lastMeasuredAt: string | null;
  responseIds: string[];
  verdict: string;
}

export interface MessageStanding {
  key: string;
  label: string;
  answers: number;
  presentIn: number;
  verdict: string;
}

export interface PanelTrend {
  answers: number;
  prompts: PromptStanding[];
  messages: MessageStanding[];
}

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message.",
  );
}

/** The org's saved panels for one site. */
export async function listSitePanels(
  siteId: string,
): Promise<AiVisibilityPanelRow[]> {
  await requireAuthenticatedSupabaseSession(supabase);
  const { data, error } = await supabase
    .schema("seo")
    .from("ai_visibility_panel")
    .select("*")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw pgError(error);
  return (data ?? []) as AiVisibilityPanelRow[];
}

export function panelPrompts(row: AiVisibilityPanelRow): PanelPrompt[] {
  const raw = row.prompts;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) =>
    item && typeof item === "object" && typeof (item as PanelPrompt).text === "string"
      ? [item as unknown as PanelPrompt]
      : [],
  );
}

export function panelKeyMessages(row: AiVisibilityPanelRow): PanelKeyMessage[] {
  const raw = row.key_messages;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) =>
    item && typeof item === "object" && Array.isArray((item as PanelKeyMessage).terms)
      ? [item as unknown as PanelKeyMessage]
      : [],
  );
}

/**
 * Does this answer carry the message? Deterministic, on word boundaries — the
 * same rule the server applies (`matrx_seo.ai_visibility_panel.message_presence`),
 * so a user reading the trend here and an API consumer reading it there see the
 * same verdict on the same text.
 */
function messagePresent(answerText: string, message: PanelKeyMessage): boolean {
  return message.terms.some((term) => {
    const cleaned = term.trim();
    if (!cleaned) return false;
    const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<!\\w)${escaped}(?!\\w)`, "i").test(answerText);
  });
}

/**
 * Every answer this panel's questions have collected, newest first.
 *
 * Identity is the prompt TEXT per site — an ad-hoc run of the same question is
 * the same measurement, not pollution, so nothing filters on which panel
 * triggered a row (and no panel id is stamped on one).
 */
export async function fetchPanelAnswers(
  row: AiVisibilityPanelRow,
  days = PANEL_TREND_DAYS,
): Promise<PanelAnswer[]> {
  const prompts = panelPrompts(row);
  if (prompts.length === 0) return [];
  await requireAuthenticatedSupabaseSession(supabase);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .schema("seo")
    .from("ai_visibility_response")
    .select("id,query,engine,observed_at,target_mentioned,target_cited,answer_text")
    .eq("site_id", row.site_id)
    .in(
      "query",
      prompts.map((prompt) => prompt.text),
    )
    .gte("observed_at", since)
    .order("observed_at", { ascending: false })
    .limit(MAX_TREND_ROWS);
  if (error) throw pgError(error);
  return (data ?? []).map((item) => ({
    id: String(item.id),
    query: String(item.query),
    engine: String(item.engine),
    observedAt: String(item.observed_at),
    mentioned: Boolean(item.target_mentioned),
    cited: Boolean(item.target_cited),
    answerText: String(item.answer_text ?? ""),
  }));
}

export function buildPanelTrend(
  row: AiVisibilityPanelRow,
  answers: PanelAnswer[],
): PanelTrend {
  const prompts = panelPrompts(row);
  const messages = panelKeyMessages(row);
  const engines = (row.engines ?? []).map(String);
  const keyByText = new Map(prompts.map((prompt) => [prompt.text, prompt.key]));

  // prompt key → engine → newest answer (the list arrives newest first).
  const latest = new Map<string, Map<string, PanelAnswer>>();
  for (const answer of answers) {
    const key = keyByText.get(answer.query);
    if (!key) continue;
    const perEngine = latest.get(key) ?? new Map<string, PanelAnswer>();
    if (!perEngine.has(answer.engine)) perEngine.set(answer.engine, answer);
    latest.set(key, perEngine);
  }

  const standings: PromptStanding[] = prompts.map((prompt) => {
    const perEngine = latest.get(prompt.key) ?? new Map<string, PanelAnswer>();
    const mentioning: string[] = [];
    const absent: string[] = [];
    for (const [engine, answer] of perEngine) {
      (answer.mentioned ? mentioning : absent).push(engine);
    }
    const unmeasured = engines.filter((engine) => !perEngine.has(engine));
    const moments = [...perEngine.values()].map((answer) => answer.observedAt);
    return {
      key: prompt.key,
      text: prompt.text,
      enginesMentioning: mentioning.sort(),
      enginesAbsent: absent.sort(),
      enginesUnmeasured: unmeasured.sort(),
      lastMeasuredAt: moments.sort().at(-1) ?? null,
      responseIds: [...perEngine.values()].map((answer) => answer.id),
      verdict: promptVerdict(mentioning, absent, unmeasured),
    };
  });

  const messageStandings: MessageStanding[] = messages.map((message) => {
    const presentIn = answers.filter((answer) =>
      messagePresent(answer.answerText, message),
    ).length;
    return {
      key: message.key,
      label: message.label,
      answers: answers.length,
      presentIn,
      verdict:
        answers.length === 0
          ? `“${message.label}” has not been measured yet.`
          : presentIn === 0
            ? `No assistant repeated “${message.label}” in ${answers.length} answer(s).`
            : `“${message.label}” came through in ${presentIn} of ${answers.length} answer(s).`,
    };
  });

  return {
    answers: answers.length,
    prompts: standings,
    messages: messageStandings,
  };
}

function promptVerdict(
  mentioning: string[],
  absent: string[],
  unmeasured: string[],
): string {
  if (mentioning.length === 0 && absent.length === 0) {
    return "We have not asked this question yet.";
  }
  if (absent.length === 0) {
    return `Every engine we asked names you (${mentioning.length}).`;
  }
  if (mentioning.length === 0) {
    return `None of the ${absent.length} engine(s) we asked mentioned you here.`;
  }
  const tail = unmeasured.length
    ? ` ${unmeasured.length} engine(s) have not been asked.`
    : "";
  return `${mentioning.length} of ${mentioning.length + absent.length} engine(s) name you — missing from ${absent.join(", ")}.${tail}`;
}
