"use client";

/**
 * useSourceRecovery — the web app's BINDING of the Source input's recovery
 * (`@ai-matrx/agents/sources/react`, USI-7): re-land what a reload cut off,
 * continue every card that waited for an organization once one is set, and
 * follow each stored file's Source from the SERVER's state. The decisions live
 * in the package; this file hands it the one read (`/files/{id}/rag-status`)
 * and the file's own organization, and the tab's processing runner. Any UI
 * that sits on `useSourceSet` + `useSourceIntake` calls it once.
 */

import { useSourceRecovery as useSourceRecoveryCore } from "@ai-matrx/agents/sources/react";
import type { SourceCardModel, SourceIntake, SourceSetActions } from "@ai-matrx/agents/sources/runtime";
import type { UseProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import { fetchFileRagStatus } from "@/features/rag/api/rag-jobs";
import { fileOrganizationId } from "@/features/files/api/fileOrganization";

export function useSourceRecovery(
  set: { sources: SourceCardModel[] } & Pick<SourceSetActions, "fail" | "manifest">,
  intake: Pick<SourceIntake, "resume" | "fileLanded">,
  runner: UseProcessingRunner,
  /** The organization the person picked (null = none yet). A file card is only asked about once one is known. */
  options: { organizationId: string | null | undefined },
): void {
  useSourceRecoveryCore(set, intake, runner, {
    organizationId: options.organizationId,
    readFileState: fetchFileRagStatus,
    fileOrganizationId,
  });
}
