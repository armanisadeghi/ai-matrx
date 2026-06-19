"use client";

/**
 * CreateProjectModal
 *
 * Thin compatibility wrapper preserved for existing callers. The real form now
 * lives in the canonical `ProjectFormSheet` → `ProjectCreatePanel` →
 * `ProjectFormCore` stack, so every consumer of this modal gets the same
 * Manual + "Use AI" experience as the window panel and the `/projects/new`
 * route — no forked form.
 *
 * Kept only for its older prop contract (`isOpen` / `onClose` /
 * `onSuccess(CreatedProjectInfo)` / `redirectOnSuccess`). New code should call
 * `ProjectFormSheet`, `useOpenCreateProjectWindow()`, or link to `/projects/new`
 * directly.
 */

import React from "react";
import { ProjectFormSheet } from "./ProjectFormSheet";
import type { Project } from "../types";

interface CreatedProjectInfo {
  id: string;
  slug: string | null;
  name: string;
  organizationId: string | null;
}

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (project: CreatedProjectInfo) => void;
  organizationId?: string | null;
  orgSlug?: string | null;
  /**
   * When true (default) the create flow offers a redirect to the new project's
   * settings page. Set false when used inside another flow (e.g. wizards) that
   * should keep the user in place and consume the new project via onSuccess.
   */
  redirectOnSuccess?: boolean;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  onSuccess,
  organizationId = null,
  orgSlug = null,
  redirectOnSuccess = true,
}: CreateProjectModalProps) {
  return (
    <ProjectFormSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      organizationId={organizationId}
      orgSlug={orgSlug}
      skipRedirect={!redirectOnSuccess}
      onSuccess={(project: Project) => {
        onSuccess?.({
          id: project.id,
          slug: project.slug ?? null,
          name: project.name,
          organizationId: project.organizationId ?? null,
        });
      }}
    />
  );
}
