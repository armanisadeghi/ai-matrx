"use client";

/**
 * THE MANDATE INPUT SURFACE — served by the server, never derived here.
 *
 * WHAT THIS FIXES (2026-08-31, found live by Arman). A mandate he authored at
 * `/administration/mandates/new` — five described inputs, a goal, an output
 * kind, an agent bound and mapped — still read "user text only" everywhere,
 * and its run form offered one anonymous text box. Every reader in this repo
 * derived the input contract from the two things only CODE can declare: a
 * Provision, or the promoted `required_variables` columns. A human-authored
 * mandate has neither, so the answer was always "nothing". Meanwhile the
 * mandate's own `draft_inputs` and the bound Holder's declared variables sat
 * unread. That is the intelligence-first half of THE MODEL
 * (`common-docs/systems/mandates/THE-MODEL.md`) unwired at run time.
 *
 * The bridge is SERVER-SIDE, per INPUT-SURFACE.md
 * (`common-docs/systems/workflows/INPUT-SURFACE.md`): one declared surface,
 * four consumers, addressed identically. `GET /mandates/{key}/input-surface`
 * answers with `ServedInput`-shaped entries — the SAME shape
 * `GET /workflows/{id}/run-form` serves — so this module reuses
 * `parseServedInput` and adds no second parser.
 *
 * 🚨 NEVER re-derive a surface here. If the server cannot answer, this hook
 * says so; it does not fall back to guessing from the mandate row, which is
 * exactly the derivation that produced the lie.
 */

import { useEffect, useState } from "react";

import { callApi } from "@/lib/api/call-api";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrgBootstrapResolved,
} from "@/lib/redux/slices/appContextSlice";
import {
  parseServedInput,
  type ServedInput,
} from "@/features/workflow-runtime/served-form/served-input";

/** Where the served declaration came from. `none` is the ONLY value that
 * licenses the words "user text only". */
export type MandateSurfaceSource =
  | "provision"
  | "mandate_inputs"
  | "holder"
  | "none";

export interface MandateInputSurface {
  mandateKey: string;
  provisionKey: string | null;
  surfaceSource: MandateSurfaceSource;
  /** The agent (or holder) whose declarations informed the surface. */
  holderName: string | null;
  acceptsUserInput: boolean;
  inputs: ServedInput[];
  /** What the server could not read, in words. Never empty-and-silent. */
  notes: string[];
}

export type MandateInputSurfaceState =
  | { status: "loading" }
  | { status: "ready"; surface: MandateInputSurface }
  | { status: "error"; message: string };

const SOURCES: ReadonlySet<string> = new Set([
  "provision",
  "mandate_inputs",
  "holder",
  "none",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse the served payload. Pure — unit-testable without a browser. */
export function parseMandateInputSurface(
  raw: unknown,
  mandateKey: string,
): MandateInputSurface {
  const record = isRecord(raw) ? raw : {};
  const inputs = Array.isArray(record.inputs)
    ? record.inputs
        .map((entry) => parseServedInput(entry))
        .filter((entry): entry is ServedInput => entry !== null)
    : [];
  const source =
    typeof record.surface_source === "string" &&
    SOURCES.has(record.surface_source)
      ? (record.surface_source as MandateSurfaceSource)
      : "none";
  return {
    mandateKey:
      typeof record.mandate_key === "string" ? record.mandate_key : mandateKey,
    provisionKey:
      typeof record.provision_key === "string" ? record.provision_key : null,
    // A surface that served entries is never "none", whatever the label says —
    // the two can only disagree through version skew, and the entries are the
    // thing a person can actually see.
    surfaceSource: inputs.length > 0 && source === "none" ? "holder" : source,
    holderName:
      typeof record.holder_name === "string" ? record.holder_name : null,
    acceptsUserInput: record.accepts_user_input === true,
    inputs,
    notes: Array.isArray(record.notes)
      ? record.notes.filter((note): note is string => typeof note === "string")
      : [],
  };
}

/**
 * THE ONE RULE for the phrase "user text only", and the reason this helper
 * exists rather than each caller re-deciding: it is true when the server
 * served no input AND had nothing it failed to read. A surface that served
 * nothing but carries notes is a surface that BROKE — say the notes.
 */
export function isUserTextOnly(surface: MandateInputSurface): boolean {
  return surface.inputs.length === 0 && surface.notes.length === 0;
}

/**
 * 🚨 THE ONE SENTENCE ABOUT FREE USER TEXT — every host renders THIS, from
 * THIS authority (V2-2, walked on production 2026-08-31).
 *
 * Two screens used to answer the same question about the same mandate in the
 * same minute, in opposite directions: the user host printed a hardcoded
 * "Free text from the caller is accepted (platform default)." that asked
 * nothing, and the admin panel printed "This Mandate forbids user text" from
 * `code_truth.passes_user_input` — a fact about what the CALLING CODE passes,
 * relabelled as a fact about the mandate, and false for every mandate with no
 * code declaration at all.
 *
 * The served input surface's `accepts_user_input` is the mandate's own answer
 * and the only one the run door honours, so it is the only one either screen
 * is allowed to say. Rendered through `<MandateUserTextLine>`, never re-derived.
 */
export function userTextSentence(surface: MandateInputSurface): string {
  return surface.acceptsUserInput
    ? "Free text from the caller is accepted, on top of whatever this job declares."
    : "Free text from the caller is not accepted — this job runs on its declared inputs only.";
}

/** `GET /mandates/{mandate_key}/input-surface`, resolved for the caller (their
 * own override's Holder is the one that informs the form). */
export function useMandateInputSurface(
  mandateKey: string | null,
): MandateInputSurfaceState {
  const dispatch = useAppDispatch();
  // THE HYDRATION RACE — the same one the served run form hit: callApi refuses
  // until the active organization has hydrated, and a fetch fired before then
  // fails permanently with no retry. Depending on the id re-runs it the moment
  // context lands.
  const organizationId = useAppSelector(selectOrganizationId);
  // 🚨 H2 / V3 F4 — "NO ORG YET" IS NOT "STILL READING".
  // `callApi` refuses every request until an organization is active, and this
  // effect used to simply `return` on that condition — so with no org selected
  // the state stayed `loading` FOREVER and the column printed "Reading what
  // this job offers…" with no remedy (measured at 20s by the correctness
  // adversary, on a page that knew the real reason the whole time and printed
  // it only after a write). Once the bootstrap has RESOLVED and there is still
  // no org, that is a settled fact about this session, and it is said out loud
  // with the action that fixes it. Before the bootstrap resolves, "loading" is
  // the truth and no error flashes.
  const orgResolved = useAppSelector(selectOrgBootstrapResolved);
  const [state, setState] = useState<MandateInputSurfaceState>({
    status: "loading",
  });

  useEffect(() => {
    if (!mandateKey) return;
    if (!organizationId) {
      if (orgResolved) {
        setState({
          status: "error",
          message:
            "No organization is selected, so this job's inputs cannot be read — choose one from the organization picker in the header and this fills in.",
        });
      }
      return;
    }
    let live = true;
    setState({ status: "loading" });
    void (async () => {
      const result = await dispatch(
        callApi({
          path: "/mandates/{mandate_key}/input-surface",
          method: "GET",
          pathParams: { mandate_key: mandateKey },
        }),
      );
      if (!live) return;
      if (result.error) {
        setState({
          status: "error",
          message:
            result.error.message ||
            "This job's inputs could not be read from the server.",
        });
        return;
      }
      setState({
        status: "ready",
        surface: parseMandateInputSurface(result.data, mandateKey),
      });
    })();
    return () => {
      live = false;
    };
  }, [dispatch, mandateKey, organizationId, orgResolved]);

  return state;
}
