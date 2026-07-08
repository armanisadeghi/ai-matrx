"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  RotateCcw,
  Settings2,
  DollarSign,
  Zap,
  FileText,
} from "lucide-react";
import type { AuditRuleConfig, CapabilityKey } from "./auditTypes";
import {
  DEFAULT_AUDIT_RULES,
  ALL_CAPABILITY_KEYS,
  CAPABILITY_LABELS,
  CAPABILITY_GROUPS,
} from "./auditTypes";

interface AuditRulesConfigProps {
  rules: AuditRuleConfig;
  onChange: (rules: AuditRuleConfig) => void;
}

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b mb-3">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-semibold">{title}</span>
    </div>
  );
}

function RuleSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className="mt-0.5 shrink-0"
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium">{label}</span>
        {description && (
          <span className="text-[11px] text-muted-foreground">
            {description}
          </span>
        )}
      </div>
    </div>
  );
}

function CapabilityCheckbox({
  capKey,
  checked,
  onChange,
}: {
  capKey: CapabilityKey;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="h-3 w-3 shrink-0 rounded-xs [&_svg]:h-2 [&_svg]:w-2"
      />
      <span className="text-[11px]">{CAPABILITY_LABELS[capKey]}</span>
    </label>
  );
}

export default function AuditRulesConfig({
  rules,
  onChange,
}: AuditRulesConfigProps) {
  const set = <K extends keyof AuditRuleConfig>(
    key: K,
    value: AuditRuleConfig[K],
  ) => onChange({ ...rules, [key]: value });

  const toggleRequiredCap = (key: CapabilityKey, required: boolean) => {
    const current = rules.capabilities_required_keys;
    const next = required
      ? [...current, key]
      : current.filter((k) => k !== key);
    set("capabilities_required_keys", next);
  };

  const handleReset = () => onChange(DEFAULT_AUDIT_RULES);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            Audit Rules Configuration
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={handleReset}
        >
          <RotateCcw className="h-3 w-3" />
          Reset Defaults
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Core Fields */}
        <section>
          <SectionHeader
            icon={<FileText className="h-4 w-4" />}
            title="Core Fields"
          />
          <div className="grid grid-cols-2 gap-3">
            <RuleSwitch
              label="Require common_name"
              description="Model must have a human-readable display name"
              checked={rules.require_common_name}
              onChange={(v) => set("require_common_name", v)}
            />
            <RuleSwitch
              label="Require provider"
              description="Model must have a provider string"
              checked={rules.require_provider}
              onChange={(v) => set("require_provider", v)}
            />
            <RuleSwitch
              label="Require model_class"
              description="Model must have a class (e.g. chat, image)"
              checked={rules.require_model_class}
              onChange={(v) => set("require_model_class", v)}
            />
            <RuleSwitch
              label="Require context_window"
              description="Model must have a context window value"
              checked={rules.require_context_window}
              onChange={(v) => set("require_context_window", v)}
            />
            <RuleSwitch
              label="Require max_tokens"
              description="Model must have a max output tokens value"
              checked={rules.require_max_tokens}
              onChange={(v) => set("require_max_tokens", v)}
            />
          </div>
        </section>

        {/* Pricing */}
        <section>
          <SectionHeader
            icon={<DollarSign className="h-4 w-4" />}
            title="Pricing"
          />
          <div className="grid grid-cols-2 gap-3">
            <RuleSwitch
              label="Require at least one pricing tier"
              description="Model must have pricing data defined"
              checked={rules.pricing_required}
              onChange={(v) => set("pricing_required", v)}
            />
            <RuleSwitch
              label="Require valid input price"
              description="Each tier must have a non-negative input price"
              checked={rules.pricing_require_input_price}
              onChange={(v) => set("pricing_require_input_price", v)}
            />
            <RuleSwitch
              label="Require valid output price"
              description="Each tier must have a non-negative output price"
              checked={rules.pricing_require_output_price}
              onChange={(v) => set("pricing_require_output_price", v)}
            />
          </div>
        </section>

        {/* Capabilities */}
        <section>
          <SectionHeader
            icon={<Zap className="h-4 w-4" />}
            title="Capabilities"
          />
          <div className="space-y-4">
            <RuleSwitch
              label="Require capabilities object"
              description="Model must have a capabilities object (not null/empty)"
              checked={rules.capabilities_object_required}
              onChange={(v) => set("capabilities_object_required", v)}
            />

            <div className="flex items-center gap-3">
              <Label className="text-xs whitespace-nowrap">
                Minimum capabilities set to true
              </Label>
              <Input
                type="number"
                min={0}
                value={rules.capabilities_min_true}
                onChange={(e) =>
                  set("capabilities_min_true", parseInt(e.target.value) || 0)
                }
                className="h-7 text-xs w-20 font-mono"
              />
              <span className="text-xs text-muted-foreground">
                (0 = no minimum required)
              </span>
            </div>

            <div>
              <Label className="text-xs block mb-2">
                Required capabilities (must be set to true)
              </Label>
              <div className="border rounded-md p-3 space-y-3">
                {Object.entries(CAPABILITY_GROUPS).map(([groupName, keys]) => (
                  <div key={groupName}>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      {groupName}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {keys.map((k) => (
                        <CapabilityCheckbox
                          key={k}
                          capKey={k as CapabilityKey}
                          checked={rules.capabilities_required_keys.includes(
                            k as CapabilityKey,
                          )}
                          onChange={(v) =>
                            toggleRequiredCap(k as CapabilityKey, v)
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {rules.capabilities_required_keys.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {rules.capabilities_required_keys.length} required:{" "}
                  {rules.capabilities_required_keys
                    .map((k) => CAPABILITY_LABELS[k])
                    .join(", ")}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
