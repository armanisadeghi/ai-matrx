"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import { KIND_KEY, type FieldSchema, type KindSchema } from "./kind-schemas";
import type { KindStreamEvent } from "./kind-stream-parser";
import { eventPathKey, pathLabel } from "./validation-report";

type JsonPath = Array<string | number>;

export type LiveBlockSnapshot = {
  kind: string;
  path: JsonPath;
  value: Record<string, unknown>;
  complete: boolean;
};

export type LiveBlockMount = {
  pathKey: string;
  path: JsonPath;
  kind: string;
};

export function pathIsUnderOrEqual(path: JsonPath, prefix: JsonPath): boolean {
  if (path.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (path[i] !== prefix[i]) return false;
  }
  return true;
}

export function isFlashcardSetChildCardPath(path: JsonPath): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    if (path[i] === "cards" && typeof path[i + 1] === "number") {
      return true;
    }
  }
  return false;
}

export function flashcardSetCardKinds(
  schemas: Record<string, KindSchema> | null,
): string[] {
  const setSchema = schemas?.flashcard_set;
  if (!setSchema) return ["flashcard"];

  const cardsField = setSchema.fields.cards;
  if (cardsField?.type === "array") {
    return cardsField.itemKinds;
  }
  return ["flashcard"];
}

export function buildFakeKindRegistry(
  schemas: Record<string, KindSchema> | null,
): Record<string, string> {
  const registry: Record<string, string> = {
    flashcard_set: "flashcards",
  };
  if (!schemas) return registry;

  for (const kind of Object.keys(schemas)) {
    if (kind === "flashcard_set") continue;
    registry[kind] = kind;
  }
  return registry;
}

export function shouldMountRegisteredBlock(
  kind: string,
  path: JsonPath,
  registry: Record<string, string>,
  cardKinds: string[],
): boolean {
  if (!(kind in registry)) return false;
  if (cardKinds.includes(kind) && isFlashcardSetChildCardPath(path)) {
    return false;
  }
  return true;
}

/** Paths where a registered component owns the UI — parser rows are hidden underneath. */
export function buildSuppressedPathPrefixes(
  events: KindStreamEvent[],
  registry: Record<string, string>,
  cardKinds: string[],
): JsonPath[] {
  const prefixes: JsonPath[] = [];

  for (const event of events) {
    if (event.type !== "kind_identified") continue;
    if (!(event.kind in registry)) continue;

    if (
      shouldMountRegisteredBlock(event.kind, event.path, registry, cardKinds)
    ) {
      prefixes.push(event.path);
      continue;
    }

    if (
      cardKinds.includes(event.kind) &&
      isFlashcardSetChildCardPath(event.path)
    ) {
      prefixes.push(event.path.slice(0, -2));
    }
  }

  return prefixes;
}

export function isParserEventSuppressed(
  event: KindStreamEvent,
  suppressedPrefixes: JsonPath[],
): boolean {
  if (suppressedPrefixes.length === 0) return false;

  if (event.type === "complete") {
    return suppressedPrefixes.some((prefix) => prefix.length === 0);
  }

  if (!("path" in event)) return false;
  const path = event.path ?? [];

  return suppressedPrefixes.some((prefix) => pathIsUnderOrEqual(path, prefix));
}

/** One live component per registered block path (incl. flashcard_set inferred from cards). */
export function collectLiveBlockMounts(
  events: KindStreamEvent[],
  registry: Record<string, string>,
  cardKinds: string[],
): LiveBlockMount[] {
  const mounts = new Map<string, LiveBlockMount>();
  const order: string[] = [];

  const addMount = (path: JsonPath, kind: string) => {
    const pathKey = eventPathKey(path);
    if (mounts.has(pathKey)) return;
    mounts.set(pathKey, { pathKey, path, kind });
    order.push(pathKey);
  };

  for (const event of events) {
    if (event.type !== "kind_identified") continue;
    if (!(event.kind in registry)) continue;

    if (
      shouldMountRegisteredBlock(event.kind, event.path, registry, cardKinds)
    ) {
      addMount(event.path, event.kind);
      continue;
    }

    if (
      cardKinds.includes(event.kind) &&
      isFlashcardSetChildCardPath(event.path)
    ) {
      addMount(event.path.slice(0, -2), "flashcard_set");
    }
  }

  return order.map((key) => mounts.get(key)!);
}

export function buildLiveBlockSnapshots(
  events: KindStreamEvent[],
): Map<string, LiveBlockSnapshot> {
  const snapshots = new Map<string, LiveBlockSnapshot>();

  for (const event of events) {
    if (event.type === "block_snapshot") {
      const pathKey = eventPathKey(event.path);
      snapshots.set(pathKey, {
        kind: event.kind,
        path: event.path,
        value: event.value,
        complete: event.complete,
      });
    }
    if (event.type === "raw_object") {
      snapshots.delete(eventPathKey(event.path));
    }
  }

  return snapshots;
}

function pathPrefixMatch(full: JsonPath, prefix: JsonPath): boolean {
  if (full.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (full[i] !== prefix[i]) return false;
  }
  return true;
}

export function cardIndexUnderSet(
  itemPath: JsonPath,
  setPath: JsonPath,
): number | null {
  if (itemPath.length !== setPath.length + 2) return null;
  if (!pathPrefixMatch(itemPath, setPath)) return null;
  if (itemPath[setPath.length] !== "cards") return null;
  const index = itemPath[setPath.length + 1];
  return typeof index === "number" ? index : null;
}

function snapshotToFlashcardItem(
  snapshot: Record<string, unknown>,
  complete: boolean,
): FlashcardsBlockData["cards"][number] {
  if (typeof snapshot.front !== "string") {
    throw new Error(
      `Flashcard snapshot missing required string field "front".`,
    );
  }

  const rawBack = snapshot.back;
  if (
    rawBack !== undefined &&
    rawBack !== null &&
    typeof rawBack !== "string"
  ) {
    throw new Error(`Flashcard snapshot field "back" must be string or null.`);
  }

  const back =
    typeof rawBack === "string"
      ? rawBack === "" && !complete
        ? null
        : rawBack
      : (rawBack ?? null);

  return { front: snapshot.front, back };
}

/** Live card list from `block_snapshot` events — not `object_complete`. */
export function flashcardServerDataFromEvents(
  events: KindStreamEvent[],
  setPath: JsonPath,
  isRunning: boolean,
  cardKinds: string[],
): FlashcardsBlockData {
  const byIndex = new Map<
    number,
    { value: Record<string, unknown>; complete: boolean }
  >();
  const revoked = new Set<number>();

  for (const event of events) {
    if (event.type === "raw_object") {
      const cardIndex = cardIndexUnderSet(event.path, setPath);
      if (cardIndex !== null) {
        revoked.add(cardIndex);
        byIndex.delete(cardIndex);
      }
      continue;
    }

    if (event.type !== "block_snapshot") continue;
    if (!cardKinds.includes(event.kind)) continue;

    const cardIndex = cardIndexUnderSet(event.path, setPath);
    if (cardIndex === null || revoked.has(cardIndex)) continue;

    byIndex.set(cardIndex, {
      value: event.value,
      complete: event.complete,
    });
  }

  const cards = [...byIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, slot]) => snapshotToFlashcardItem(slot.value, slot.complete));

  const streamComplete = events.some((event) => event.type === "complete");

  return {
    cards,
    isComplete: streamComplete && !isRunning,
  };
}

function assertFieldValue(
  fieldName: string,
  fieldSchema: FieldSchema,
  value: unknown,
): void {
  if (value === null) {
    if (fieldSchema.nullable) return;
    throw new Error(
      `Block snapshot field "${fieldName}" is null but schema is not nullable.`,
    );
  }

  switch (fieldSchema.type) {
    case "string":
      if (typeof value !== "string") {
        throw new Error(
          `Block snapshot field "${fieldName}" must be string, got ${typeof value}.`,
        );
      }
      return;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(
          `Block snapshot field "${fieldName}" must be number, got ${typeof value}.`,
        );
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new Error(
          `Block snapshot field "${fieldName}" must be boolean, got ${typeof value}.`,
        );
      }
      return;
    case "string[]":
    case "number[]":
    case "boolean[]":
    case "array":
      if (!Array.isArray(value)) {
        throw new Error(
          `Block snapshot field "${fieldName}" must be array, got ${typeof value}.`,
        );
      }
      return;
    case "object":
    case "inline_object":
    case "record":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(
          `Block snapshot field "${fieldName}" must be object, got ${typeof value}.`,
        );
      }
      return;
    case "enum":
      if (typeof value !== "string") {
        throw new Error(
          `Block snapshot field "${fieldName}" must be enum string, got ${typeof value}.`,
        );
      }
      return;
    case "union":
      if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        throw new Error(
          `Block snapshot field "${fieldName}" must be union scalar, got ${typeof value}.`,
        );
      }
      return;
    default:
      return;
  }
}

export function assertSnapshotForSchema(
  schema: KindSchema,
  data: Record<string, unknown>,
): void {
  if (data[KIND_KEY] !== schema.kind) {
    throw new Error(
      `Snapshot __kind mismatch: expected "${schema.kind}", got "${String(data[KIND_KEY])}".`,
    );
  }

  for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
    if (!(fieldName in data)) {
      if (fieldSchema.required) {
        throw new Error(
          `Block snapshot missing required field "${fieldName}" for kind "${schema.kind}".`,
        );
      }
      continue;
    }
    assertFieldValue(fieldName, fieldSchema, data[fieldName]);
  }
}

function fieldPreviewValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    return value.length > 80 ? `${value.slice(0, 80)}…` : value || '""';
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value).length} keys}`;
  }
  return String(value);
}

export function DemoTypedBlockStub({
  schema,
  snapshot,
}: {
  schema: KindSchema;
  snapshot: LiveBlockSnapshot;
}) {
  assertSnapshotForSchema(schema, snapshot.value);

  const entries = Object.entries(schema.fields).filter(
    ([name]) => name in snapshot.value,
  );

  return (
    <div className="rounded-lg border border-secondary/40 bg-secondary/5 p-2">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px]">
        <span className="rounded bg-secondary/15 px-1.5 py-0.5 font-semibold uppercase text-secondary">
          registered block
        </span>
        <span className="font-mono font-semibold text-foreground">
          {snapshot.kind}
        </span>
        <span className="text-muted-foreground">
          {pathLabel(snapshot.path)}
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-semibold uppercase",
            snapshot.complete
              ? "bg-success/15 text-success"
              : "bg-warning/15 text-warning",
          )}
        >
          {snapshot.complete ? "complete" : "streaming"}
        </span>
      </div>
      <dl className="space-y-1 font-mono text-[11px]">
        {entries.map(([name, fieldSchema]) => (
          <div key={name} className="flex gap-2 truncate">
            <dt className="shrink-0 font-semibold text-muted-foreground">
              {name}
              {fieldSchema.required ? "*" : ""}:
            </dt>
            <dd className="min-w-0 truncate text-foreground">
              {fieldPreviewValue(snapshot.value[name])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function DemoRegisteredBlockPanel({
  kind,
  path,
  events,
  isRunning,
  schemas,
  registry,
  cardKinds,
  flashcardsBlock,
}: {
  kind: string;
  path: JsonPath;
  events: KindStreamEvent[];
  isRunning: boolean;
  schemas: Record<string, KindSchema>;
  registry: Record<string, string>;
  cardKinds: string[];
  flashcardsBlock: ReactNode;
}) {
  const snapshots = buildLiveBlockSnapshots(events);
  const snapshot = snapshots.get(eventPathKey(path));
  const componentId = registry[kind];

  if (componentId === "flashcards") {
    return <>{flashcardsBlock}</>;
  }

  const schema = schemas[kind];
  if (!schema) {
    throw new Error(`No schema loaded for registered kind "${kind}".`);
  }

  if (!snapshot) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-2 py-3 text-[11px] text-muted-foreground">
        Awaiting first block_snapshot for {kind}…
      </div>
    );
  }

  return <DemoTypedBlockStub schema={schema} snapshot={snapshot} />;
}
