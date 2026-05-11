// features/scheduling/utils/__tests__/validation.test.ts

import {
  contextMatchConfigSchema,
  createTaskFormSchema,
  cronConfigSchema,
  intervalConfigSchema,
  oneShotConfigSchema,
} from "../validation";

describe("trigger config schemas", () => {
  test("one-shot accepts a valid time", () => {
    expect(
      oneShotConfigSchema.safeParse({
        type: "one-shot",
        at: "2026-05-12T15:00:00Z",
      }).success,
    ).toBe(true);
  });

  test("one-shot rejects empty at", () => {
    expect(
      oneShotConfigSchema.safeParse({ type: "one-shot", at: "" }).success,
    ).toBe(false);
  });

  test("interval requires >= 60 seconds", () => {
    expect(
      intervalConfigSchema.safeParse({ type: "interval", every_seconds: 30 })
        .success,
    ).toBe(false);
    expect(
      intervalConfigSchema.safeParse({ type: "interval", every_seconds: 60 })
        .success,
    ).toBe(true);
  });

  test("cron requires expression + tz", () => {
    expect(
      cronConfigSchema.safeParse({
        type: "cron",
        expression: "0 9 * * 1-5",
        tz: "America/Los_Angeles",
      }).success,
    ).toBe(true);
    expect(
      cronConfigSchema.safeParse({ type: "cron", expression: "", tz: "UTC" })
        .success,
    ).toBe(false);
  });

  test("context-match requires at least one criterion", () => {
    expect(
      contextMatchConfigSchema.safeParse({ type: "context-match" }).success,
    ).toBe(false);
    expect(
      contextMatchConfigSchema.safeParse({
        type: "context-match",
        hostname: "github.com",
      }).success,
    ).toBe(true);
  });
});

describe("createTaskFormSchema", () => {
  const VALID_BASE = {
    title: "Test schedule",
    surfaces: ["any"],
    tags: [],
    queue: "default",
    prompt: "Do the thing",
    variables: {},
    authMode: "ask" as const,
    maxRuntimeSeconds: 600,
    maxConcurrent: 1,
    trigger: { type: "interval" as const, every_seconds: 3600 },
  };

  test("happy path passes", () => {
    expect(createTaskFormSchema.safeParse(VALID_BASE).success).toBe(true);
  });

  test("empty title fails", () => {
    expect(
      createTaskFormSchema.safeParse({ ...VALID_BASE, title: "" }).success,
    ).toBe(false);
  });

  test("title too long fails", () => {
    expect(
      createTaskFormSchema.safeParse({
        ...VALID_BASE,
        title: "x".repeat(201),
      }).success,
    ).toBe(false);
  });

  test("prompt too long fails", () => {
    expect(
      createTaskFormSchema.safeParse({
        ...VALID_BASE,
        prompt: "x".repeat(10001),
      }).success,
    ).toBe(false);
  });

  test("empty surfaces fails", () => {
    expect(
      createTaskFormSchema.safeParse({ ...VALID_BASE, surfaces: [] }).success,
    ).toBe(false);
  });

  test("max_runtime out-of-range fails", () => {
    expect(
      createTaskFormSchema.safeParse({
        ...VALID_BASE,
        maxRuntimeSeconds: 1,
      }).success,
    ).toBe(false);
    expect(
      createTaskFormSchema.safeParse({
        ...VALID_BASE,
        maxRuntimeSeconds: 999999,
      }).success,
    ).toBe(false);
  });

  test("invalid trigger config fails", () => {
    expect(
      createTaskFormSchema.safeParse({
        ...VALID_BASE,
        trigger: { type: "interval", every_seconds: 1 },
      }).success,
    ).toBe(false);
  });
});
