import type {
  VariableResourceContextConfig,
  VariableResourcePromotion,
} from "@/features/agents/types/agent-definition.types";

export const MAX_RESOURCE_PROMOTIONS = 3;
export const DEFAULT_PROMOTION_CHARS = 5_000;
export const MAX_PROMOTION_CHARS = 10_000;

function uniqueNormalized(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)),
  );
}

export function normalizeResourceFamilyPolicy(
  value: VariableResourceContextConfig | undefined,
): VariableResourceContextConfig {
  const seen = new Set<string>();
  const promote = (value?.promote ?? [])
    .filter((item) => {
      const key = item.representation.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_RESOURCE_PROMOTIONS)
    .map((item) => ({
      representation: item.representation.trim().toLowerCase(),
      max_chars: Math.max(
        1,
        Math.min(MAX_PROMOTION_CHARS, item.max_chars ?? DEFAULT_PROMOTION_CHARS),
      ),
    }));
  return {
    ...(promote.length ? { promote } : {}),
    ...(value?.exclude?.length
      ? {
          exclude: uniqueNormalized(value.exclude).filter(
            (representation) => !seen.has(representation),
          ),
        }
      : {}),
  };
}

export function setFamilyRepresentationEnabled(
  value: VariableResourceContextConfig | undefined,
  representation: string,
  enabled: boolean,
): VariableResourceContextConfig {
  const policy = normalizeResourceFamilyPolicy(value);
  const key = representation.trim().toLowerCase();
  const exclude = new Set(policy.exclude ?? []);
  if (enabled) exclude.delete(key);
  else exclude.add(key);
  const promote = enabled
    ? policy.promote
    : policy.promote?.filter((item) => item.representation !== key);
  return normalizeResourceFamilyPolicy({ promote, exclude: Array.from(exclude) });
}

export function addFamilyPromotion(
  value: VariableResourceContextConfig | undefined,
  representation: string,
): VariableResourceContextConfig {
  const policy = normalizeResourceFamilyPolicy(value);
  const key = representation.trim().toLowerCase();
  if (!key || (policy.promote?.length ?? 0) >= MAX_RESOURCE_PROMOTIONS) {
    return policy;
  }
  return normalizeResourceFamilyPolicy({
    ...policy,
    exclude: policy.exclude?.filter((item) => item !== key),
    promote: [
      ...(policy.promote ?? []).filter((item) => item.representation !== key),
      { representation: key, max_chars: DEFAULT_PROMOTION_CHARS },
    ],
  });
}

export function updateFamilyPromotion(
  value: VariableResourceContextConfig | undefined,
  index: number,
  update: Partial<VariableResourcePromotion>,
): VariableResourceContextConfig {
  const policy = normalizeResourceFamilyPolicy(value);
  const promote = [...(policy.promote ?? [])];
  if (!promote[index]) return policy;
  promote[index] = { ...promote[index], ...update };
  const representation = promote[index].representation.trim().toLowerCase();
  return normalizeResourceFamilyPolicy({
    ...policy,
    exclude: policy.exclude?.filter((item) => item !== representation),
    promote,
  });
}

export function removeFamilyPromotion(
  value: VariableResourceContextConfig | undefined,
  index: number,
): VariableResourceContextConfig {
  const policy = normalizeResourceFamilyPolicy(value);
  return normalizeResourceFamilyPolicy({
    ...policy,
    promote: policy.promote?.filter((_, itemIndex) => itemIndex !== index),
  });
}
