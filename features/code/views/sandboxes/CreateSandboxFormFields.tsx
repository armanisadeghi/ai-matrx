"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckIcon } from "@radix-ui/react-icons";
import { AlertCircle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { TIER_GUIDANCE, type UseSandboxCreateReturn } from "./useSandboxCreate";
import type { SandboxTier } from "@/types/sandbox";

interface CreateSandboxFormFieldsProps {
  /** State + handlers from `useSandboxCreate`. */
  form: UseSandboxCreateReturn;
  /** Disable every field (e.g. while a create call is in flight). */
  disabled?: boolean;
  /** Optional submit-time error to render alongside the template-fetch error. */
  submitError?: string | null;
  /** Slot rendered after the template picker — surfaces use this for TTL. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Shared "tier + template" form for any create-sandbox UI. Renders the tier
 * picker, the multi-line template select, and any submit/template errors.
 *
 * TTL and resource overrides are intentionally out of scope here — the modal
 * uses a free-form minutes input + a hosted-only resources panel, while the
 * `/sandbox` page uses an hour-preset picker. Surfaces compose those bits in
 * via the `children` slot or alongside this component.
 */
export const CreateSandboxFormFields: React.FC<
  CreateSandboxFormFieldsProps
> = ({ form, disabled, submitError, children, className }) => {
  const {
    tier,
    setTier,
    templateId,
    setTemplateId,
    templateVersion,
    templates,
    loadingTemplates,
    templateError,
  } = form;

  const error = submitError || templateError;
  const fieldsDisabled = disabled || loadingTemplates;

  const selectedTemplate = templates?.find((t) => t.id === templateId);

  return (
    <div className={cn("space-y-4", className)}>
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Tier</Label>
        <ToggleGroup
          type="single"
          value={tier}
          onValueChange={(value) => {
            if (value) setTier(value as SandboxTier);
          }}
          disabled={disabled}
          className="justify-start gap-1"
        >
          <ToggleGroupItem
            value="ec2"
            aria-label="EC2 (retained home)"
            className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            EC2 (retained home)
          </ToggleGroupItem>
          <ToggleGroupItem
            value="hosted"
            aria-label="Hosted (heavy)"
            className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            Hosted (heavy)
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs leading-snug text-muted-foreground">
          {TIER_GUIDANCE[tier]}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Template</Label>
        <Select
          value={templateId}
          onValueChange={setTemplateId}
          disabled={fieldsDisabled}
        >
          <SelectTrigger className="h-auto min-h-9 py-1.5">
            {loadingTemplates ? (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading templates…
              </span>
            ) : (
              <SelectValue placeholder="Select a template">
                <TemplateTriggerContent
                  id={templateId}
                  version={selectedTemplate?.version ?? templateVersion}
                />
              </SelectValue>
            )}
          </SelectTrigger>
          <SelectContent className="max-w-[var(--radix-select-trigger-width)]">
            {(templates ?? []).map((t) => (
              <MultilineTemplateItem
                key={`${t.id}@${t.version}`}
                value={t.id}
                id={t.id}
                version={t.version}
                description={t.description}
              />
            ))}
            {(!templates || templates.length === 0) && (
              <MultilineTemplateItem
                value="bare"
                id="bare"
                version=""
                description="Default sandbox"
              />
            )}
          </SelectContent>
        </Select>
      </div>

      {children}
    </div>
  );
};

/**
 * Trigger label — single-line, version pill on the right. The parent
 * `SelectTrigger` already applies `[&>span]:line-clamp-1`, so this stays
 * tidy even when an id is unexpectedly long.
 */
const TemplateTriggerContent: React.FC<{
  id: string;
  version?: string | null;
}> = ({ id, version }) => (
  <span className="flex w-full items-center gap-2">
    <span className="truncate font-medium">{id}</span>
    {version ? (
      <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        v{version}
      </span>
    ) : null}
  </span>
);

/**
 * Multi-line dropdown row for a sandbox template. We bypass the global
 * `SelectItem` because that wrapper puts every child inside
 * `SelectPrimitive.ItemText`, which means whatever renders in the row also
 * renders inside the trigger's `SelectValue` — and we want descriptions to
 * wrap freely in the dropdown but NOT pollute the trigger.
 *
 * Solution: only the id goes in `ItemText`; the version + description live
 * outside it. The trigger reads `ItemText`, so it gets the clean single-line
 * label. The dropdown row gets the full multi-line card.
 */
interface MultilineTemplateItemProps extends Omit<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>,
  "children"
> {
  id: string;
  version: string;
  description: string;
}

const MultilineTemplateItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  MultilineTemplateItemProps
>(({ id, version, description, className, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none flex-col gap-0.5 rounded-sm py-2 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    textValue={id}
    {...props}
  >
    <span className="absolute right-2 top-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <CheckIcon className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <div className="flex items-center gap-2">
      <SelectPrimitive.ItemText asChild>
        <span className="truncate font-medium">{id}</span>
      </SelectPrimitive.ItemText>
      {version ? (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          v{version}
        </span>
      ) : null}
    </div>

    {description ? (
      <span className="whitespace-normal break-words text-xs leading-snug text-muted-foreground">
        {description}
      </span>
    ) : null}
  </SelectPrimitive.Item>
));
MultilineTemplateItem.displayName = "MultilineTemplateItem";
