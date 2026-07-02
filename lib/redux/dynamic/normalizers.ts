// File Location: lib/redux/normalizers.ts

import { schema, normalize, denormalize } from "normalizr";
import type { FeatureName } from "@/types/reduxTypes";
import * as z from "zod";

export const createFeatureNormalizer = <T extends z.ZodTypeAny>(
  featureName: FeatureName,
) => {
  const featureSchema = new schema.Entity(featureName);

  return {
    normalizeOne: (data: z.infer<T>) => {
      console.log(`--- Start Normalizing One ---`);
      console.log(`Feature: ${featureName}`);
      console.log("Raw data:", data);
      const normalizedData = normalize(data, featureSchema);
      console.log("Normalized data:", normalizedData);
      return normalizedData;
    },

    normalizeMany: (data: z.infer<T>[]) => {
      console.log(`--- Start Normalizing Many ---`);
      console.log(`Feature: ${featureName}`);
      console.log("Raw data:", data);
      const normalizedData = normalize(data, [featureSchema]);
      console.log("Normalized data:", normalizedData);
      return normalizedData;
    },

    denormalizeOne: (featureId: string, features: Record<string, unknown>) => {
      console.log(`--- Start Denormalizing One ---`);
      console.log(`Feature: ${featureName}`);
      console.log("Feature ID:", featureId);
      console.log("Raw features:", features);
      const denormalizedData = denormalize(featureId, featureSchema, {
        [featureName]: features,
      });
      console.log("Denormalized data:", denormalizedData);
      return denormalizedData;
    },

    denormalizeMany: (featureIds: string[], features: Record<string, unknown>) => {
      console.log(`--- Start Denormalizing Many ---`);
      console.log(`Feature: ${featureName}`);
      console.log("Feature IDs:", featureIds);
      console.log("Raw features:", features);
      const denormalizedData = denormalize(featureIds, [featureSchema], {
        [featureName]: features,
      });
      console.log("Denormalized data:", denormalizedData);
      return denormalizedData;
    },
  };
};
