"use client";

import React, { useState, useEffect } from "react";
import { Plus, Loader2, Check, X, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createProject } from "../service";
import {
  generateProjectSlug,
  validateProjectName,
  validateProjectSlug,
} from "../types";
import { useProjectSlugAvailability } from "../hooks";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";

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
   * When true (default) the modal navigates to the new project's settings page
   * after creation. Set false when used inside another flow (e.g. wizards) that
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
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

  const { available: slugAvailable, checking: checkingSlug } =
    useProjectSlugAvailability(slug, organizationId ?? undefined, 500);

  useEffect(() => {
    if (name && !isSlugManuallyEdited) {
      setSlug(generateProjectSlug(name));
    }
  }, [name, isSlugManuallyEdited]);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setName("");
        setSlug("");
        setDescription("");
        setIsSlugManuallyEdited(false);
      }, 200);
    }
  }, [isOpen]);

  const nameValidation = name
    ? validateProjectName(name)
    : { valid: true, error: "" };
  const slugValidation = slug
    ? validateProjectSlug(slug)
    : { valid: true, error: "" };

  const isFormValid =
    name &&
    slug &&
    nameValidation.valid &&
    slugValidation.valid &&
    slugAvailable &&
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
        organizationId: organizationId ?? undefined,
        description: description || undefined,
      });

      if (result.success && result.project) {
        // Refresh the global hierarchy so /projects, /org/[slug]/projects,
        // and the agent-context cascade pick up the new project at once.
        dispatch(
          invalidateAndRefetchFullContext() as unknown as Parameters<
            typeof dispatch
          >[0],
        );
        toast.success("Project created successfully!");
        onClose();
        onSuccess?.({
          id: result.project.id,
          slug: result.project.slug ?? null,
          name: result.project.name,
          organizationId: result.project.organizationId ?? null,
        });
        if (redirectOnSuccess) {
          // Org projects use slug-or-id (slug is unique per org).
          // Personal projects must use UUID — slug isn't globally unique and
          // PG treats NULL org_ids as distinct in the unique constraint.
          if (orgSlug && result.project.organizationId) {
            const orgSegment = result.project.slug ?? result.project.id;
            router.push(`/org/${orgSlug}/projects/${orgSegment}/settings`);
          } else {
            router.push(`/projects/${result.project.id}/settings`);
          }
        }
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

  const getSlugIndicator = () => {
    if (!slug) return null;
    if (checkingSlug) {
      return (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking...
        </div>
      );
    }
    if (!slugValidation.valid) {
      return (
        <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <X className="h-3 w-3" />
          {slugValidation.error}
        </div>
      );
    }
    if (slugAvailable) {
      return (
        <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <Check className="h-3 w-3" />
          Available
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
        <X className="h-3 w-3" />
        Already taken
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            {organizationId
              ? "Set up a new project to collaborate with your team"
              : "Create a personal project to organize your work"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name *</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Website Redesign"
              maxLength={50}
              disabled={isSubmitting}
              className={!nameValidation.valid ? "border-red-500" : ""}
            />
            {!nameValidation.valid && (
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {nameValidation.error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {name.length}/50 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-slug">URL Slug *</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {orgSlug ? `/org/${orgSlug}/projects/` : "/projects/"}
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
                    (!checkingSlug && slug && !slugAvailable)
                    ? "border-red-500"
                    : "",
                  slug && slugAvailable && slugValidation.valid
                    ? "border-green-500"
                    : "",
                )}
              />
            </div>
            <div className="flex items-center justify-between">
              {getSlugIndicator()}
              {!isSlugManuallyEdited && (
                <p className="text-xs text-muted-foreground">
                  Auto-generated from name
                </p>
              )}
            </div>
          </div>

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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
