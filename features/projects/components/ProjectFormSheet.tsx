"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ProjectFormCoreProps } from "./ProjectFormCore";
import { ProjectCreatePanel } from "./ProjectCreatePanel";
import type { Project } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the newly created project on success */
  onSuccess?: (project: Project) => void;
  /**
   * Pre-set an org context. Pass `null` to force personal project.
   * Omit (undefined) to let the user choose.
   */
  organizationId?: string | null;
  orgSlug?: string | null;
  /** When true, don't redirect to settings after creation */
  skipRedirect?: boolean;
  /** Show the "Use AI" mode alongside the manual form. Default true. */
  enableAi?: boolean;
  /**
   * Fired when an AI run created a project server-side (no project object).
   * The panel already refreshes nav-tree consumers globally; wire this only if
   * the caller self-fetches its own list.
   */
  onAiComplete?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ProjectFormSheet
 *
 * App-wide reusable component to create a project from anywhere.
 * - Desktop: Dialog
 * - Mobile: Drawer (bottom sheet)
 *
 * The user can select which org to create under (or Personal).
 * Pass `organizationId` to pre-set the org; the org selector will be locked
 * and non-editable.
 *
 * `onSuccess(project)` is called with the newly created Project so callers
 * can update their own state.
 *
 * The form body itself lives in `ProjectFormCore` — the chrome-less single
 * source of truth shared with `CreateProjectWindow` (the WindowPanel chrome).
 * Don't fork the form; wrap the core in new chrome.
 *
 * Usage:
 * ```tsx
 * <ProjectFormSheet
 *   open={open}
 *   onOpenChange={setOpen}
 *   onSuccess={(project) => refresh()}
 * />
 * ```
 */
export function ProjectFormSheet({
  open,
  onOpenChange,
  onSuccess,
  organizationId,
  orgSlug,
  skipRedirect,
  enableAi = true,
  onAiComplete,
}: ProjectFormSheetProps) {
  const isMobile = useIsMobile();

  const orgLocked = organizationId !== undefined;
  const handleClose = () => onOpenChange(false);

  const sharedProps: ProjectFormCoreProps = {
    initialOrgId: organizationId ?? null,
    initialOrgSlug: orgSlug ?? null,
    orgLocked,
    skipRedirect,
    onSuccess,
    onClose: handleClose,
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh] flex flex-col">
          <DrawerTitle className="sr-only">Create New Project</DrawerTitle>
          <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border">
            <h2 className="text-lg font-semibold">Create New Project</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Name it, pick an owner, and go.
            </p>
          </div>
          <div className="flex-1 min-h-0 px-1 pt-3">
            <ProjectCreatePanel
              {...sharedProps}
              enableAi={enableAi}
              onAiComplete={onAiComplete}
              isMobile
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Name it, pick an owner, and go. Manage permissions in settings after
            creation.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <ProjectCreatePanel
            {...sharedProps}
            enableAi={enableAi}
            onAiComplete={onAiComplete}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
