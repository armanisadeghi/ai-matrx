// features/scheduling/utils/validation.ts
//
// Zod schemas for create/edit form submission. Encodes the §7.C "Validation"
// rules from docs/SCHEDULING.md.

import { z } from "zod";
import { SURFACE_VALUES } from "../constants/surfaces";

const MIN_INTERVAL_SECONDS = 60;

export const oneShotConfigSchema = z.object({
  type: z.literal("one-shot"),
  at: z.string().min(1, "Pick a time"),
});

export const intervalConfigSchema = z.object({
  type: z.literal("interval"),
  every_seconds: z
    .number({ message: "Required" })
    .int()
    .min(MIN_INTERVAL_SECONDS, `At least ${MIN_INTERVAL_SECONDS} seconds`),
});

export const heartbeatConfigSchema = z.object({
  type: z.literal("heartbeat"),
  every_seconds: z
    .number({ message: "Required" })
    .int()
    .min(MIN_INTERVAL_SECONDS, `At least ${MIN_INTERVAL_SECONDS} seconds`),
});

export const cronConfigSchema = z.object({
  type: z.literal("cron"),
  expression: z.string().min(1, "Expression required"),
  tz: z.string().min(1, "Timezone required"),
});

export const contextMatchConfigSchema = z
  .object({
    type: z.literal("context-match"),
    kind: z.string().optional(),
    url_pattern: z.string().optional(),
    hostname: z.string().optional(),
  })
  .refine(
    (v) => Boolean(v.kind || v.url_pattern || v.hostname),
    {
      message: "At least one of kind, URL pattern, or hostname is required",
      path: ["kind"],
    },
  );

export const triggerConfigSchema = z.discriminatedUnion("type", [
  oneShotConfigSchema,
  intervalConfigSchema,
  heartbeatConfigSchema,
  cronConfigSchema,
  contextMatchConfigSchema,
]);

export const surfaceSchema = z.enum(SURFACE_VALUES as readonly [string, ...string[]]);

export const createTaskFormSchema = z.object({
  title: z.string().min(1, "Title required").max(200, "Too long"),
  description: z.string().max(2000).optional().nullable(),
  surfaces: z.array(surfaceSchema).min(1, "Pick at least one surface"),
  tags: z.array(z.string()).default([]),
  queue: z.string().default("default"),
  expiresAt: z.string().optional().nullable(),

  agentId: z.string().uuid().optional().nullable(),
  prompt: z.string().min(1, "Prompt required").max(10000, "Too long"),
  variables: z.record(z.string(), z.unknown()).default({}),
  persistentConversationId: z.string().uuid().optional().nullable(),
  authMode: z.enum(["ask", "auto"]).default("ask"),
  maxRuntimeSeconds: z.number().int().min(10).max(86400).default(600),
  maxConcurrent: z.number().int().min(1).max(100).default(1),

  trigger: triggerConfigSchema,
});

export type CreateTaskFormValues = z.infer<typeof createTaskFormSchema>;
