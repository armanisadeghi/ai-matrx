"use client";

import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VariableResourceContextConfig } from "@/features/agents/types/agent-definition.types";
import { useFileResourceFamily } from "@/features/files/hooks/useFileResourceFamily";
import { cn } from "@/lib/utils";
import {
  addFamilyPromotion,
  MAX_RESOURCE_PROMOTIONS,
  normalizeResourceFamilyPolicy,
  removeFamilyPromotion,
  setFamilyRepresentationEnabled,
  updateFamilyPromotion,
} from "@/features/agents/components/inputs/resources/resource-family-policy";

interface ResourceFamilyPolicyEditorProps {
  fileId: string | null;
  value?: VariableResourceContextConfig;
  onChange?: (value: VariableResourceContextConfig) => void;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
}

export function ResourceFamilyPolicyEditor({
  fileId,
  value,
  onChange,
  compact = false,
  className,
  disabled = false,
}: ResourceFamilyPolicyEditorProps) {
  const family = useFileResourceFamily(fileId);
  const policy = normalizeResourceFamilyPolicy(value);
  const readonly = disabled || !onChange;
  const promotions = policy.promote ?? [];
  const promotable = family.data?.representations.filter((item) => item.promotable) ?? [];
  const nextPromotion = promotable.find(
    (item) => !promotions.some((promotion) => promotion.representation === item.key),
  );
  const unavailableExclusions = (policy.exclude ?? []).filter(
    (key) => !family.data?.representations.some((item) => item.key === key),
  );

  const emit = (next: VariableResourceContextConfig) => onChange?.(next);

  if (!fileId) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Resource family
        </Label>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          Every existing derivative is available on demand by default. Inline
          previews and exclusions affect context only; they never generate content.
        </p>
      </div>

      {family.loading ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading family inventory…
        </div>
      ) : null}
      {family.error ? <p className="text-xs text-destructive">{family.error}</p> : null}

      {family.data ? (
        <>
          <div className="grid gap-1.5 rounded-md border border-border/60 p-2 sm:grid-cols-2">
            {family.data.representations.map((item) => {
              const enabled = !(policy.exclude ?? []).includes(item.key);
              return (
                <label key={item.key} className="flex items-start gap-2 text-xs">
                  <Checkbox
                    checked={enabled}
                    disabled={readonly}
                    onCheckedChange={(checked) =>
                      emit(
                        setFamilyRepresentationEnabled(
                          policy,
                          item.key,
                          checked === true,
                        ),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{item.label}</span>
                    <span className="text-muted-foreground">
                      {item.count} · {item.category} · {item.fetch_tool}
                    </span>
                  </span>
                </label>
              );
            })}
            {unavailableExclusions.map((key) => (
              <label key={key} className="flex items-start gap-2 text-xs">
                <Checkbox
                  checked={false}
                  disabled={readonly}
                  onCheckedChange={(checked) =>
                    emit(
                      setFamilyRepresentationEnabled(
                        policy,
                        key,
                        checked === true,
                      ),
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="block font-medium">{key}</span>
                  <span className="text-muted-foreground">
                    Configured exclusion · currently unavailable
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">
                Inline previews ({promotions.length}/{MAX_RESOURCE_PROMOTIONS})
              </Label>
              {!readonly && nextPromotion && promotions.length < MAX_RESOURCE_PROMOTIONS ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => emit(addFamilyPromotion(policy, nextPromotion.key))}
                >
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              ) : null}
            </div>
            {promotions.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/60 px-2 py-1.5 text-[11px] text-muted-foreground">
                Nothing is copied inline; the agent reads only what it needs.
              </p>
            ) : (
              promotions.map((promotion, index) => (
                <div
                  key={`${promotion.representation}:${index}`}
                  className={cn(
                    "grid items-center gap-1.5",
                    compact ? "grid-cols-[1fr_5.5rem_auto]" : "grid-cols-[1fr_7rem_auto]",
                  )}
                >
                  <Select
                    value={promotion.representation}
                    disabled={readonly}
                    onValueChange={(representation) =>
                      emit(updateFamilyPromotion(policy, index, { representation }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {promotable
                        .filter(
                          (item) =>
                            item.key === promotion.representation ||
                            !promotions.some(
                              (other, otherIndex) =>
                                otherIndex !== index &&
                                other.representation === item.key,
                            ),
                        )
                        .map((item) => (
                        <SelectItem key={item.key} value={item.key}>
                          {item.label} ({item.count})
                        </SelectItem>
                        ))}
                      {!promotable.some(
                        (item) => item.key === promotion.representation,
                      ) ? (
                        <SelectItem value={promotion.representation}>
                          {promotion.representation} (configured)
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    max={10_000}
                    className="h-8 text-xs"
                    aria-label={`Maximum characters for ${promotion.representation}`}
                    disabled={readonly}
                    value={promotion.max_chars ?? 5_000}
                    onChange={(event) =>
                      emit(
                        updateFamilyPromotion(policy, index, {
                          max_chars: Number(event.target.value) || 5_000,
                        }),
                      )
                    }
                  />
                  {!readonly ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Remove ${promotion.representation} preview`}
                      onClick={() => emit(removeFamilyPromotion(policy, index))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>

          {family.data.capabilities.length ? (
            <p className="text-[11px] text-muted-foreground">
              Free tools: {family.data.capabilities.join(", ")}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
