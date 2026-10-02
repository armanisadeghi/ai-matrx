/**
 * capabilities — the curated "what can this AI do for me?" catalog.
 *
 * Consumer-facing. We describe the capability ("Math Whiz") not the model
 * name underneath ("GPT 5.4"). The server gets the model_id; the user sees
 * the label.
 *
 * This file is intentionally hand-maintained — not derived from the full
 * model registry. Only the capabilities we want to sell live here.
 */

import {
  Zap,
  Rocket,
  Hammer,
  Images,
  Calculator,
  Brain,
  type LucideIcon,
} from 'lucide-react';

export interface Capability {
  /** Stable key used in URL / Redux / tests. */
  id: string;
  /** Short consumer name — shown on the card. Never the model name. */
  label: string;
  /** One-line pitch — shown under the label. */
  description: string;
  /** Single word that says *when* you'd pick this, e.g. "Everyday". */
  tagline: string;
  /** Lucide icon. */
  icon: LucideIcon;
  /** Tailwind accent — used for the icon tile + selected ring. */
  accent:
    | 'amber'
    | 'orange'
    | 'blue'
    | 'violet'
    | 'emerald'
    | 'indigo';
  /** Server-side model id. Hidden from the UI — never rendered as text. */
  modelId: string;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'quick',
    label: 'Quick',
    description: 'Fast answers for simple questions.',
    tagline: 'Fastest',
    icon: Zap,
    accent: 'amber',
    modelId: '2d637e2d-4e9f-4490-bae2-5bbdf5eb0ef4',
  },
  {
    id: 'speedy-smart',
    label: 'Speedy & Smart',
    description: 'Fast and thoughtful for everyday chats.',
    tagline: 'Everyday',
    icon: Rocket,
    accent: 'orange',
    modelId: '675497b1-b3a9-449b-aa27-773004c32181',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'A great all-around helper.',
    tagline: 'Most tasks',
    icon: Hammer,
    accent: 'blue',
    modelId: '49848d52-9cc8-4ce4-bacb-32aa2201cd10',
  },
  {
    id: 'pictures',
    label: 'Pictures & Smart',
    description: 'Best for photos, images, and diagrams.',
    tagline: 'Multimodal',
    icon: Images,
    accent: 'violet',
    modelId: '56363cb1-0d87-40b7-8bdc-664901e9f1ef',
  },
  {
    id: 'math',
    label: 'Math Whiz',
    description: 'Best for numbers and calculations.',
    tagline: 'Math & logic',
    icon: Calculator,
    accent: 'emerald',
    modelId: '3fe99fab-882d-4a44-b4c2-5502c1d3fd49',
  },
  {
    id: 'deep-thinker',
    label: 'Deep Thinker',
    description: 'For the hardest problems and coding.',
    tagline: 'Hardest work',
    icon: Brain,
    accent: 'indigo',
    modelId: '2b6c05fe-c3e9-42b0-897c-edf590295141',
  },
] as const;

/** Default selection when the user hasn't picked anything. */
export const DEFAULT_CAPABILITY_ID: Capability['id'] = 'balanced';

export function findCapability(id: string | null | undefined): Capability | undefined {
  if (!id) return undefined;
  return CAPABILITIES.find((c) => c.id === id);
}

// ── Reasoning levels ──────────────────────────────────────────────────────────

export type ReasoningLevelId = 'minimal' | 'low' | 'medium' | 'high' | 'max';

export interface ReasoningLevel {
  id: ReasoningLevelId;
  label: string;
  /** Shown below the slider when this level is selected. */
  hint: string;
}

export const REASONING_LEVELS: readonly ReasoningLevel[] = [
  { id: 'minimal', label: 'Minimal', hint: 'Answer right away — no extra thinking.' },
  { id: 'low', label: 'Low', hint: 'A quick moment of thought.' },
  { id: 'medium', label: 'Medium', hint: 'Balanced thinking — good default.' },
  { id: 'high', label: 'High', hint: 'Think it through carefully.' },
  { id: 'max', label: 'Max', hint: 'Take as long as needed. Slower, smarter.' },
] as const;

export const DEFAULT_REASONING_LEVEL: ReasoningLevelId = 'medium';

export function findReasoningLevel(id: string | null | undefined): ReasoningLevel | undefined {
  if (!id) return undefined;
  return REASONING_LEVELS.find((l) => l.id === id);
}

// ── Accent color map — kept here so components stay pure Tailwind class names ──

/** Resolves accent → Tailwind classes for the icon tile + selected ring. */
export const ACCENT_CLASSES: Record<
  Capability['accent'],
  { tile: string; ringSelected: string; text: string }
> = {
  amber: {
    tile: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    ringSelected: 'ring-amber-500 dark:ring-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
  },
  orange: {
    tile: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
    ringSelected: 'ring-orange-500 dark:ring-orange-400',
    text: 'text-orange-700 dark:text-orange-300',
  },
  blue: {
    tile: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    ringSelected: 'ring-blue-500 dark:ring-blue-400',
    text: 'text-blue-700 dark:text-blue-300',
  },
  violet: {
    tile: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    ringSelected: 'ring-violet-500 dark:ring-violet-400',
    text: 'text-violet-700 dark:text-violet-300',
  },
  emerald: {
    tile: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    ringSelected: 'ring-emerald-500 dark:ring-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  indigo: {
    tile: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    ringSelected: 'ring-indigo-500 dark:ring-indigo-400',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
};
