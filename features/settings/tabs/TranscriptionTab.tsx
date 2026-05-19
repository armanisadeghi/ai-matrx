"use client";

import { useEffect, useMemo, useState } from "react";
import { Mic } from "lucide-react";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsTextarea } from "@/components/official/settings/primitives/SettingsTextarea";
import { useSetting } from "../hooks/useSetting";
import type { CustomCleanerAgent } from "@/lib/redux/preferences/userPreferencesSlice";

const PLACEHOLDER = `[
  {
    "id": "00000000-0000-0000-0000-000000000000",
    "displayName": "My Custom Cleaner",
    "transcriptVariableKey": "transcribed_text",
    "contextVariableKey": "context"
  }
]`;

function isValidEntry(value: unknown): value is CustomCleanerAgent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.displayName === "string" &&
    v.displayName.length > 0 &&
    typeof v.transcriptVariableKey === "string" &&
    v.transcriptVariableKey.length > 0 &&
    (v.contextSlotKey === undefined || typeof v.contextSlotKey === "string") &&
    (v.contextVariableKey === undefined ||
      typeof v.contextVariableKey === "string")
  );
}

export default function TranscriptionTab() {
  const [agents, setAgents] = useSetting<CustomCleanerAgent[]>(
    "userPreferences.transcription.customCleanerAgents",
  );

  const initialJson = useMemo(
    () => (agents.length === 0 ? "" : JSON.stringify(agents, null, 2)),
    // Only seed once on mount; subsequent edits live in `draft`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [draft, setDraft] = useState(initialJson);

  // Re-seed if the persisted value changes from elsewhere (e.g. another tab).
  useEffect(() => {
    const next = agents.length === 0 ? "" : JSON.stringify(agents, null, 2);
    setDraft((current) => {
      try {
        const parsed = JSON.parse(current || "[]");
        if (JSON.stringify(parsed) === JSON.stringify(agents)) return current;
      } catch {
        /* fall through to overwrite */
      }
      return next;
    });
  }, [agents]);

  const trimmed = draft.trim();
  const parseResult = useMemo<
    { ok: true; entries: CustomCleanerAgent[] } | { ok: false; error: string }
  >(() => {
    if (!trimmed) return { ok: true, entries: [] };
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Invalid JSON",
      };
    }
    if (!Array.isArray(parsed))
      return { ok: false, error: "Top level must be an array." };
    const entries: CustomCleanerAgent[] = [];
    for (let i = 0; i < parsed.length; i++) {
      if (!isValidEntry(parsed[i])) {
        return {
          ok: false,
          error: `Entry ${i + 1} is missing a required field (id, displayName, transcriptVariableKey).`,
        };
      }
      entries.push(parsed[i]);
    }
    return { ok: true, entries };
  }, [trimmed]);

  const dirty =
    parseResult.ok &&
    JSON.stringify(parseResult.entries) !== JSON.stringify(agents);

  // Auto-save when the JSON is valid AND differs from the persisted value.
  useEffect(() => {
    if (parseResult.ok && dirty) {
      setAgents(parseResult.entries);
    }
  }, [parseResult, dirty, setAgents]);

  const description = parseResult.ok
    ? `${parseResult.entries.length} valid entr${parseResult.entries.length === 1 ? "y" : "ies"}.`
    : undefined;
  const errorMessage = parseResult.ok
    ? undefined
    : (parseResult as { ok: false; error: string }).error;

  return (
    <>
      <SettingsSubHeader
        title="Transcription cleaners"
        description="Custom AI agents that appear in the Transcription Cleanup window's agent picker, alongside the built-in system cleaners."
        icon={Mic}
      />

      <SettingsCallout tone="info" title="How this works">
        Each entry must reference an existing agent UUID and declare which
        variable key on that agent should receive the transcribed text. If the
        agent uses a context slot for free-form context, set{" "}
        <code className="font-mono">contextSlotKey</code>; if it consumes
        context as a regular variable instead, set{" "}
        <code className="font-mono">contextVariableKey</code>. Invalid JSON or
        missing fields are flagged below and won't be saved.
      </SettingsCallout>

      <SettingsSection title="Custom cleaner agents (JSON)">
        <SettingsTextarea
          label="Entries"
          description={description}
          error={errorMessage}
          value={draft}
          onValueChange={setDraft}
          placeholder={PLACEHOLDER}
          rows={12}
          last
        />
      </SettingsSection>
    </>
  );
}
