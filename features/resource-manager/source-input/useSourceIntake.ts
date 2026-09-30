"use client";

/**
 * useSourceIntake — the web app's BINDING of the Source intake
 * (`@ai-matrx/agents/sources/runtime` `createSourceIntake`, USI-7). Every
 * landing rule (keep what the person handed over until it settles, one Source
 * per content, wait for an organization from state, file edges in the
 * registry's direction) lives in the package; this file only hands it the
 * web app's doors:
 *
 *   land / keep       → `features/sources/api/sourcesApi` (`POST /sources/land`, `/keep`)
 *   text landing      → `buildPastedTextLanding`
 *   web page          → `useScraperApi().scrapeUrl` (the scraper lands the page)
 *   YouTube           → Start's reader `fetchYouTubeTranscript`
 *   recording         → `transcribeCloudFile`
 *   file → target     → the ONE associations chokepoint (`associationsService`)
 *   organization      → `ensureOrgId` + `holdDeliberateIntent` (the organization gate)
 *   wording           → `addFailureSentence`
 *   kept-draft limit  → knob `sources.max_kept_draft_chars`
 */

import { useEffect, useState } from "react";
import { useSourceIntake as useSourceIntakeCore } from "@ai-matrx/agents/sources/react";
import {
  MAX_KEPT_TEXT_KNOB,
  type SourceAttachTo,
  type SourceIntake,
  type SourceSetActions,
} from "@ai-matrx/agents/sources/runtime";
import { isAssociationTargetType } from "@ai-matrx/associations";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import {
  holdDeliberateIntent,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import { useBackendApi } from "@/hooks/useBackendApi";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import { transcribeCloudFile } from "@/features/audio/services/speechApi";
import { fetchYouTubeTranscript } from "@/features/education/onboard/youtubeTranscript";
import { youtubeId } from "@/lib/media/youtube";
import { keepSource, landSource, type SourceLandingBody } from "@/features/sources/api/sourcesApi";
import { buildPastedTextLanding } from "@/features/sources/api/pastedText";
// Every `ensureOrgId` the intake calls lands in a catch that fails the card with
// `addFailureSentence`, which says the organization refusal in the platform's
// words, with the remedy.
// org-refusal-presented-by: features/sources/addFailure.ts
import { addFailureSentence } from "@/features/sources/addFailure";
import { associationsService } from "@/features/scopes/service/associationsService";

export type UseSourceIntakeResult = SourceIntake;

/** True when a landing stopped only because no organization is chosen yet. */
export function waitsForOrganization(error: unknown): boolean {
  return isOrganizationRequiredError(error) || isOrganizationSelectionCancelled(error);
}

export function useSourceIntake(
  set: SourceSetActions,
  options: { attachTo?: SourceAttachTo },
): UseSourceIntakeResult {
  const userId = useAppSelector(selectUserId);
  const activeOrgId = useAppSelector(selectOrganizationId);
  const backendApi = useBackendApi();
  const { scrapeUrl } = useScraperApi();

  // The largest pasted text kept in the draft for a reload is a knob; while
  // it is unread (or unreadable) nothing is kept and the card says so.
  const [maxKeptChars, setMaxKeptChars] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    knobInt(MAX_KEPT_TEXT_KNOB.feature, MAX_KEPT_TEXT_KNOB.key)
      .then((n) => live && setMaxKeptChars(n))
      .catch((err: unknown) => console.error("[useSourceIntake] kept-draft size could not be read:", err));
    return () => {
      live = false;
    };
  }, []);

  return useSourceIntakeCore<SourceLandingBody>(set, {
    doors: {
      land: (body) => landSource(body),
      keep: (processedDocumentId, keepOptions) => keepSource(processedDocumentId, keepOptions),
      buildTextLanding: (input) => buildPastedTextLanding(input),
      scrapeUrl: async (url) => {
        const result = await scrapeUrl(url);
        return result
          ? {
              processedDocumentId: result.processedDocumentId,
              sourceNotices: result.sourceNotices,
              pageTitle: result.overview?.page_title,
            }
          : null;
      },
      fetchYouTubeTranscript: (url) => fetchYouTubeTranscript(backendApi.post, url),
      transcribeFile: (input) => transcribeCloudFile(input),
      associate: async (edge) => {
        const { targetType } = edge;
        if (!isAssociationTargetType(targetType))
          return { ok: false, error: { message: `a ${targetType.replace(/_/g, " ")} cannot hold a file` } };
        const linked = await associationsService.add({ ...edge, targetType });
        return linked.ok ? { ok: true } : { ok: false, error: { message: linked.error.message } };
      },
    },
    ensureOrganization: () => ensureOrgId(activeOrgId),
    holdIntent: holdDeliberateIntent,
    waitsForOrganization,
    failureSentence: addFailureSentence,
    userId: () => userId,
    youtubeId,
    maxKeptChars: () => maxKeptChars,
    attachTo: options.attachTo,
  });
}
