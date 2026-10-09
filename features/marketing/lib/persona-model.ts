/** Pure persona model (`web.brand_persona`) — no React, no data access. */

import { brandKindCopy } from "@/features/marketing/lib/brand-kind";
import type { Json } from "@/types/database.types";

export interface PersonaDemographics {
  age_range?: string;
  location?: string;
  job_titles?: string;
  income?: string;
  company_size?: string;
  life_stage?: string;
  interests?: string;
  platforms?: string;
}

export const PERSONA_DEMOGRAPHIC_FIELDS: ReadonlyArray<{
  key: keyof PersonaDemographics;
  label: string;
  placeholder: string;
}> = [
  { key: "age_range", label: "Age range", placeholder: "35-55" },
  { key: "location", label: "Location", placeholder: "Orange County, CA" },
  { key: "job_titles", label: "Job titles", placeholder: "IT director, office manager" },
  { key: "income", label: "Income", placeholder: "$90k-$140k" },
  { key: "company_size", label: "Company size", placeholder: "50-500 employees" },
  { key: "life_stage", label: "Life stage", placeholder: "New parent, college, retired" },
  { key: "interests", label: "Interests", placeholder: "Strength training, nutrition" },
  { key: "platforms", label: "Follows on", placeholder: "Instagram, YouTube" },
];

/** The fields the editor shows for a brand kind (brand-kind.ts decides which). */
export function personaFieldsFor(kind: string | null | undefined) {
  const keys = brandKindCopy(kind).audience.fields;
  return keys
    .map((key) => PERSONA_DEMOGRAPHIC_FIELDS.find((f) => f.key === key))
    .filter((f): f is (typeof PERSONA_DEMOGRAPHIC_FIELDS)[number] => Boolean(f));
}

export interface BrandPersona {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  summary: string | null;
  demographics: Json;
  goals: string[];
  pain_points: string[];
  objections: string[];
  channels: string[];
  is_primary: boolean;
  sort: number;
  version: number;
}

export interface BrandPersonaValues {
  name: string;
  summary: string;
  demographics: PersonaDemographics;
  goals: string[];
  pain_points: string[];
  objections: string[];
  channels: string[];
  is_primary: boolean;
}

export function personaDemographics(persona: Pick<BrandPersona, "demographics">): PersonaDemographics {
  const raw = persona.demographics;
  const out: PersonaDemographics = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const field of PERSONA_DEMOGRAPHIC_FIELDS) {
      const value = (raw as Record<string, Json>)[field.key];
      if (typeof value === "string" && value.trim()) out[field.key] = value.trim();
      else if (Array.isArray(value)) {
        const joined = value.filter((v) => typeof v === "string").join(", ");
        if (joined) out[field.key] = joined;
      }
    }
  }
  return out;
}

