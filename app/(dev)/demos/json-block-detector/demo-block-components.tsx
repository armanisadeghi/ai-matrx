"use client";

import { Suspense, type ComponentType } from "react";
import { Loader2 } from "lucide-react";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import {
  KIND_KEY,
  type FieldSchema,
  type KindSchema,
} from "@/features/content-ir/core/kind-schema.types";
import type { KindStreamEvent } from "@/features/content-ir/core/kind-parser";
import type { IrResidue } from "@/features/content-ir/core/ir-types";
import type { IrTreeNode } from "@/features/content-ir/core/ir-tree";
import { useIrNode } from "@/features/content-ir/react/useIrNode";
import { getParseSession } from "@/features/content-ir/session/session-manager";
import { GenericBlockRenderer } from "./generic-block-renderer";
import { eventPathKey } from "./validation-report";

type JsonPath = Array<string | number>;

export type LiveBlockSnapshot = {
  kind: string;
  path: JsonPath;
  value: Record<string, unknown>;
  residue: IrResidue | null;
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

/** Kinds with a dedicated React component (not the generic renderer). */
export const CUSTOM_BLOCK_COMPONENTS: Record<string, string> = {
  flashcard_set: "flashcards",
};

export function isKnownBlockKind(
  kind: string,
  schemas: Record<string, KindSchema> | null,
): boolean {
  if (kind in CUSTOM_BLOCK_COMPONENTS) return true;
  return schemas != null && kind in schemas;
}

export function buildFakeKindRegistry(
  schemas: Record<string, KindSchema> | null,
): Record<string, string> {
  const registry: Record<string, string> = { ...CUSTOM_BLOCK_COMPONENTS };
  if (!schemas) return registry;

  for (const kind of Object.keys(schemas)) {
    if (kind in registry) continue;
    registry[kind] = "__generic__";
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

/**
 * One live component per registered block path (incl. flashcard_set inferred
 * from cards). Node-driven: O(nodes), never replays the event log.
 */
export function collectLiveBlockMountsFromNodes(
  nodes: IrTreeNode[],
  registry: Record<string, string>,
  cardKinds: string[],
): LiveBlockMount[] {
  const mounts = new Map<string, LiveBlockMount>();
  const order: string[] = [];

  const addMount = (pathKey: string, path: JsonPath, kind: string) => {
    if (mounts.has(pathKey)) return;
    mounts.set(pathKey, { pathKey, path, kind });
    order.push(pathKey);
  };

  for (const node of nodes) {
    if (!(node.kind in registry)) continue;

    if (
      shouldMountRegisteredBlock(node.kind, node.path, registry, cardKinds)
    ) {
      addMount(node.pathKey, node.path, node.kind);
      continue;
    }

    if (
      cardKinds.includes(node.kind) &&
      isFlashcardSetChildCardPath(node.path)
    ) {
      const setPath = node.path.slice(0, -2);
      addMount(eventPathKey(setPath), setPath, "flashcard_set");
    }
  }

  return order.map((key) => mounts.get(key)!);
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

const KNOWN_FLASHCARD_SET_KEYS = new Set([
  "cards",
  "__kind",
  "additionalDetails",
]);

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function snapshotToFlashcardItem(
  snapshot: Record<string, unknown>,
  residue: IrResidue | null,
  complete: boolean,
): FlashcardsBlockData["cards"][number] & Record<string, unknown> {
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

  const card: FlashcardsBlockData["cards"][number] & Record<string, unknown> = {
    front: snapshot.front,
    back,
  };

  const existingAdditionalDetails = snapshot.additionalDetails;
  if (isNonEmptyRecord(existingAdditionalDetails)) {
    card.additionalDetails = existingAdditionalDetails;
  }

  for (const [key, value] of Object.entries(snapshot)) {
    if (key === "front" || key === "back" || key === KIND_KEY) continue;
    if (key === "additionalDetails") continue;
    card[key] = value;
  }

  // Zero data loss: unknown keys ride the residue channel, not the snapshot.
  for (const [key, value] of Object.entries(residue?.extra ?? {})) {
    if (key === "front" || key === "back" || key === "additionalDetails") {
      continue;
    }
    card[key] = value;
  }

  return card;
}

/** Set-level extras from the set node (schema-unknown keys ride residue). */
export function flashcardSetAdditionalDetailsFromNode(
  node: IrTreeNode | null,
): Record<string, unknown> | undefined {
  if (!node) return undefined;

  const merged: Record<string, unknown> = {};
  const existing = node.value.additionalDetails;
  if (isNonEmptyRecord(existing)) {
    Object.assign(merged, existing);
  }

  for (const [key, value] of Object.entries(node.value)) {
    if (KNOWN_FLASHCARD_SET_KEYS.has(key)) continue;
    merged[key] = value;
  }

  for (const [key, value] of Object.entries(node.residue?.extra ?? {})) {
    if (KNOWN_FLASHCARD_SET_KEYS.has(key)) continue;
    merged[key] = value;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Live card list from tree nodes — O(nodes), raw cards already pruned. */
export function flashcardServerDataFromNodes(
  nodes: IrTreeNode[],
  setPath: JsonPath,
  isRunning: boolean,
  cardKinds: string[],
  regionStatus: "streaming" | "complete" | "error",
): FlashcardsBlockData {
  const indexed: Array<{ index: number; node: IrTreeNode }> = [];

  for (const node of nodes) {
    if (!cardKinds.includes(node.kind)) continue;
    const cardIndex = cardIndexUnderSet(node.path, setPath);
    if (cardIndex === null) continue;
    indexed.push({ index: cardIndex, node });
  }

  const cards = indexed
    .sort((left, right) => left.index - right.index)
    .map(({ node }) =>
      snapshotToFlashcardItem(node.value, node.residue, node.complete),
    );

  return {
    cards,
    isComplete: regionStatus === "complete" && !isRunning,
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

export type DemoFlashcardsBlockComponent = ComponentType<{
  serverData?: FlashcardsBlockData;
  additionalDetails?: Record<string, unknown>;
}>;

/**
 * Session-driven block panel. Subscribes to ITS node only — the COW spine
 * means any child update (a card's field arriving) bumps this node's
 * identity, so one subscription covers the whole block. No event replay.
 */
export function DemoRegisteredBlockPanel({
  kind,
  path,
  identity,
  isRunning,
  schemas,
  registry,
  cardKinds,
  FlashcardsBlock,
}: {
  kind: string;
  path: JsonPath;
  identity: string | null;
  isRunning: boolean;
  schemas: Record<string, KindSchema>;
  registry: Record<string, string>;
  cardKinds: string[];
  FlashcardsBlock: DemoFlashcardsBlockComponent;
}) {
  const pathKey = eventPathKey(path);
  const node = useIrNode(identity, pathKey);
  const componentId = registry[kind];

  if (componentId === "flashcards") {
    const session = identity ? getParseSession(identity) : null;
    const serverData = flashcardServerDataFromNodes(
      session?.listNodes() ?? [],
      path,
      isRunning,
      cardKinds,
      session?.status ?? "streaming",
    );

    return (
      <Suspense
        fallback={
          <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-muted/30">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <FlashcardsBlock
          serverData={serverData}
          additionalDetails={flashcardSetAdditionalDetailsFromNode(node)}
        />
      </Suspense>
    );
  }

  const schema = schemas[kind];
  if (!schema) {
    throw new Error(`No schema loaded for registered kind "${kind}".`);
  }

  if (!node) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-2 py-3 text-[11px] text-muted-foreground">
        Awaiting first block_snapshot for {kind}…
      </div>
    );
  }

  return (
    <GenericBlockRenderer
      schema={schema}
      snapshot={{
        kind: node.kind,
        path: node.path,
        value: node.value,
        residue: node.residue,
        complete: node.complete,
      }}
      allSchemas={schemas}
    />
  );
}
