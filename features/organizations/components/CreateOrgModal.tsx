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
import { createOrganization } from "../service";
import { generateSlug, validateOrgName, validateOrgSlug } from "../types";
import { useSlugAvailability } from "../hooks";
import { ImageAssetUploader } from "@/components/official/ImageAssetUploader";
import { CloudFolders } from "@/features/files";

interface CreateOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * CreateOrgModal - Modal for creating a new organization
 *
 * Features:
 * - Auto-generates slug from name
 * - Real-time slug availability checking
 * - Form validation
 * - Success/error handling
 * - Redirects to new org settings after creation
 */
export function CreateOrgModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateOrgModalProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // Manual slug edit tracking
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

  // Slug availability check with debouncing
  const { available: slugAvailable, checking: checkingSlug } =
    useSlugAvailability(slug, 500);

  // Auto-generate slug from name when name changes (if not manually edited)
  useEffect(() => {
    if (name && !isSlugManuallyEdited) {
      const generatedSlug = generateSlug(name);
      setSlug(generatedSlug);
    }
  }, [name, isSlugManuallyEdited]);

  // Validation
  const nameValidation = name
    ? validateOrgName(name)
    : { valid: true, error: "" };
  const slugValidation = slug
    ? validateOrgSlug(slug)
    : { valid: true, error: "" };

  const isFormValid =
    name &&
    slug &&
    nameValidation.valid &&
    slugValidation.valid &&
    slugAvailable &&
    !checkingSlug;

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setName("");
        setSlug("");
        setDescription("");
        setWebsite("");
        setLogoUrl("");
        setIsSlugManuallyEdited(false);
      }, 200);
    }
  }, [isOpen]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid) {
      toast.error("Please fix validation errors before submitting");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createOrganization({
        name,
        slug,
        description,
        website: website || undefined,
        logoUrl: logoUrl || undefined,
      });

      if (result.success && result.organization) {
        toast.success("Organization created successfully!");
        onClose();
        onSuccess?.();

        // Navigate to the new organization's settings page
        router.push(`/organizations/${result.organization.id}/settings`);
      } else {
        toast.error(result.error || "Failed to create organization");
      }
    } catch (error: any) {
      console.error("Error creating organization:", error);
      toast.error(error.message || "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Slug availability indicator
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Organization</DialogTitle>
          <DialogDescription>
            Set up a new organization to collaborate with your team
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Organization Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="required">
              Organization Name *
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Acme Corporation"
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

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug" className="required">
              URL Slug *
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                aimatrx.com/org/
              </span>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setIsSlugManuallyEdited(true);
                }}
                placeholder="acme-corp"
                maxLength={50}
                disabled={isSubmitting}
                className={cn(
                  "flex-1",
                  !slugValidation.valid || (!checkingSlug && !slugAvailable)
                    ? "border-red-500"
                    : "",
                  slugAvailable && slugValidation.valid
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
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does your organization do?"
              rows={3}
              maxLength={500}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/500 characters
            </p>
          </div>

          {/* Website */}
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              disabled={isSubmitting}
            />
          </div>

          {/* Logo — drag-drop with asset variants, or paste a URL */}
          <div className="space-y-2">
            <Label>Logo</Label>
            <ImageAssetUploader
              preset="logo"
              currentUrl={logoUrl || null}
              onComplete={(result) => setLogoUrl(result?.primary_url ?? "")}
              folder={`${CloudFolders.SHARED_ASSETS_ORGS}/logos`}
              disabled={isSubmitting}
              enableViewerAction
              label="Organization logo"
            />
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
              className="bg-blue-500 hover:bg-blue-600"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Organization
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Helper to add cn utility
import { cn } from "@/lib/utils";
