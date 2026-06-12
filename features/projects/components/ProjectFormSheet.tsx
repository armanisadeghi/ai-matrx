"use client";

import React, { useState, useEffect } from "react";
import {
  Plus,
  Loader2,
  Check,
  X,
  AlertCircle,
  Building2,
  User,
  ChevronDown,
  Settings,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRouter } from "next/navigation";
import { createProject } from "../service";
import {
  generateProjectSlug,
  validateProjectName,
  validateProjectSlug,
} from "../types";
import { useProjectSlugAvailability } from "../hooks";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import type { Project } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Represents the org context chosen in the form: null = Personal project */
type OrgContext = { id: string; name: string; slug: string } | null;

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
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SlugIndicator({
  slug,
  checkingSlug,
  slugValidation,
  slugAvailable,
}: {
  slug: string;
  checkingSlug: boolean;
  slugValidation: { valid: boolean; error?: string };
  slugAvailable: boolean | null;
}) {
  if (!slug) return null;
  if (checkingSlug) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking...
      </span>
    );
  }
  if (!slugValidation.valid) {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <X className="h-3 w-3" />
        {slugValidation.error}
      </span>
    );
  }
  if (slugAvailable) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <Check className="h-3 w-3" />
        Available
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-destructive">
      <X className="h-3 w-3" />
      Already taken
    </span>
  );
}

function OrgSelector({
  orgs,
  orgsLoading,
  selectedOrg,
  onSelect,
  locked,
  isMobile,
}: {
  orgs: {
    id: string;
    name: string;
    slug: string;
    role: string;
  }[];
  orgsLoading: boolean;
  selectedOrg: OrgContext;
  onSelect: (org: OrgContext) => void;
  locked: boolean;
  isMobile: boolean;
}) {
  const label = selectedOrg ? selectedOrg.name : "Personal";
  const Icon = selectedOrg ? Building2 : User;

  if (locked) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2",
          isMobile && "min-h-[44px]",
        )}
      >
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{label}</span>
        <span className="ml-auto text-xs text-muted-foreground">Pre-set</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start gap-2 font-normal",
            isMobile && "min-h-[44px] text-base",
          )}
          disabled={orgsLoading}
          style={isMobile ? { fontSize: "16px" } : undefined}
        >
          {orgsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="truncate">{orgsLoading ? "Loading..." : label}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[280px]">
        {/* Personal option */}
        <DropdownMenuItem
          onClick={() => onSelect(null)}
          className={cn("gap-2", !selectedOrg && "bg-accent")}
        >
          <User className="h-4 w-4 shrink-0" />
          <span>Personal</span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            No org
          </span>
        </DropdownMenuItem>

        {orgs.length > 0 && <DropdownMenuSeparator />}

        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() =>
              onSelect({ id: org.id, name: org.name, slug: org.slug })
            }
            className={cn("gap-2", selectedOrg?.id === org.id && "bg-accent")}
          >
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{org.name}</span>
            <span className="text-[10px] text-muted-foreground ml-auto capitalize">
              {org.role}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Form (shared logic, two layouts)
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectFormInnerProps {
  initialOrgId?: string | null;
  initialOrgSlug?: string | null;
  /** When provided, lock the org selector and don't show it as editable */
  orgLocked?: boolean;
  skipRedirect?: boolean;
  onSuccess?: (project: Project) => void;
  onClose: () => void;
  isMobile?: boolean;
}

function ProjectFormInner({
  initialOrgId,
  initialOrgSlug,
  orgLocked = false,
  skipRedirect = false,
  onSuccess,
  onClose,
  isMobile = false,
}: ProjectFormInnerProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { orgs, isLoading: orgsLoading } = useNavTree();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

  // Resolve initial org context from props
  const resolveInitialOrg = (): OrgContext => {
    if (!initialOrgId) return null;
    if (initialOrgSlug)
      return { id: initialOrgId, name: "", slug: initialOrgSlug };
    return { id: initialOrgId, name: "", slug: "" };
  };

  const [selectedOrg, setSelectedOrg] = useState<OrgContext>(resolveInitialOrg);

  // Once orgs load, fill in the name/slug for the initial org
  useEffect(() => {
    if (!initialOrgId || !orgs.length) return;
    const found = orgs.find((o) => o.id === initialOrgId);
    if (found) {
      setSelectedOrg({ id: found.id, name: found.name, slug: found.slug });
    }
  }, [orgs, initialOrgId]);

  // Auto-generate slug from name
  useEffect(() => {
    if (name && !isSlugManuallyEdited) {
      setSlug(generateProjectSlug(name));
    }
  }, [name, isSlugManuallyEdited]);

  const { available: slugAvailable, checking: checkingSlug } =
    useProjectSlugAvailability(slug, selectedOrg?.id ?? undefined, 500);

  const nameValidation = name
    ? validateProjectName(name)
    : { valid: true, error: "" };
  const slugValidation = slug
    ? validateProjectSlug(slug)
    : { valid: true, error: "" };

  const isFormValid =
    !!name &&
    !!slug &&
    nameValidation.valid &&
    slugValidation.valid &&
    slugAvailable === true &&
    !checkingSlug;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) {
      toast.error("Please fix validation errors before submitting");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createProject({
        name,
        slug,
        // Pass undefined (not '') when no org — Postgres rejects empty string for UUID
        organizationId: selectedOrg?.id ?? undefined,
        description: description || undefined,
      });

      if (result.success && result.project) {
        // Refresh the global hierarchy so /projects, /organizations/[slug]/projects,
        // and the agent-context cascade pick up the new project at once.
        dispatch(
          invalidateAndRefetchFullContext() as unknown as Parameters<
            typeof dispatch
          >[0],
        );
        // The canonical service normalizes the personal pseudo-org sentinel to
        // a null organization id; redirect to the personal /projects path in
        // that case rather than the non-existent /organizations/personal route.
        const persistedOrgId = result.project.organizationId;
        toast.success("Project created!", {
          description: "You can manage permissions in project settings.",
          action: !skipRedirect
            ? {
                label: "Open Settings",
                onClick: () => {
                  // Personal projects always use UUID — slug is only unique
                  // inside an org, so the personal route segment is `[id]`.
                  const base =
                    persistedOrgId && selectedOrg?.slug
                      ? `/organizations/${selectedOrg.slug}/projects/${result.project!.slug ?? result.project!.id}/settings`
                      : `/projects/${result.project!.id}/settings`;
                  router.push(base);
                },
              }
            : undefined,
        });
        onSuccess?.(result.project);
        onClose();
      } else {
        toast.error(result.error || "Failed to create project");
      }
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const slugPrefix = selectedOrg?.slug
    ? `/organizations/${selectedOrg.slug}/projects/`
    : "/projects/";

  // ── Mobile layout ────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <form onSubmit={handleSubmit} className="space-y-5 p-4 pb-safe">
          {/* Org selector */}
          <div className="space-y-2">
            <Label>Owner</Label>
            <OrgSelector
              orgs={orgs}
              orgsLoading={orgsLoading}
              selectedOrg={selectedOrg}
              onSelect={setSelectedOrg}
              locked={orgLocked}
              isMobile
            />
            <p className="text-xs text-muted-foreground">
              {selectedOrg
                ? "Team members of this org can be added to the project."
                : "Personal projects are private to you by default."}
            </p>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="mobile-project-name">Project Name *</Label>
            <Input
              id="mobile-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Website Redesign"
              maxLength={50}
              disabled={isSubmitting}
              className={cn(
                "text-base",
                !nameValidation.valid ? "border-destructive" : "",
              )}
              style={{ fontSize: "16px" }}
            />
            {!nameValidation.valid && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {nameValidation.error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{name.length}/50</p>
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="mobile-project-slug">URL Slug *</Label>
            <p className="text-xs text-muted-foreground font-mono">
              {slugPrefix}
            </p>
            <Input
              id="mobile-project-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setIsSlugManuallyEdited(true);
              }}
              placeholder="website-redesign"
              maxLength={50}
              disabled={isSubmitting}
              className={cn(
                "text-base",
                !slugValidation.valid ||
                  (!checkingSlug && slug && slugAvailable === false)
                  ? "border-destructive"
                  : slug && slugAvailable && slugValidation.valid
                    ? "border-green-500"
                    : "",
              )}
              style={{ fontSize: "16px" }}
            />
            <div className="flex items-center justify-between">
              <SlugIndicator
                slug={slug}
                checkingSlug={checkingSlug}
                slugValidation={slugValidation}
                slugAvailable={slugAvailable}
              />
              {!isSlugManuallyEdited && slug && (
                <span className="text-xs text-muted-foreground">
                  Auto-generated
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="mobile-project-description">Description</Label>
            <Textarea
              id="mobile-project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={3}
              maxLength={500}
              disabled={isSubmitting}
              className="text-base"
              style={{ fontSize: "16px" }}
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/500
            </p>
          </div>

          {/* Permissions hint */}
          <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
            <Settings className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              After creating, open <strong>Project Settings</strong> to manage
              member permissions and invitations.
            </span>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 pt-2 border-t border-border">
            <Button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="w-full min-h-[44px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Project
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full min-h-[44px]"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // ── Desktop layout ───────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Org selector */}
      <div className="space-y-2">
        <Label>Owner</Label>
        <OrgSelector
          orgs={orgs}
          orgsLoading={orgsLoading}
          selectedOrg={selectedOrg}
          onSelect={setSelectedOrg}
          locked={orgLocked}
          isMobile={false}
        />
        <p className="text-xs text-muted-foreground">
          {selectedOrg
            ? "Team members of this org can be added to the project."
            : "Personal projects are private to you by default."}
        </p>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="project-name">Project Name *</Label>
        <Input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Website Redesign"
          maxLength={50}
          disabled={isSubmitting}
          className={!nameValidation.valid ? "border-destructive" : ""}
        />
        {!nameValidation.valid && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {nameValidation.error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {name.length}/50 characters
        </p>
      </div>

      {/* Slug */}
      <div className="space-y-2">
        <Label htmlFor="project-slug">URL Slug *</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground font-mono whitespace-nowrap">
            {slugPrefix}
          </span>
          <Input
            id="project-slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setIsSlugManuallyEdited(true);
            }}
            placeholder="website-redesign"
            maxLength={50}
            disabled={isSubmitting}
            className={cn(
              "flex-1",
              !slugValidation.valid ||
                (!checkingSlug && slug && slugAvailable === false)
                ? "border-destructive"
                : slug && slugAvailable && slugValidation.valid
                  ? "border-green-500"
                  : "",
            )}
          />
        </div>
        <div className="flex items-center justify-between">
          <SlugIndicator
            slug={slug}
            checkingSlug={checkingSlug}
            slugValidation={slugValidation}
            slugAvailable={slugAvailable}
          />
          {!isSlugManuallyEdited && slug && (
            <span className="text-xs text-muted-foreground">
              Auto-generated from name
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="project-description">Description</Label>
        <Textarea
          id="project-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this project about?"
          rows={3}
          maxLength={500}
          disabled={isSubmitting}
        />
        <p className="text-xs text-muted-foreground">
          {description.length}/500 characters
        </p>
      </div>

      {/* Permissions hint */}
      <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
        <Settings className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          After creating, open <strong>Project Settings</strong> to manage
          member permissions and invitations.
        </span>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!isFormValid || isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
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
}: ProjectFormSheetProps) {
  const isMobile = useIsMobile();

  const orgLocked = organizationId !== undefined;
  const handleClose = () => onOpenChange(false);

  const sharedProps: ProjectFormInnerProps = {
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
          <ProjectFormInner {...sharedProps} isMobile />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Name it, pick an owner, and go. Manage permissions in settings after
            creation.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <ProjectFormInner {...sharedProps} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
