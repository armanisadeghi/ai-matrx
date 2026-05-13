"use client";

import React, { useState, useEffect } from "react";
import { Save, X, Loader2, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { updateOrganization } from "../service";
import { validateOrgName, type Organization, type OrgRole } from "../types";
import { InlineMediaRef } from "@/features/files";
import { format } from "date-fns";
import { ImageCropUploader } from "@/components/official/ImageCropUploader";
import { folderForOrg } from "@/features/files";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { useOrgSettingsLayoutRefresh } from "./OrgSettingsLayoutContext";

interface GeneralSettingsProps {
  organization: Organization;
  canEdit: boolean;
  userRole: OrgRole;
  /** Called with the server row after a successful save so view mode updates without a full reload. */
  onOrganizationUpdated?: (organization: Organization) => void;
}

/**
 * GeneralSettings - Tab for editing general organization details
 *
 * Features:
 * - Edit name, description, website, logo
 * - View-only mode for members
 * - Form validation
 * - Save/cancel functionality
 * - Loading states
 */
export function GeneralSettings({
  organization,
  canEdit,
  userRole,
  onOrganizationUpdated,
}: GeneralSettingsProps) {
  const dispatch = useAppDispatch();
  const refreshLayoutOrganization = useOrgSettingsLayoutRefresh();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [name, setName] = useState(organization.name);
  const [description, setDescription] = useState(
    organization.description || "",
  );
  const [website, setWebsite] = useState(organization.website || "");
  const [logoUrl, setLogoUrl] = useState(organization.logoUrl || "");

  // Reset form when organization changes
  useEffect(() => {
    setName(organization.name);
    setDescription(organization.description || "");
    setWebsite(organization.website || "");
    setLogoUrl(organization.logoUrl || "");
    setIsEditing(false);
  }, [organization]);

  // Check if form has changes
  const hasChanges =
    name !== organization.name ||
    description !== (organization.description || "") ||
    website !== (organization.website || "") ||
    logoUrl !== (organization.logoUrl || "");

  // Validation
  const nameValidation = name
    ? validateOrgName(name)
    : { valid: false, error: "Name is required" };
  const isFormValid = nameValidation.valid;

  // Handle save
  const handleSave = async () => {
    if (!isFormValid) {
      toast.error("Please fix validation errors");
      return;
    }

    setIsSaving(true);

    try {
      const result = await updateOrganization(organization.id, {
        name,
        description,
        website: website || undefined,
        logoUrl: logoUrl || undefined,
      });

      if (result.success) {
        if (result.organization) {
          onOrganizationUpdated?.(result.organization);
        }
        try {
          await dispatch(
            invalidateAndRefetchFullContext() as unknown as Parameters<
              typeof dispatch
            >[0],
          );
        } catch {
          // Hierarchy refresh is best-effort; org UI already updated from API row
        }
        void refreshLayoutOrganization?.();
        toast.success("Organization updated successfully");
        setIsEditing(false);
      } else {
        toast.error(result.error || "Failed to update organization");
      }
    } catch (error: unknown) {
      console.error("Error updating organization:", error);
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setName(organization.name);
    setDescription(organization.description || "");
    setWebsite(organization.website || "");
    setLogoUrl(organization.logoUrl || "");
    setIsEditing(false);
  };

  // Handle copy URL
  const handleCopyUrl = () => {
    const orgUrl = `https://aimatrx.com/organizations/${organization.slug}`;
    navigator.clipboard.writeText(orgUrl);
    toast.success("Organization URL copied to clipboard");
  };

  return (
    <div className="space-y-5">
      {/* Form Fields */}
      <div className="space-y-5">
        {/* Organization Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Organization Name *</Label>
          {isEditing ? (
            <>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Organization name"
                maxLength={50}
                disabled={isSaving}
                className={!nameValidation.valid ? "border-red-500" : ""}
              />
              {!nameValidation.valid && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {nameValidation.error}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {name.length}/50 characters
              </p>
            </>
          ) : (
            <p className="text-sm font-medium">{name}</p>
          )}
        </div>

        {/* Slug (Read-only) */}
        <div className="space-y-2">
          <Label htmlFor="slug">Organization URL</Label>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`https://aimatrx.com/organizations/${organization.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline decoration-dotted underline-offset-4 flex items-center gap-1"
            >
              aimatrx.com/organizations/{organization.slug}
              <ExternalLink className="h-3 w-3" />
            </a>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyUrl}
              className="h-7 px-2"
            >
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </Button>
            <Badge variant="secondary" className="text-xs">
              Read-only
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            The slug cannot be changed after creation
          </p>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          {isEditing ? (
            <>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does your organization do?"
                rows={4}
                maxLength={500}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                {description.length}/500 characters
              </p>
            </>
          ) : (
            <p className="text-sm">
              {description || (
                <span className="text-muted-foreground italic">
                  No description provided
                </span>
              )}
            </p>
          )}
        </div>

        {/* Website */}
        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          {isEditing ? (
            <Input
              id="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              disabled={isSaving}
            />
          ) : (
            <p className="text-sm">
              {website ? (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {website}
                </a>
              ) : (
                <span className="text-muted-foreground italic">
                  No website provided
                </span>
              )}
            </p>
          )}
        </div>

        {/* Logo — drag-drop with Sharp variants, or paste a URL */}
        <div className="space-y-2">
          <Label>Logo</Label>
          {isEditing ? (
            <ImageCropUploader
              preset="logo"
              currentUrl={logoUrl || null}
              onComplete={(result) => setLogoUrl(result?.primary_url ?? "")}
              folder={`${folderForOrg(organization.id)}/logo`}
              disabled={isSaving}
              label="Organization logo"
              defaultAspect={1}
            />
          ) : (
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <>
                  <InlineMediaRef
                    ref={logoUrl}
                    size={{ width: 64, height: 64 }}
                    fit="cover"
                    rounded="lg"
                    border="subtle"
                    fallback={null}
                    alt={name}
                  />
                  <a
                    href={logoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    View logo
                  </a>
                </>
              ) : (
                <span className="text-sm text-muted-foreground italic">
                  No logo provided
                </span>
              )}
            </div>
          )}
        </div>

        {/* Metadata (Read-only) */}
        <div className="pt-6 border-t space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Metadata
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Created</Label>
              <p className="text-sm">
                {organization.createdAt
                  ? format(new Date(organization.createdAt), "PPP")
                  : "Unknown"}
              </p>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Last Updated
              </Label>
              <p className="text-sm">
                {organization.updatedAt
                  ? format(new Date(organization.updatedAt), "PPP")
                  : "Unknown"}
              </p>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Organization Type
              </Label>
              <p className="text-sm">
                {organization.isPersonal ? (
                  <Badge variant="secondary">Personal</Badge>
                ) : (
                  <Badge variant="secondary">Team</Badge>
                )}
              </p>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Your Role</Label>
              <p className="text-sm">
                <Badge>{userRole}</Badge>
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons — always at the bottom */}
        {canEdit && (
          <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-border">
            {isEditing ? (
              <>
                <Button
                  type="button"
                  onClick={handleCancel}
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasChanges || !isFormValid || isSaving}
                  size="sm"
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-1" />
                      Save
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setIsEditing(true)}
                variant="outline"
                size="sm"
              >
                Edit
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
