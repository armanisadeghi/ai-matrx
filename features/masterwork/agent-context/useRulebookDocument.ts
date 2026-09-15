"use client";

/**
 * `useRulebookDocument` — load the Rulebook and render it as the bound
 * document variable, BEFORE the conversation is minted.
 *
 * 🚨 The whole point is the ordering: the panel does not render its launcher
 * until this resolves. Arman, 2026-08-19: *"this agent should never have even
 * started without getting the rules in place."* Every Rulebook-reading
 * conversational surface (the Scout, the Conductor, anything added later)
 * mounts this instead of loading the Rulebook its own way — one loader, one
 * refusal, one renderer.
 *
 * `error` is a REFUSAL, not a warning: a surface that gets one must not launch.
 * Disease D4, `common-docs/operations/agent-failure-diseases.md`.
 */

import { useCallback, useEffect, useState } from "react";
import { getRulebook } from "../service";
import { renderRulebookDocument } from "./rulebookDocument";

export interface RulebookDocumentState {
  /** The rendered Rulebook. Never an empty string once `loading` is false. */
  document: string | null;
  /**
   * The Rulebook's OWN tenancy. Surfaces that resolve a per-Rulebook setting
   * need it: a setting answered for a Rulebook must resolve in the tenancy the
   * Rulebook lives in, never in whichever organization the person last clicked
   * (organization is tenancy, never permission).
   */
  organizationId: string | null;
  loading: boolean;
  /** Set means REFUSE to launch — say this to the Expert and offer Retry. */
  error: string | null;
  reload: () => void;
}

export function useRulebookDocument(
  rulebookId: string | null | undefined,
): RulebookDocumentState {
  const [state, setState] = useState<{
    document: string | null;
    organizationId: string | null;
    loading: boolean;
    error: string | null;
  }>({ document: null, organizationId: null, loading: true, error: null });
  const [epoch, setEpoch] = useState(0);

  const reload = useCallback(() => setEpoch((n) => n + 1), []);

  useEffect(() => {
    if (!rulebookId) {
      setState({ document: null, organizationId: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    void (async () => {
      try {
        const rulebook = await getRulebook(rulebookId);
        if (cancelled) return;
        if (!rulebook) {
          setState({
            document: null,
            organizationId: null,
            loading: false,
            error:
              "We couldn't open this Rulebook, so there is nothing to work from. " +
              "Rather than starting the conversation without your rules, we've stopped.",
          });
          return;
        }
        setState({
          document: renderRulebookDocument(rulebook),
          organizationId: rulebook.organization_id ?? null,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          "[masterwork] REFUSING to start: the Rulebook could not be loaded, so " +
            "the agent's required `rulebook_document` variable cannot be bound.",
          { rulebookId, error: message },
        );
        setState({
          document: null,
          organizationId: null,
          loading: false,
          error:
            "We couldn't load your rules just now, so we've stopped rather than " +
            `starting without them (${message}).`,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rulebookId, epoch]);

  return { ...state, reload };
}
