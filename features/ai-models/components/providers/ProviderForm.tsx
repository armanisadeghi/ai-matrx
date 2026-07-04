"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Lock } from "lucide-react";
import type { AiProviderRow } from "../../types";

// ─── Form data shape ────────────────────────────────────────────────────────
// Mirrors ai.provider's editable identity fields as plain strings (like
// AiModelFormData does for ai.model_definition) — is_system/organization_id/
// timestamps/metadata are never user-edited here.

export type ProviderFormData = {
  name: string;
  slug: string;
  company_description: string;
  documentation_link: string;
  models_link: string;
  website_url: string;
  logo_url: string;
  visibility: AiProviderRow["visibility"];
};

export const EMPTY_PROVIDER_FORM: ProviderFormData = {
  name: "",
  slug: "",
  company_description: "",
  documentation_link: "",
  models_link: "",
  website_url: "",
  logo_url: "",
  visibility: "public",
};

interface ProviderFormProps {
  data: ProviderFormData;
  isSystem: boolean;
  onChange: (data: ProviderFormData) => void;
}

function FormField({
  label,
  children,
  required,
  description,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export default function ProviderForm({
  data,
  isSystem,
  onChange,
}: ProviderFormProps) {
  const set =
    (key: keyof ProviderFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...data, [key]: e.target.value });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Name" required>
          <Input
            value={data.name}
            onChange={set("name")}
            placeholder="e.g. Anthropic"
            className="h-8 text-sm"
          />
        </FormField>
        <FormField label="Slug" description="URL-safe identifier">
          <Input
            value={data.slug}
            onChange={set("slug")}
            placeholder="e.g. anthropic"
            className="h-8 text-sm font-mono"
          />
        </FormField>
      </div>

      <FormField label="Company Description">
        <Textarea
          value={data.company_description}
          onChange={set("company_description")}
          placeholder="Short description of the provider"
          className="text-sm min-h-[72px] resize-none"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Documentation Link">
          <Input
            type="url"
            value={data.documentation_link}
            onChange={set("documentation_link")}
            placeholder="https://docs.provider.com"
            className="h-8 text-sm"
          />
        </FormField>
        <FormField label="Models Link" description="Where they list their models">
          <Input
            type="url"
            value={data.models_link}
            onChange={set("models_link")}
            placeholder="https://provider.com/models"
            className="h-8 text-sm"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Website URL">
          <Input
            type="url"
            value={data.website_url}
            onChange={set("website_url")}
            placeholder="https://provider.com"
            className="h-8 text-sm"
          />
        </FormField>
        <FormField label="Logo URL">
          <Input
            type="url"
            value={data.logo_url}
            onChange={set("logo_url")}
            placeholder="https://provider.com/logo.png"
            className="h-8 text-sm"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3 items-start">
        <FormField label="Visibility">
          <Select
            value={data.visibility}
            onValueChange={(v) =>
              onChange({ ...data, visibility: v as ProviderFormData["visibility"] })
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
              <SelectItem value="link">Link</SelectItem>
              <SelectItem value="public">Public</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="System">
          {isSystem ? (
            <Badge
              variant="outline"
              className="h-8 px-3 w-fit flex items-center gap-1.5 text-xs bg-muted text-muted-foreground border-border"
            >
              <Lock className="h-3 w-3" />
              System — protected, not editable
            </Badge>
          ) : (
            <span className="h-8 flex items-center text-xs text-muted-foreground">
              Not a system provider
            </span>
          )}
        </FormField>
      </div>
    </div>
  );
}
