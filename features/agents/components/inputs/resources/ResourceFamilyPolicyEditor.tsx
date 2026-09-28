"use client";

import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VariableResourceContextConfig } from "@/features/agents/types/agent-definition.types";
import type { DocumentRepresentation } from "@/features/agents/types/instance.types";
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
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  capabilitySentence,
  familyWords,
  PRIMARY_FORM_CHOICES,
} from "@/features/agents/components/inputs/resources/resource-family-words";

interface ResourceFamilyPolicyEditorProps {
  fileId: string | null;
  value?: VariableResourceContextConfig;
  onChange?: (value: VariableResourceContextConfig) => void;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
  primaryRepresentation?: DocumentRepresentation;
  onPrimaryRepresentationChange?: (
    value: DocumentRepresentation | undefined,
  ) => void;
}

export function ResourceFamilyPolicyEditor({
  fileId,
  value,
  onChange,
  compact = false,
  className,
  disabled = false,
  primaryRepresentation,
  onPrimaryRepresentationChange,
}: ResourceFamilyPolicyEditorProps) {
  const family = useFileResourceFamily(fileId);
  const policy = normalizeResourceFamilyPolicy(value);
  const readonly = disabled || !onChange;
  const promotions = policy.promote ?? [];
  const promotable =
    family.data?.representations.filter((item) => item.promotable) ?? [];
  const nextPromotion = promotable.find(
    (item) =>
      !promotions.some((promotion) => promotion.representation === item.key),
  );
  const unavailableExclusions = (policy.exclude ?? []).filter(
    (key) => !family.data?.representations.some((item) => item.key === key),
  );

  const emit = (next: VariableResourceContextConfig) => onChange?.(next);
  const primaryAvailable = (key: DocumentRepresentation) =>
    !family.data ||
    family.data.representations.some(
      (item) => item.key === key && item.count > 0,
    );

  if (!fileId) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-muted-foreground">
          What the AI reads
        </Label>
        <Select
          value={primaryRepresentation ?? "auto"}
          disabled={disabled || !onPrimaryRepresentationChange}
          onValueChange={(value) => {
            if (value === "auto") {
              onPrimaryRepresentationChange?.(undefined);
            } else if (
              value === "clean" ||
              value === "raw" ||
              value === "pdf"
            ) {
              if ((policy.exclude ?? []).includes(value)) {
                emit(setFamilyRepresentationEnabled(policy, value, true));
              }
              onPrimaryRepresentationChange?.(value);
            }
          }}
        >
          <SelectTrigger
            className="h-8 text-xs"
            aria-label="What the AI reads from this file"
          >
            <SelectValue>
              {PRIMARY_FORM_CHOICES.find(
                (choice) => choice.value === (primaryRepresentation ?? "auto"),
              )?.label ?? "Best available"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PRIMARY_FORM_CHOICES.map((choice) => (
              <SelectItem
                key={choice.value}
                value={choice.value}
                disabled={choice.value !== "auto" && !primaryAvailable(choice.value)}
              >
                <span className="block">
                  <span className="block font-medium">{choice.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {choice.value !== "auto" && !primaryAvailable(choice.value)
                      ? `Not made for this file yet. ${choice.detail}`
                      : choice.detail}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border-t border-border/60" />
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">
          Also there if the AI needs it
        </Label>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          Everything already made from this file. The AI looks these up only
          when it needs them, and nothing new is made. Untick anything it
          should leave alone.
        </p>
      </div>

      {family.loading ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Checking what is ready for this file…
        </div>
      ) : null}
      {family.error ? (
        <p className="text-xs text-destructive">{family.error} <ErrorAlchemyMenu error={family.error} /></p>
      ) : null}

      {family.data ? (
        <>
          <div className="grid gap-1.5 rounded-md border border-border/60 p-2 sm:grid-cols-2">
            {family.data.representations.map((item) => {
              const isPrimary = item.key === primaryRepresentation;
              const enabled =
                isPrimary || !(policy.exclude ?? []).includes(item.key);
              return (
                <label
                  key={item.key}
                  className="flex items-start gap-2 text-xs"
                >
                  <Checkbox
                    checked={enabled}
                    disabled={readonly || isPrimary}
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
                    <span className="block font-medium">
                      {familyWords(item.key, item.label, item.count).label}
                    </span>
                    <span className="text-muted-foreground">
                      {isPrimary
                        ? "What the AI reads, above"
                        : familyWords(item.key, item.label, item.count).detail}
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
                  <span className="block font-medium">
                    {familyWords(key, key.replace(/_/g, " "), 0).label}
                  </span>
                  <span className="text-muted-foreground">
                    Turned off earlier · not made for this file yet
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">
                Put a copy right in the message ({promotions.length} of{" "}
                {MAX_RESOURCE_PROMOTIONS})
              </Label>
              {!readonly &&
              nextPromotion &&
              promotions.length < MAX_RESOURCE_PROMOTIONS ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() =>
                    emit(addFamilyPromotion(policy, nextPromotion.key))
                  }
                >
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              ) : null}
            </div>
            {promotions.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/60 px-2 py-1.5 text-[11px] text-muted-foreground">
                Nothing is copied in. The AI looks up only what it needs.
              </p>
            ) : (
              promotions.map((promotion, index) => (
                <div
                  key={`${promotion.representation}:${index}`}
                  className={cn(
                    "grid items-center gap-1.5",
                    compact
                      ? "grid-cols-[1fr_5.5rem_auto]"
                      : "grid-cols-[1fr_7rem_auto]",
                  )}
                >
                  <Select
                    value={promotion.representation}
                    disabled={readonly}
                    onValueChange={(representation) =>
                      emit(
                        updateFamilyPromotion(policy, index, {
                          representation,
                        }),
                      )
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
                            {familyWords(item.key, item.label, item.count).label}
                          </SelectItem>
                        ))}
                      {!promotable.some(
                        (item) => item.key === promotion.representation,
                      ) ? (
                        <SelectItem value={promotion.representation}>
                          {familyWords(
                            promotion.representation,
                            promotion.representation.replace(/_/g, " "),
                            0,
                          ).label}{" "}
                          (chosen earlier)
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    max={10_000}
                    className="h-8 text-xs"
                    aria-label={`Most characters to copy in from ${familyWords(promotion.representation, promotion.representation, 0).label}`}
                    title="Most characters to copy in"
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
                      aria-label={`Stop copying in ${familyWords(promotion.representation, promotion.representation, 0).label}`}
                      onClick={() => emit(removeFamilyPromotion(policy, index))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>

          {capabilitySentence(family.data.capabilities) ? (
            <p className="text-[11px] text-muted-foreground">
              {capabilitySentence(family.data.capabilities)}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
