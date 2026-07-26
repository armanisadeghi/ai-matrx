"use client";

import React, { useState, useEffect, useId, useRef } from "react";
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
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { createOrganization } from "../service";
import {
  generateOrganizationAbbreviation,
  generateSlug,
  validateOrganizationAbbreviation,
  validateOrgName,
  validateOrgSlug,
} from "../types";
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
  const fieldId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFileId, setLogoFileId] = useState("");

  // Manual slug edit tracking
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [isAbbreviationManuallyEdited, setIsAbbreviationManuallyEdited] =
    useState(false);

  // Slug availability check with debouncing
  const { available: slugAvailable, checking: checkingSlug } =
    useSlugAvailability(slug, 500);

  // Validation
  const nameValidation = name
    ? validateOrgName(name)
    : { valid: true, error: "" };
  const slugValidation = slug
    ? validateOrgSlug(slug)
    : { valid: true, error: "" };
  const abbreviationValidation = abbreviation
    ? validateOrganizationAbbreviation(abbreviation)
    : { valid: false, error: "Abbreviation is required" };

  const isFormValid =
    name &&
    abbreviation &&
    slug &&
    nameValidation.valid &&
    abbreviationValidation.valid &&
    slugValidation.valid &&
    slugAvailable &&
    !checkingSlug;

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setName("");
        setAbbreviation("");
        setSlug("");
        setDescription("");
        setWebsite("");
        setLogoUrl("");
        setLogoFileId("");
        setIsSlugManuallyEdited(false);
        setIsAbbreviationManuallyEdited(false);
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
        abbreviation,
        slug,
        description,
        website: website || undefined,
        logoUrl: logoUrl || undefined,
        logoFileId: logoFileId || undefined,
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
    } catch (error: unknown) {
      console.error("Error creating organization:", error);
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast.error(message);
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[90dvh] overflow-y-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          nameInputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Create New Organization</DialogTitle>
          <DialogDescription>
            Set up a new organization to collaborate with your team
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Organization Name */}
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-name`} className="required">
              Organization Name *
            </Label>
            <Input
              ref={nameInputRef}
              id={`${fieldId}-name`}
              aria-invalid={!nameValidation.valid}
              aria-describedby={
                !nameValidation.valid ? `${fieldId}-name-error` : undefined
              }
              value={name}
              onChange={(e) => {
                const nextName = e.target.value;
                setName(nextName);
                if (!isSlugManuallyEdited) {
                  setSlug(generateSlug(nextName));
                }
                if (!isAbbreviationManuallyEdited) {
                  setAbbreviation(
                    generateOrganizationAbbreviation(nextName),
                  );
                }
              }}
              placeholder="e.g., Acme Corporation"
              required
              autoComplete="organization"
              maxLength={50}
              disabled={isSubmitting}
              className={!nameValidation.valid ? "border-red-500" : ""}
            />
            {!nameValidation.valid && (
              <p
                id={`${fieldId}-name-error`}
                className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1"
              >
                <AlertCircle className="h-3 w-3" />
                {nameValidation.error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {name.length}/50 characters
            </p>
          </div>

          {/* Abbreviation */}
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-abbreviation`} className="required">
              Abbreviation *
            </Label>
            <Input
              id={`${fieldId}-abbreviation`}
              aria-invalid={!abbreviationValidation.valid}
              aria-describedby={`${fieldId}-abbreviation-help${
                abbreviationValidation.valid
                  ? ""
                  : ` ${fieldId}-abbreviation-error`
              }`}
              value={abbreviation}
              onChange={(event) => {
                setAbbreviation(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, "")
                    .slice(0, 3),
                );
                setIsAbbreviationManuallyEdited(true);
              }}
              placeholder="ACM"
              required
              minLength={2}
              maxLength={3}
              disabled={isSubmitting}
              className="w-24 font-semibold uppercase tracking-wider"
            />
            {!abbreviationValidation.valid && (
              <p
                id={`${fieldId}-abbreviation-error`}
                className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
              >
                <AlertCircle className="h-3 w-3" />
                {abbreviationValidation.error}
              </p>
            )}
            <p
              id={`${fieldId}-abbreviation-help`}
              className="text-xs text-muted-foreground"
            >
              2–3 letters used anywhere the full organization name will not
              fit.
              {!isAbbreviationManuallyEdited && " Auto-generated from name."}
            </p>
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-slug`} className="required">
              URL Slug *
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                aimatrx.com/organizations/
              </span>
              <Input
                id={`${fieldId}-slug`}
                aria-invalid={
                  Boolean(slug) &&
                  (!slugValidation.valid ||
                    (!checkingSlug && slugAvailable === false))
                }
                aria-describedby={`${fieldId}-slug-status ${fieldId}-slug-help`}
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setIsSlugManuallyEdited(true);
                }}
                placeholder="acme-corp"
                required
                maxLength={50}
                disabled={isSubmitting}
                className={cn(
                  "flex-1",
                  slug &&
                    (!slugValidation.valid ||
                      (!checkingSlug && slugAvailable === false))
                    ? "border-red-500"
                    : "",
                  slug && slugAvailable && slugValidation.valid
                    ? "border-green-500"
                    : "",
                )}
              />
            </div>
            <div
              id={`${fieldId}-slug-status`}
              className="flex items-center justify-between"
              aria-live="polite"
            >
              {getSlugIndicator()}
              {!isSlugManuallyEdited && (
                <p className="text-xs text-muted-foreground">
                  Auto-generated from name
                </p>
              )}
            </div>
            <p
              id={`${fieldId}-slug-help`}
              className="text-xs text-muted-foreground"
            >
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-description`}>Description</Label>
            <Textarea
              id={`${fieldId}-description`}
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
            <Label htmlFor={`${fieldId}-website`}>Website</Label>
            <Input
              id={`${fieldId}-website`}
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              autoComplete="url"
              disabled={isSubmitting}
            />
          </div>

          {/* Logo — drag-drop with asset variants, or paste a URL */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium leading-none">Logo</legend>
            <ImageAssetUploader
              preset="logo"
              currentUrl={logoUrl || null}
              onComplete={(result) => {
                setLogoUrl(result?.primary_url ?? "");
                setLogoFileId(result?.file_id ?? "");
              }}
              folder={`${CloudFolders.SHARED_ASSETS_ORGS}/logos`}
              disabled={isSubmitting}
              enableViewerAction
              label="Organization logo"
            />
          </fieldset>

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
