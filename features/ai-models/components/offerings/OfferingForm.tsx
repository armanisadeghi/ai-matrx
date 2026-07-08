"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EnhancedEditableJsonViewer } from "@/components/ui/JsonComponents/JsonEditor";
import ModelPricingEditor from "@/features/ai-models/components/ModelPricingEditor";
import type { AiModel, AiOfferingFormData, AiService } from "../../types";

interface OfferingFormProps {
  data: AiOfferingFormData;
  models: AiModel[];
  services: AiService[];
  onChange: (data: AiOfferingFormData) => void;
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

export default function OfferingForm({
  data,
  models,
  services,
  onChange,
}: OfferingFormProps) {
  const set =
    <K extends keyof AiOfferingFormData>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...data, [key]: e.target.value });

  // Models grouped by provider text — same pattern as AiModelForm's fallback groups.
  const modelGroups = React.useMemo(() => {
    const groups: Record<string, AiModel[]> = {};
    for (const m of models) {
      if (m.is_deprecated) continue;
      const key = m.provider || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) =>
        (a.common_name || a.name || "").localeCompare(
          b.common_name || b.name || "",
        ),
      );
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [models]);

  const selectedModel = models.find((m) => m.id === data.model_id);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Model" required>
          <Select
            value={data.model_id || undefined}
            onValueChange={(v) => onChange({ ...data, model_id: v })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select model..." />
            </SelectTrigger>
            <SelectContent>
              {modelGroups.map(([provider, group]) => (
                <SelectGroup key={provider}>
                  <SelectLabel>{provider}</SelectLabel>
                  {group.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.common_name || m.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Service" required description="The callable route this offering serves through">
          <Select
            value={data.service_id || undefined}
            onValueChange={(v) => onChange({ ...data, service_id: v })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select service..." />
            </SelectTrigger>
            <SelectContent>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField
        label="Provider Model ID"
        required
        description="The exact model string this service expects on the wire (e.g. claude-sonnet-4-6-20260115)"
      >
        <Input
          value={data.provider_model_id}
          onChange={set("provider_model_id")}
          placeholder="e.g. claude-sonnet-4-6-20260115"
          className="h-8 text-sm font-mono"
        />
      </FormField>

      <div className="grid grid-cols-3 gap-3">
        <FormField label="Priority" description="Lower = preferred">
          <Input
            type="number"
            value={data.priority}
            onChange={set("priority")}
            className="h-8 text-sm"
          />
        </FormField>
        <FormField label="Usage Basis" description="Billing unit override (blank = standard $/1M-token)">
          <Input
            value={data.usage_basis}
            onChange={set("usage_basis")}
            placeholder="e.g. per_image"
            className="h-8 text-sm"
          />
        </FormField>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Available
          </Label>
          <div className="h-8 flex items-center">
            <Switch
              checked={data.is_available}
              onCheckedChange={(v) => onChange({ ...data, is_available: v })}
            />
          </div>
        </div>
      </div>

      <div className="border rounded-md p-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Pricing (per-service override)
        </p>
        <ModelPricingEditor
          tiers={data.pricing}
          model={selectedModel}
          onChange={(tiers) => onChange({ ...data, pricing: tiers })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Capabilities Override
        </Label>
        <EnhancedEditableJsonViewer
          data={data.capabilities_override}
          onChange={(v) =>
            onChange({
              ...data,
              capabilities_override: v as Record<string, unknown>,
            })
          }
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Controls Override
        </Label>
        <EnhancedEditableJsonViewer
          data={data.controls_override}
          onChange={(v) =>
            onChange({
              ...data,
              controls_override: v as Record<string, unknown>,
            })
          }
        />
      </div>

      <FormField label="Notes">
        <textarea
          value={data.notes}
          onChange={set("notes")}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </FormField>
    </div>
  );
}
