"use client";

import { AiModelRef } from "@/components/official/entity-ref/AiIdentityRef";
import { cn } from "@/lib/utils";

interface ModelTierIdentity {
  key: string;
  role: string;
  modelId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readModelTierIdentities(value: unknown): ModelTierIdentity[] {
  if (!isRecord(value)) return [];

  const identities: ModelTierIdentity[] = [];
  if (typeof value.default === "string" && value.default.trim()) {
    identities.push({
      key: "default",
      role: "Default",
      modelId: value.default,
    });
  }

  if (isRecord(value.tiers)) {
    for (const [tierKey, rawTier] of Object.entries(value.tiers)) {
      if (!isRecord(rawTier) || typeof rawTier.modelId !== "string") continue;
      const label =
        typeof rawTier.label === "string" && rawTier.label.trim()
          ? rawTier.label
          : tierKey;
      identities.push({
        key: `tier:${tierKey}`,
        role: label,
        modelId: rawTier.modelId,
      });
    }
  }

  return identities;
}

interface ModelTierIdentityListProps {
  value: unknown;
  showId?: boolean;
  disableNavigation?: boolean;
  className?: string;
}

/** Named model identities inside an agent's nested `modelTiers` object. */
export function ModelTierIdentityList({
  value,
  showId = false,
  disableNavigation = false,
  className,
}: ModelTierIdentityListProps) {
  const identities = readModelTierIdentities(value);
  if (identities.length === 0) {
    return <span className="text-muted-foreground">No model tiers</span>;
  }

  return (
    <span className={cn("flex flex-col gap-1.5", className)}>
      {identities.map((identity) => (
        <span
          key={identity.key}
          className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] items-start gap-2"
        >
          <span className="text-muted-foreground">{identity.role}</span>
          <AiModelRef
            modelId={identity.modelId}
            showId={showId}
            showIcon={false}
            disableNavigation={disableNavigation}
          />
        </span>
      ))}
    </span>
  );
}
