"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EnhancedEditableJsonViewer } from "@/components/ui/JsonComponents/JsonEditor";
import { Lock } from "lucide-react";
import type { AiServiceRow } from "../../types";

// ─── Form data shape ────────────────────────────────────────────────────────
// Mirrors ai.service's editable fields as plain strings/objects (like
// AiModelFormData / ProviderFormData do for their tables) — is_system/
// organization_id/timestamps/metadata/version are never user-edited here.

export type ServiceFormData = {
  internal_name: string;
  display_name: string;
  slug: string;
  wire_format: string;
  base_url: string;
  auth_ref: Record<string, unknown>;
  byok_secret_key: string;
  controls: Record<string, unknown>;
  request_defaults: Record<string, unknown>;
  priority: string;
  is_active: boolean;
  notes: string;
  visibility: AiServiceRow["visibility"];
};

export const EMPTY_SERVICE_FORM: ServiceFormData = {
  internal_name: "",
  display_name: "",
  slug: "",
  wire_format: "",
  base_url: "",
  auth_ref: {},
  byok_secret_key: "",
  controls: {},
  request_defaults: {},
  priority: "100",
  is_active: true,
  notes: "",
  visibility: "public",
};

interface ServiceFormProps {
  data: ServiceFormData;
  isSystem: boolean;
  onChange: (data: ServiceFormData) => void;
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

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">
      {label}
    </p>
  );
}

export default function ServiceForm({
  data,
  isSystem,
  onChange,
}: ServiceFormProps) {
  const set =
    (key: keyof ServiceFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...data, [key]: e.target.value });

  const toggle = (key: keyof ServiceFormData) => (checked: boolean) =>
    onChange({ ...data, [key]: checked });

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="space-y-3">
        <SectionHeader label="Identity" />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Internal Name"
            required
            description="Machine-readable key other code references"
          >
            <Input
              value={data.internal_name}
              onChange={set("internal_name")}
              placeholder="e.g. anthropic-messages"
              className="h-8 text-sm font-mono"
            />
          </FormField>
          <FormField label="Display Name" required>
            <Input
              value={data.display_name}
              onChange={set("display_name")}
              placeholder="e.g. Anthropic Messages API"
              className="h-8 text-sm"
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Slug" required description="URL-safe identifier">
            <Input
              value={data.slug}
              onChange={set("slug")}
              placeholder="e.g. anthropic-messages"
              className="h-8 text-sm font-mono"
            />
          </FormField>
          <FormField
            label="Wire Format"
            required
            description="Protocol/translator token, e.g. anthropic, openai, openai-responses"
          >
            <Input
              value={data.wire_format}
              onChange={set("wire_format")}
              placeholder="e.g. anthropic"
              className="h-8 text-sm font-mono"
            />
          </FormField>
        </div>
      </div>

      {/* Connection */}
      <div className="space-y-3">
        <SectionHeader label="Connection" />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Base URL">
            <Input
              type="url"
              value={data.base_url}
              onChange={set("base_url")}
              placeholder="https://api.provider.com/v1"
              className="h-8 text-sm font-mono"
            />
          </FormField>
          <FormField
            label="BYOK Secret Key"
            description="Bring-your-own-key secret reference name"
          >
            <Input
              value={data.byok_secret_key}
              onChange={set("byok_secret_key")}
              placeholder="e.g. USER_ANTHROPIC_API_KEY"
              className="h-8 text-sm font-mono"
            />
          </FormField>
        </div>
        <FormField
          label="Auth Ref"
          description='How auth is resolved, e.g. {"type":"env","key":"ANTHROPIC_API_KEY"}'
        >
          <EnhancedEditableJsonViewer
            data={data.auth_ref}
            title="Auth Ref"
            onChange={(d) =>
              onChange({
                ...data,
                auth_ref: (typeof d === "string" ? {} : d) as Record<
                  string,
                  unknown
                >,
              })
            }
          />
        </FormField>
      </div>

      {/* Behavior */}
      <div className="space-y-3">
        <SectionHeader label="Behavior" />
        <FormField
          label="Controls"
          description="Same control-schema shape as the model registry's controls"
        >
          <EnhancedEditableJsonViewer
            data={data.controls}
            title="Controls"
            onChange={(d) =>
              onChange({
                ...data,
                controls: (typeof d === "string" ? {} : d) as Record<
                  string,
                  unknown
                >,
              })
            }
          />
        </FormField>
        <FormField
          label="Request Defaults"
          description="Default request body overrides"
        >
          <EnhancedEditableJsonViewer
            data={data.request_defaults}
            title="Request Defaults"
            onChange={(d) =>
              onChange({
                ...data,
                request_defaults: (typeof d === "string" ? {} : d) as Record<
                  string,
                  unknown
                >,
              })
            }
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3 items-end">
          <FormField label="Priority">
            <Input
              type="number"
              value={data.priority}
              onChange={set("priority")}
              placeholder="100"
              className="h-8 text-sm"
            />
          </FormField>
          <div className="flex items-center gap-2 h-8">
            <Switch
              checked={!!data.is_active}
              onCheckedChange={toggle("is_active")}
              id="is_active"
            />
            <Label htmlFor="is_active" className="text-sm cursor-pointer">
              Active
            </Label>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="space-y-3">
        <SectionHeader label="Meta" />
        <FormField label="Notes">
          <Textarea
            value={data.notes}
            onChange={set("notes")}
            placeholder="Internal notes about this service"
            className="text-sm min-h-[72px] resize-none"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3 items-start">
          <FormField label="Visibility">
            <Select
              value={data.visibility}
              onValueChange={(v) =>
                onChange({
                  ...data,
                  visibility: v as ServiceFormData["visibility"],
                })
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
                Not a system service
              </span>
            )}
          </FormField>
        </div>
      </div>
    </div>
  );
}
