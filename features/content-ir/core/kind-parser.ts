/**
 * KindStreamParser — the streaming, schema-validating, __kind-discriminated
 * JSON parser at the heart of content-ir.
 *
 * Frame-stack pushdown parser over JsonStreamTokenizer tokens. Every value is
 * path-addressed; every object resolves a kind against the schema registry;
 * schema-shaped `block_snapshot` events fire on field arrival so renderers
 * get live partials; unknown/invalid structures degrade to `raw_object`
 * instead of failing the stream.
 *
 * The pushdown discipline (commit → descend → never re-ask → backtrack):
 * - SPECULATIVE DESCENT: when a parent field schema predicts a child's kind
 *   ({type:"object", kind} or {type:"array", itemKinds:[K]} with one member),
 *   the child commits to that kind THE INSTANT `{` opens and renders a
 *   placeholder snapshot. `__kind` arrival confirms (no-op), re-tags (allowed
 *   sibling kind), or backtracks to raw (contradiction). An object under a
 *   predicting parent doesn't even need `__kind` — prediction alone types it.
 * - PENDING SCHEMA: an identified kind whose schema isn't loaded holds the
 *   node open (`pending_schema` event, fields keep accumulating), fires the
 *   resolver's cold fetch, and upgrades in place via `notifySchemaArrived` —
 *   even after the node (or the whole region) has closed.
 * - POP-UP-ONE-LEVEL: node-scoped problems (duplicate key, schema violation,
 *   disallowed itemKind) mark THAT node raw and keep parsing the parent.
 *   Only grammar/tokenizer errors are region-fatal — and the host degrades
 *   the region to a plain code block, never the stream.
 */

import { JsonStreamTokenizer, type JsonToken } from "./json-tokenizer";
import type { IrPath, IrResidue } from "./ir-types";
import {
  KIND_KEY,
  isJsonAnyField,
  isScalarArrayType,
  readObjectKind,
  scalarArrayItemType,
  type FieldSchema,
  type KindSchema,
  type RecordValueType,
} from "./kind-schema.types";
import { buildCompliantKindSnapshot } from "./kind-snapshot";

/** Kept as the historical name for the parser's event paths. */
export type JsonPath = IrPath;

/**
 * Schema source abstraction. A plain Record works for static sets; the
 * registry supplies a resolver whose `request` fires a cold fetch and later
 * calls `parser.notifySchemaArrived`.
 */
export interface SchemaResolver {
  get(kind: string): KindSchema | undefined;
  /** Fire-and-forget cold fetch. Absent = static source, unknown kinds go raw. */
  request?(kind: string): void;
}

type ObjectFrame = {
  kind: "object";
  path: JsonPath;
  value: Record<string, unknown>;
  expecting: "keyOrEnd" | "key" | "colon" | "value" | "commaOrEnd";
  currentKey?: string | undefined;
  keyCount: number;
};

type ArrayFrame = {
  kind: "array";
  path: JsonPath;
  value: unknown[];
  expecting: "valueOrEnd" | "value" | "commaOrEnd";
  nextIndex: number;
};

type Frame = ObjectFrame | ArrayFrame;

type SchemaValidationOutcome = {
  error: string | null;
  optionalMissing: string[];
  extraFields: string[];
};

export type KindStreamEvent =
  | {
      type: "kind_identified";
      kind: string;
      path: JsonPath;
      /** True when committed from the parent schema before __kind arrived. */
      speculative?: boolean;
      at: number;
    }
  | { type: "pending_kind"; path: JsonPath; at: number }
  | {
      type: "kind_wait_end";
      path: JsonPath;
      outcome: "identified" | "raw_fallback";
      kind?: string;
      reason?: string;
      at: number;
    }
  | {
      type: "pending_schema";
      kind: string;
      path: JsonPath;
      at: number;
    }
  | {
      type: "field";
      kind: string;
      path: JsonPath;
      key: string;
      value: unknown;
      at: number;
    }
  | { type: "object_start"; path: JsonPath; at: number }
  | {
      type: "object_complete";
      kind: string;
      path: JsonPath;
      value: Record<string, unknown>;
      at: number;
    }
  | {
      type: "raw_object";
      path: JsonPath;
      value: unknown;
      reason: string;
      at: number;
    }
  | {
      type: "optional_field_missing";
      kind: string;
      path: JsonPath;
      field: string;
      at: number;
    }
  | {
      type: "extra_field";
      kind: string;
      path: JsonPath;
      field: string;
      at: number;
    }
  | {
      type: "block_snapshot";
      kind: string;
      path: JsonPath;
      value: Record<string, unknown>;
      residue: IrResidue | null;
      complete: boolean;
      at: number;
    }
  | { type: "array_start"; path: JsonPath; field: string; at: number }
  | { type: "complete"; kind: string; value: unknown; at: number }
  | { type: "error"; reason: string; at: number };

export type KindStreamParserOptions = {
  onEvent: (event: KindStreamEvent) => void;
  schemas: Record<string, KindSchema> | SchemaResolver;
  /**
   * Known-context root prediction (e.g. "this agent's output schema is
   * flashcard_set"). The root commits speculatively at `{` open — the Option-1
   * provenance path for agents whose schemas don't carry __kind yet.
   */
  expectedRootKind?: string;
};

function isSchemaResolver(
  source: Record<string, KindSchema> | SchemaResolver,
): source is SchemaResolver {
  return typeof (source as SchemaResolver).get === "function";
}

function safeCopy<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

export class KindStreamParser {
  private readonly resolver: SchemaResolver;
  private readonly stack: Frame[] = [];
  private readonly objectKinds = new Map<string, string>();
  private readonly inlineSchemas = new Map<
    string,
    Record<string, FieldSchema>
  >();
  private readonly recordSchemas = new Map<string, RecordValueType>();
  private readonly rawObjectPaths = new Set<string>();
  /**
   * Subtrees whose value domain is "any JSON" by schema (`json` / `json[]`
   * fields, `record` with `values:"json"` members). OPAQUE by contract: no
   * kind identification, no pending_kind, no raw_object degradation — unknown
   * structure here is the declared shape, not a failure. Propagates to every
   * descendant compound.
   */
  private readonly opaquePaths = new Set<string>();
  private readonly deferredFields = new Map<
    string,
    Array<{ key: string; value: unknown; at: number }>
  >();
  private readonly awaitingKindPaths = new Set<string>();
  /** Paths whose kind came from parent-schema prediction, unconfirmed so far. */
  private readonly speculativeKinds = new Set<string>();
  /** kind → paths (by key) waiting for the resolver's cold fetch. */
  private readonly pendingSchemaPaths = new Map<string, Map<string, JsonPath>>();
  /** Pending-schema paths whose object already closed. */
  private readonly closedPendingPaths = new Set<string>();
  /** Schemas delivered via notifySchemaArrived (overlay over the resolver). */
  private readonly arrivedSchemas = new Map<string, KindSchema>();

  private tokenizer: JsonStreamTokenizer;
  private root: unknown;
  private rootKind = "";
  private rootDone = false;
  private failed = false;

  constructor(private readonly options: KindStreamParserOptions) {
    this.resolver = isSchemaResolver(options.schemas)
      ? options.schemas
      : {
          get: (kind: string) =>
            (options.schemas as Record<string, KindSchema>)[kind],
        };

    this.tokenizer = new JsonStreamTokenizer((token) =>
      this.handleToken(token),
    );
  }

  push(chunk: string): void {
    if (this.failed || this.rootDone) return;

    try {
      this.tokenizer.push(chunk);
    } catch (error) {
      this.fail(
        error instanceof Error ? error.message : String(error),
        this.tokenizer.position,
      );
    }
  }

  end(): void {
    if (this.failed) return;

    try {
      this.tokenizer.end();
    } catch (error) {
      this.fail(
        error instanceof Error ? error.message : String(error),
        this.tokenizer.position,
      );
      return;
    }

    // The region is over: pending-schema nodes whose cold fetch hasn't
    // answered fall back to raw NOW. This keeps the end-of-region envelope
    // deterministic and byte-identical to the static (no-request) path;
    // upgrade-in-place remains a live-region feature. The data is preserved
    // verbatim on the raw node — zero loss.
    this.resolvePendingSchemasAsRaw();

    if (!this.rootDone) {
      this.fail(
        "Stream ended before the root JSON object was complete.",
        this.tokenizer.position,
      );
    }
  }

  private resolvePendingSchemasAsRaw(): void {
    const at = this.tokenizer.position;
    for (const [kind, paths] of [...this.pendingSchemaPaths]) {
      this.pendingSchemaPaths.delete(kind);
      for (const [pathKey, path] of paths) {
        this.closedPendingPaths.delete(pathKey);
        if (this.rawObjectPaths.has(pathKey)) continue;
        const value =
          this.getLiveObjectValue(path) ??
          this.getFinalizedObjectValue(path) ??
          {};
        this.emitRawObject(
          path,
          safeCopy(value),
          `No block schema registered for "${kind}".`,
          at,
        );
      }
    }
  }

  /** True once the root value has closed — the region is fully consumed. */
  get isComplete(): boolean {
    return this.rootDone;
  }

  get hasFailed(): boolean {
    return this.failed;
  }

  /**
   * Upgrade-in-place: the registry's cold fetch answered. Pending nodes for
   * this kind validate and complete (closed nodes retroactively); a null
   * schema (fetch miss) drops them to raw. Safe to call after end().
   */
  notifySchemaArrived(kind: string, schema: KindSchema | null): void {
    const waiting = this.pendingSchemaPaths.get(kind);
    if (!waiting) return;
    this.pendingSchemaPaths.delete(kind);

    if (schema) {
      this.arrivedSchemas.set(kind, schema);
    }

    const at = this.tokenizer.position;

    for (const [pathKey, path] of waiting) {
      if (this.rawObjectPaths.has(pathKey)) continue;

      const value =
        this.getLiveObjectValue(path) ?? this.getFinalizedObjectValue(path);

      if (!schema) {
        this.emitRawObject(
          path,
          safeCopy(value ?? {}),
          `No block schema registered for "${kind}".`,
          at,
        );
        this.closedPendingPaths.delete(pathKey);
        continue;
      }

      if (this.closedPendingPaths.has(pathKey)) {
        this.closedPendingPaths.delete(pathKey);
        if (value) {
          this.finalizeTypedObject(path, value, at);
        }
      } else {
        // Still streaming — emit the schema-shaped snapshot it was owed.
        this.emitBlockSnapshotForObject(path, at);
      }
    }
  }

  private handleToken(token: JsonToken): void {
    if (this.failed) return;

    if (this.rootDone) {
      this.fail("Unexpected token after complete JSON object.", token.at);
      return;
    }

    if (token.type === "punct") {
      this.handlePunctuation(token);
      return;
    }

    if (token.type === "string") {
      this.handleString(token);
      return;
    }

    this.beginScalar(token.value, token.at);
  }

  private handleString(token: Extract<JsonToken, { type: "string" }>): void {
    const frame = this.currentFrame();

    if (
      frame?.kind === "object" &&
      (frame.expecting === "keyOrEnd" || frame.expecting === "key")
    ) {
      this.acceptObjectKey(frame, token.value, token.at);
      return;
    }

    this.beginScalar(token.value, token.at);
  }

  private handlePunctuation(
    token: Extract<JsonToken, { type: "punct" }>,
  ): void {
    switch (token.value) {
      case "{":
        this.beginCompound("object", token.at);
        return;
      case "[":
        this.beginCompound("array", token.at);
        return;
      case "}":
        this.closeCompound("object", token.at);
        return;
      case "]":
        this.closeCompound("array", token.at);
        return;
      case ":":
        this.acceptColon(token.at);
        return;
      case ",":
        this.acceptComma(token.at);
        return;
    }
  }

  private beginCompound(kind: "object" | "array", at: number): void {
    const value = kind === "object" ? {} : [];
    // The frame this value lands in — read BEFORE placeValue/push mutate it.
    const container = this.currentFrame();
    const path = this.placeValue(value, kind, at, false);
    if (!path || this.failed) return;

    // OPAQUE DESCENT: a compound under a json-any placement (or inside an
    // already-opaque subtree) is schema-legal unknown structure. Mark it and
    // skip ALL kind machinery below.
    const opaque =
      (container !== undefined &&
        this.opaquePaths.has(this.pathKey(container.path))) ||
      this.isJsonAnyPlacement(path);
    if (opaque) this.opaquePaths.add(this.pathKey(path));

    if (kind === "object") {
      this.emit({ type: "object_start", path, at });
      if (opaque) {
        this.stack.push({
          kind: "object",
          path,
          value: value as Record<string, unknown>,
          expecting: "keyOrEnd",
          keyCount: 0,
        });
        return;
      }
      this.registerObjectContext(path);
      const pathKey = this.pathKey(path);

      this.stack.push({
        kind: "object",
        path,
        value: value as Record<string, unknown>,
        expecting: "keyOrEnd",
        keyCount: 0,
      });

      if (this.inlineSchemas.has(pathKey) || this.recordSchemas.has(pathKey)) {
        return;
      }

      // SPECULATIVE DESCENT: commit the predicted kind the instant `{` opens.
      const speculated = this.resolveSpeculativeKind(path);
      if (speculated) {
        this.objectKinds.set(pathKey, speculated);
        this.speculativeKinds.add(pathKey);
        if (path.length === 0) {
          this.rootKind = speculated;
        }
        this.emit({
          type: "kind_identified",
          kind: speculated,
          path,
          speculative: true,
          at,
        });
        this.emitBlockSnapshotForObject(path, at);
        return;
      }

      this.awaitingKindPaths.add(pathKey);
      this.emit({ type: "pending_kind", path, at });
      return;
    }

    const parentField = this.parentFieldName(path);
    if (parentField) {
      this.emit({ type: "array_start", path, field: parentField, at });
    }

    this.stack.push({
      kind: "array",
      path,
      value: value as unknown[],
      expecting: "valueOrEnd",
      nextIndex: 0,
    });
  }

  /**
   * Prediction from the parent schema: object field → declared kind; array
   * item → sole itemKind; root → expectedRootKind. Only when the schema is
   * actually resolvable (a prediction we can't validate against is not a
   * commitment worth making).
   */
  private resolveSpeculativeKind(path: JsonPath): string | null {
    if (path.length === 0) {
      const expected = this.options.expectedRootKind;
      return expected && this.lookupObjectSchema(expected) ? expected : null;
    }

    const last = path[path.length - 1];

    if (typeof last === "string") {
      const fieldSchema = this.resolveParentFieldSchema(path);
      if (
        fieldSchema?.type === "object" &&
        this.lookupObjectSchema(fieldSchema.kind)
      ) {
        return fieldSchema.kind;
      }
      return null;
    }

    // Array item: owner object → field schema → single-member itemKinds.
    const fieldName = this.parentFieldName(path);
    if (!fieldName) return null;

    const ownerPath = path.slice(0, -2);
    const ownerKind = this.getObjectKindForPath(ownerPath);
    if (!ownerKind) return null;

    const fieldSchema = this.lookupSchema(ownerKind)?.fields[fieldName];
    const soleItemKind =
      fieldSchema?.type === "array" && fieldSchema.itemKinds.length === 1
        ? fieldSchema.itemKinds[0]
        : undefined;
    if (soleItemKind !== undefined && this.lookupObjectSchema(soleItemKind)) {
      return soleItemKind;
    }
    return null;
  }

  /**
   * A schema usable for OBJECT speculation/snapshots — root-form kinds
   * (non-object data-only shapes) are never a valid object commitment.
   */
  private lookupObjectSchema(kind: string): KindSchema | undefined {
    const schema = this.lookupSchema(kind);
    return schema && !schema.root ? schema : undefined;
  }

  private beginScalar(value: unknown, at: number): void {
    this.placeValue(value, "scalar", at, true);
  }

  private placeValue(
    value: unknown,
    valueKind: "object" | "array" | "scalar",
    at: number,
    finalizedImmediately: boolean,
  ): JsonPath | null {
    if (this.root === undefined) {
      if (valueKind !== "object") {
        this.fail("Root value must be a JSON object.", at);
        return null;
      }
      this.root = value;
      return [];
    }

    const parent = this.currentFrame();
    if (!parent) {
      this.fail("Unexpected value after root object.", at);
      return null;
    }

    let path: JsonPath;
    let fieldKey: string | undefined;

    if (parent.kind === "object") {
      if (parent.expecting !== "value") {
        this.fail(
          `Unexpected value inside object. Expected ${parent.expecting}.`,
          at,
        );
        return null;
      }
      if (parent.currentKey === undefined) {
        this.fail("Internal parser error: missing object key.", at);
        return null;
      }

      fieldKey = parent.currentKey;
      path = [...parent.path, fieldKey];

      // Node-scoped validation failure → mark the PARENT raw, keep parsing.
      const placementError = this.validateFieldPlacement(
        parent,
        fieldKey,
        valueKind,
        value,
      );
      if (placementError) {
        this.markNodeRaw(parent.path, parent.value, placementError, at);
      }

      parent.value[fieldKey] = value;
      parent.currentKey = undefined;
      parent.expecting = "commaOrEnd";
    } else {
      if (parent.expecting !== "valueOrEnd" && parent.expecting !== "value") {
        this.fail(
          `Unexpected value inside array. Expected ${parent.expecting}.`,
          at,
        );
        return null;
      }

      const index = parent.nextIndex;
      path = [...parent.path, index];
      fieldKey = this.parentFieldName(path);

      parent.value.push(value);
      parent.nextIndex += 1;
      parent.expecting = "commaOrEnd";
    }

    if (finalizedImmediately) {
      this.onValueFinalized(path, value, at);
    }

    return path;
  }

  private acceptObjectKey(frame: ObjectFrame, key: string, at: number): void {
    if (frame.expecting !== "keyOrEnd" && frame.expecting !== "key") {
      this.fail(`Unexpected object key "${key}".`, at);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(frame.value, key)) {
      // Node-scoped: this object goes raw (last-wins semantics), parent lives.
      this.markNodeRaw(
        frame.path,
        frame.value,
        `Duplicate key "${key}".`,
        at,
      );
    }

    frame.currentKey = key;
    frame.keyCount += 1;
    frame.expecting = "colon";
  }

  private acceptColon(at: number): void {
    const frame = this.currentFrame();
    if (!frame || frame.kind !== "object" || frame.expecting !== "colon") {
      this.fail("Unexpected colon.", at);
      return;
    }
    frame.expecting = "value";
  }

  private acceptComma(at: number): void {
    const frame = this.currentFrame();
    if (!frame || frame.expecting !== "commaOrEnd") {
      this.fail("Unexpected comma.", at);
      return;
    }

    if (frame.kind === "object") {
      frame.expecting = "key";
    } else {
      frame.expecting = "value";
    }
  }

  private closeCompound(kind: "object" | "array", at: number): void {
    const frame = this.currentFrame();
    if (!frame || frame.kind !== kind) {
      this.fail(
        `Unexpected closing ${kind === "object" ? "brace" : "bracket"}.`,
        at,
      );
      return;
    }

    if (frame.kind === "object") {
      if (frame.expecting !== "keyOrEnd" && frame.expecting !== "commaOrEnd") {
        this.fail(`Object closed too early. Expected ${frame.expecting}.`, at);
        return;
      }
    } else if (
      frame.expecting !== "valueOrEnd" &&
      frame.expecting !== "commaOrEnd"
    ) {
      this.fail(`Array closed too early. Expected ${frame.expecting}.`, at);
      return;
    }

    this.stack.pop();
    if (this.stack.length === 0) {
      this.rootDone = true;
    }

    this.onValueFinalized(frame.path, frame.value, at);
  }

  /**
   * True when a value placed at `path` sits directly under a json-any
   * placement: a `json`/`json[]` FIELD, or a member of a `record` whose
   * values are `"json"`. (Deeper descendants inherit via `opaquePaths`.)
   */
  private isJsonAnyPlacement(path: JsonPath): boolean {
    const fieldSchema = this.resolveParentFieldSchema(path);
    if (fieldSchema && isJsonAnyField(fieldSchema)) return true;

    const last = path[path.length - 1];
    if (typeof last === "string") {
      const parentKey = this.pathKey(path.slice(0, -1));
      if (this.recordSchemas.get(parentKey) === "json") return true;
    }
    return false;
  }

  private onValueFinalized(path: JsonPath, value: unknown, at: number): void {
    if (this.failed) return;

    const pathKey = this.pathKey(path);

    // Opaque subtree: the value is schema-legal by contract; no kind
    // identification, no snapshots, no raw degradation.
    const parentIsOpaque =
      path.length > 0 && this.opaquePaths.has(this.pathKey(path.slice(0, -1)));
    if (this.opaquePaths.has(pathKey)) {
      // The subtree ROOT sits on a typed parent's json-any field — surface it
      // as an ordinary field event (and parent snapshot) like any scalar.
      if (!parentIsOpaque) this.emitFieldIfReady(path, value, at);
      return;
    }
    if (parentIsOpaque) return;

    if (this.isKindFieldPath(path)) {
      if (typeof value !== "string") {
        return;
      }

      this.onKindDiscriminatorArrived(path.slice(0, -1), value, at);
      return;
    }

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const objectValue = value as Record<string, unknown>;

      const inlineFields = this.inlineSchemas.get(pathKey);
      if (inlineFields) {
        const inlineError = this.validateObjectAgainstFields(
          objectValue,
          inlineFields,
        );
        if (inlineError.error) {
          this.emitRawObject(path, objectValue, inlineError.error, at);
          return;
        }
        this.inlineSchemas.delete(pathKey);
        this.emitSchemaNotices(path, "inline_object", inlineError, at);
        this.emit({
          type: "object_complete",
          kind: "inline_object",
          path,
          value: objectValue,
          at,
        });
      } else {
        const recordValueType = this.recordSchemas.get(pathKey);
        if (recordValueType) {
          const recordError = this.validateRecordObject(
            objectValue,
            recordValueType,
          );
          if (recordError) {
            this.emitRawObject(path, objectValue, recordError, at);
            return;
          }
          this.recordSchemas.delete(pathKey);
          this.emit({
            type: "object_complete",
            kind: "record",
            path,
            value: objectValue,
            at,
          });
        } else {
          this.completeTypedObject(path, objectValue, at);
        }
      }
    }

    this.emitFieldIfReady(path, value, at);

    if (path.length === 0) {
      this.completeRoot(value as Record<string, unknown>, at);
    }
  }

  /** __kind arrived for an object — confirm speculation, identify, or backtrack. */
  private onKindDiscriminatorArrived(
    objectPath: JsonPath,
    kind: string,
    at: number,
  ): void {
    const objectPathKey = this.pathKey(objectPath);

    if (this.rawObjectPaths.has(objectPathKey)) return;

    const prior = this.objectKinds.get(objectPathKey);
    const wasSpeculative = this.speculativeKinds.has(objectPathKey);

    if (prior !== undefined && wasSpeculative) {
      this.speculativeKinds.delete(objectPathKey);

      if (prior === kind) {
        // Confirmation — the commitment was right; nothing to redo.
        this.emitBlockSnapshotForObject(objectPath, at);
        return;
      }

      // Contradiction. Allowed sibling kind (multi-member itemKinds) → re-tag.
      if (
        this.lookupSchema(kind) &&
        this.validateArrayItemKind(objectPath, kind) === null &&
        this.speculativeRetagAllowed(objectPath, kind)
      ) {
        this.objectKinds.set(objectPathKey, kind);
        if (objectPath.length === 0) {
          this.rootKind = kind;
        }
        this.emit({ type: "kind_identified", kind, path: objectPath, at });
        this.emitBlockSnapshotForObject(objectPath, at);
        return;
      }

      // Backtrack: the prediction was wrong and the truth doesn't fit here.
      const live = this.getLiveObjectValue(objectPath);
      this.objectKinds.delete(objectPathKey);
      if (objectPath.length === 0) {
        this.rootKind = "";
      }
      this.emitRawObject(
        objectPath,
        safeCopy(live ?? {}),
        `Speculated kind "${prior}" contradicted by ${KIND_KEY} "${kind}".`,
        at,
      );
      return;
    }

    this.objectKinds.set(objectPathKey, kind);

    this.emit({
      type: "kind_identified",
      kind,
      path: objectPath,
      at,
    });

    this.clearKindWait(objectPath, "identified", at, kind);

    if (objectPath.length === 0) {
      this.rootKind = kind;
    }

    // PENDING SCHEMA: kind known, schema cold — hold and fetch.
    if (!this.lookupSchema(kind) && this.resolver.request) {
      this.addPendingSchemaPath(kind, objectPath);
      this.emit({ type: "pending_schema", kind, path: objectPath, at });
      this.resolver.request(kind);
      return;
    }

    this.flushDeferredFields(objectPath, kind, at);
    this.emitBlockSnapshotForObject(objectPath, at);
  }

  /** A contradicted speculation may re-tag only where the new kind is legal. */
  private speculativeRetagAllowed(path: JsonPath, kind: string): boolean {
    if (path.length === 0) {
      // Root prediction came from external context; any registered kind is a
      // legal correction.
      return true;
    }

    const last = path[path.length - 1];
    if (typeof last === "number") {
      const fieldName = this.parentFieldName(path);
      const ownerKind = this.getObjectKindForPath(path.slice(0, -2));
      if (!fieldName || !ownerKind) return false;
      const fieldSchema = this.lookupSchema(ownerKind)?.fields[fieldName];
      return (
        fieldSchema?.type === "array" && fieldSchema.itemKinds.includes(kind)
      );
    }

    // Declared object fields pin exactly one kind — a different one is a
    // contradiction, not a re-tag.
    return false;
  }

  private addPendingSchemaPath(kind: string, path: JsonPath): void {
    const pathKey = this.pathKey(path);
    const existing = this.pendingSchemaPaths.get(kind) ?? new Map();
    existing.set(pathKey, path);
    this.pendingSchemaPaths.set(kind, existing);
  }

  private completeTypedObject(
    path: JsonPath,
    objectValue: Record<string, unknown>,
    at: number,
  ): void {
    const pathKey = this.pathKey(path);

    // Already backtracked to raw mid-stream — nothing further to claim.
    if (this.rawObjectPaths.has(pathKey)) return;

    const declaredKind = readObjectKind(objectValue);
    const committedKind = this.objectKinds.get(pathKey);

    // Closed while its schema fetch is still in flight — defer finalization.
    if (
      committedKind &&
      this.pendingSchemaPaths.get(committedKind)?.has(pathKey)
    ) {
      this.closedPendingPaths.add(pathKey);
      return;
    }

    // Speculation that never saw __kind: prediction alone types the object.
    if (!declaredKind && committedKind && this.speculativeKinds.has(pathKey)) {
      this.speculativeKinds.delete(pathKey);
      this.finalizeSpeculatedObject(path, objectValue, committedKind, at);
      return;
    }

    if (!declaredKind) {
      this.emitRawObject(
        path,
        objectValue,
        `Object is missing "${KIND_KEY}".`,
        at,
      );
      return;
    }

    this.speculativeKinds.delete(pathKey);
    this.finalizeTypedObject(path, objectValue, at);
  }

  /** Validate + complete an object whose value carries __kind. */
  private finalizeTypedObject(
    path: JsonPath,
    objectValue: Record<string, unknown>,
    at: number,
  ): void {
    const pathKey = this.pathKey(path);
    const kind = readObjectKind(objectValue);

    if (!kind) {
      this.emitRawObject(
        path,
        objectValue,
        `Object is missing "${KIND_KEY}".`,
        at,
      );
      return;
    }

    const schema = this.lookupSchema(kind);
    if (!schema) {
      this.emitRawObject(
        path,
        objectValue,
        `No block schema registered for "${kind}".`,
        at,
      );
      return;
    }

    const arrayItemError = this.validateArrayItemKind(path, kind);
    if (arrayItemError) {
      this.emitRawObject(path, objectValue, arrayItemError, at);
      return;
    }

    const outcome = this.validateObjectAgainstSchema(objectValue, schema);
    if (outcome.error) {
      this.emitRawObject(path, objectValue, outcome.error, at);
      return;
    }

    this.objectKinds.set(pathKey, kind);
    this.emitSchemaNotices(path, kind, outcome, at);
    this.emitBlockSnapshotForObject(path, at, true);
    this.emit({
      type: "object_complete",
      kind,
      path,
      value: objectValue,
      at,
    });
  }

  /** Validate + complete an object typed purely by parent prediction. */
  private finalizeSpeculatedObject(
    path: JsonPath,
    objectValue: Record<string, unknown>,
    kind: string,
    at: number,
  ): void {
    const schema = this.lookupSchema(kind);
    if (!schema) {
      this.emitRawObject(
        path,
        objectValue,
        `No block schema registered for "${kind}".`,
        at,
      );
      return;
    }

    const outcome = this.validateObjectAgainstSchema(
      { ...objectValue, [KIND_KEY]: kind },
      schema,
    );
    if (outcome.error) {
      this.emitRawObject(path, objectValue, outcome.error, at);
      return;
    }

    this.emitSchemaNotices(path, kind, outcome, at);
    this.emitBlockSnapshotForObject(path, at, true);
    this.emit({
      type: "object_complete",
      kind,
      path,
      value: objectValue,
      at,
    });
  }

  private validateArrayItemKind(path: JsonPath, kind: string): string | null {
    const last = path[path.length - 1];
    if (typeof last !== "number") return null;

    const fieldName = this.parentFieldName(path);
    if (!fieldName) return null;

    const ownerObjectPath = path.slice(0, -2);
    const parentKind = this.getObjectKindForPath(ownerObjectPath);
    if (!parentKind) return null;

    const fieldSchema = this.lookupSchema(parentKind)?.fields[fieldName];
    if (!fieldSchema || fieldSchema.type !== "array") return null;

    if (!fieldSchema.itemKinds.includes(kind)) {
      return `Kind "${kind}" is not allowed in "${fieldName}" on "${parentKind}" (expected one of: ${fieldSchema.itemKinds.join(", ")}).`;
    }

    return null;
  }

  private completeRoot(rootObject: Record<string, unknown>, at: number): void {
    const pathKey = this.pathKey([]);

    if (this.rawObjectPaths.has(pathKey)) {
      this.emit({
        type: "complete",
        kind: readObjectKind(rootObject) ?? "",
        value: rootObject,
        at,
      });
      return;
    }

    // Root closed while its schema fetch is in flight — completeTypedObject
    // already recorded the deferral; report the committed kind.
    const committedKind = this.objectKinds.get(pathKey);
    if (
      committedKind &&
      this.pendingSchemaPaths.get(committedKind)?.has(pathKey)
    ) {
      this.emit({
        type: "complete",
        kind: committedKind,
        value: rootObject,
        at,
      });
      return;
    }

    this.emit({
      type: "complete",
      kind: this.objectKinds.get(pathKey) ?? readObjectKind(rootObject) ?? "",
      value: rootObject,
      at,
    });
  }

  /** Mark a node raw (node-scoped failure) without killing the stream. */
  private markNodeRaw(
    path: JsonPath,
    liveValue: unknown,
    reason: string,
    at: number,
  ): void {
    const pathKey = this.pathKey(path);
    if (this.rawObjectPaths.has(pathKey)) return;

    this.speculativeKinds.delete(pathKey);
    this.emitRawObject(path, safeCopy(liveValue), reason, at);
  }

  private emitRawObject(
    path: JsonPath,
    value: unknown,
    reason: string,
    at: number,
  ): void {
    const pathKey = this.pathKey(path);
    if (this.rawObjectPaths.has(pathKey)) return;

    this.rawObjectPaths.add(pathKey);
    this.clearKindWait(path, "raw_fallback", at, undefined, reason);
    this.emit({
      type: "raw_object",
      path,
      value,
      reason,
      at,
    });
  }

  private clearKindWait(
    path: JsonPath,
    outcome: "identified" | "raw_fallback",
    at: number,
    kind?: string,
    reason?: string,
  ): void {
    const pathKey = this.pathKey(path);
    if (!this.awaitingKindPaths.has(pathKey)) return;

    this.awaitingKindPaths.delete(pathKey);
    this.emit({
      type: "kind_wait_end",
      path,
      outcome,
      ...(kind !== undefined && { kind }),
      ...(reason !== undefined && { reason }),
      at,
    });
  }

  private emitFieldIfReady(path: JsonPath, value: unknown, at: number): void {
    const fieldKey = this.fieldKeyFromPath(path);
    if (!fieldKey || fieldKey === KIND_KEY) return;

    const parentPath = path.slice(0, -1);
    const objectKind = this.getDirectObjectKind(parentPath);
    if (!objectKind) {
      const parentPathKey = this.pathKey(parentPath);
      const deferred = this.deferredFields.get(parentPathKey) ?? [];
      deferred.push({ key: fieldKey, value, at });
      this.deferredFields.set(parentPathKey, deferred);
      return;
    }

    if (!this.isAllowedSchemaField(parentPath, fieldKey, objectKind)) {
      return;
    }

    this.emit({
      type: "field",
      kind: objectKind,
      path,
      key: fieldKey,
      value,
      at,
    });

    this.emitBlockSnapshotForObject(parentPath, at);
  }

  private flushDeferredFields(
    objectPath: JsonPath,
    kind: string,
    at: number,
  ): void {
    const pathKey = this.pathKey(objectPath);
    const deferred = this.deferredFields.get(pathKey);
    if (!deferred) return;

    for (const entry of deferred) {
      if (entry.key === KIND_KEY) continue;
      if (!this.isAllowedSchemaField(objectPath, entry.key, kind)) continue;

      this.emit({
        type: "field",
        kind,
        path: [...objectPath, entry.key],
        key: entry.key,
        value: entry.value,
        at: entry.at,
      });
    }

    this.deferredFields.delete(pathKey);
    this.emitBlockSnapshotForObject(objectPath, at);
  }

  private getLiveObjectValue(path: JsonPath): Record<string, unknown> | null {
    const pathKey = this.pathKey(path);
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const frame = this.stack[i];
      // `i` ranges over [0, stack.length) by construction, so `frame` is
      // always defined here — unreachable, satisfies noUncheckedIndexedAccess.
      if (!frame) continue;
      if (frame.kind === "object" && this.pathKey(frame.path) === pathKey) {
        return frame.value;
      }
    }
    return null;
  }

  private emitBlockSnapshotForObject(
    objectPath: JsonPath,
    at: number,
    complete = false,
  ): void {
    const pathKey = this.pathKey(objectPath);
    if (this.rawObjectPaths.has(pathKey)) return;

    const kind = this.getDirectObjectKind(objectPath);
    if (!kind) return;

    // Root-form kinds have no object field map — nothing to snapshot.
    const schema = this.lookupObjectSchema(kind);
    if (!schema) return;

    const partial = complete
      ? this.getFinalizedObjectValue(objectPath)
      : this.getLiveObjectValue(objectPath);
    if (!partial) return;

    const { value, residue } = buildCompliantKindSnapshot(schema, partial);
    this.emit({
      type: "block_snapshot",
      kind,
      path: objectPath,
      value,
      residue,
      complete,
      at,
    });
  }

  /**
   * On `complete` snapshots (and post-close schema upgrades) the frame has
   * already been popped — the finalized value lives in the root tree.
   */
  private getFinalizedObjectValue(
    path: JsonPath,
  ): Record<string, unknown> | null {
    const live = this.getLiveObjectValue(path);
    if (live) return live;

    if (path.length === 0) {
      return typeof this.root === "object" &&
        this.root !== null &&
        !Array.isArray(this.root)
        ? (this.root as Record<string, unknown>)
        : null;
    }

    let cursor: unknown = this.root;
    for (const segment of path) {
      if (cursor === null || typeof cursor !== "object") return null;
      cursor = (cursor as Record<string | number, unknown>)[
        segment as string | number
      ];
    }
    return typeof cursor === "object" &&
      cursor !== null &&
      !Array.isArray(cursor)
      ? (cursor as Record<string, unknown>)
      : null;
  }

  private validateFieldPlacement(
    parent: ObjectFrame,
    fieldKey: string,
    valueKind: "object" | "array" | "scalar",
    value: unknown,
  ): string | null {
    const parentPathKey = this.pathKey(parent.path);
    const inlineFields = this.inlineSchemas.get(parentPathKey);
    if (inlineFields) {
      const fieldSchema = inlineFields[fieldKey];
      if (!fieldSchema) {
        return null;
      }
      return this.validateValueAgainstField(
        fieldSchema,
        valueKind,
        value,
        fieldKey,
      );
    }

    const recordValueType = this.recordSchemas.get(parentPathKey);
    if (recordValueType) {
      if (recordValueType === "json") return null; // any member value is legal
      if (valueKind !== "scalar") {
        return `Record field "${fieldKey}" must be a scalar.`;
      }
      return this.validateRecordScalar(recordValueType, value, fieldKey);
    }

    return null;
  }

  private emitSchemaNotices(
    path: JsonPath,
    kind: string,
    outcome: Pick<SchemaValidationOutcome, "optionalMissing" | "extraFields">,
    at: number,
  ): void {
    for (const field of outcome.optionalMissing) {
      this.emit({
        type: "optional_field_missing",
        kind,
        path,
        field,
        at,
      });
    }

    for (const field of outcome.extraFields) {
      this.emit({
        type: "extra_field",
        kind,
        path,
        field,
        at,
      });
    }
  }

  private validateObjectAgainstSchema(
    objectValue: Record<string, unknown>,
    schema: KindSchema,
  ): SchemaValidationOutcome {
    const optionalMissing: string[] = [];
    const extraFields: string[] = [];
    const emptyOutcome = { optionalMissing, extraFields };

    // Root-form kinds are data-only (scalar/array/json roots): a __kind
    // object claiming one is a contradiction, never a trivial pass.
    if (schema.root) {
      return {
        error: `Kind "${schema.kind}" has a non-object root form and cannot be a "${KIND_KEY}" object.`,
        ...emptyOutcome,
      };
    }

    const kind = readObjectKind(objectValue);
    if (kind !== schema.kind) {
      return {
        error: `Object "${KIND_KEY}" is "${kind ?? "missing"}", expected "${schema.kind}".`,
        ...emptyOutcome,
      };
    }

    for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
      if (fieldSchema.required) {
        if (!(fieldName in objectValue)) {
          return {
            error: `Kind "${schema.kind}" is missing required field "${fieldName}".`,
            ...emptyOutcome,
          };
        }
        continue;
      }

      if (!(fieldName in objectValue)) {
        optionalMissing.push(fieldName);
      }
    }

    for (const [fieldName, fieldValue] of Object.entries(objectValue)) {
      if (fieldName === KIND_KEY) continue;

      const fieldSchema = schema.fields[fieldName];
      if (!fieldSchema) {
        extraFields.push(fieldName);
        continue;
      }

      const error = this.validateFinalFieldValue(
        fieldSchema,
        fieldValue,
        fieldName,
        schema.kind,
      );
      if (error) {
        return { error, optionalMissing, extraFields };
      }
    }

    return { error: null, optionalMissing, extraFields };
  }

  private validateFinalFieldValue(
    fieldSchema: FieldSchema,
    value: unknown,
    fieldName: string,
    objectKind: string,
  ): string | null {
    // Any JSON value is legal — including null, objects, arrays.
    if (fieldSchema.type === "json") return null;

    if (fieldSchema.type === "json[]") {
      if (value === null) {
        return fieldSchema.nullable
          ? null
          : `Field "${fieldName}" on kind "${objectKind}" cannot be null.`;
      }
      if (!Array.isArray(value)) {
        return `Field "${fieldName}" on kind "${objectKind}" must be an array.`;
      }
      return null;
    }

    if (isScalarArrayType(fieldSchema.type)) {
      if (!Array.isArray(value)) {
        return `Field "${fieldName}" on kind "${objectKind}" must be an array.`;
      }
      const itemType = scalarArrayItemType(fieldSchema.type);
      if (!value.every((item) => typeof item === itemType)) {
        return `Field "${fieldName}" on kind "${objectKind}" must be an array of ${itemType}s.`;
      }
      // Items-enum (string[] option sets): closed sets reject unknown values;
      // `open` sets are advisory — any string item is legal.
      if (
        fieldSchema.type === "string[]" &&
        fieldSchema.values !== undefined &&
        !fieldSchema.open
      ) {
        const allowed = fieldSchema.values;
        const bad = value.find(
          (item) => typeof item === "string" && !allowed.includes(item),
        );
        if (bad !== undefined) {
          return `Field "${fieldName}" on kind "${objectKind}" items must be one of: ${allowed.join(", ")}.`;
        }
      }
      return null;
    }

    if (fieldSchema.type === "array") {
      if (!Array.isArray(value)) {
        return `Field "${fieldName}" on kind "${objectKind}" must be an array.`;
      }
      return null;
    }

    if (fieldSchema.type === "object") {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      ) {
        return `Field "${fieldName}" on kind "${objectKind}" must be an object.`;
      }
      const nestedKind = readObjectKind(value as Record<string, unknown>);
      if (nestedKind !== fieldSchema.kind) {
        return `Field "${fieldName}" on kind "${objectKind}" must be kind "${fieldSchema.kind}".`;
      }
      const nestedSchema = this.lookupSchema(fieldSchema.kind);
      if (!nestedSchema) {
        return `Unknown nested kind "${fieldSchema.kind}" on field "${fieldName}".`;
      }
      return this.validateObjectAgainstSchema(
        value as Record<string, unknown>,
        nestedSchema,
      ).error;
    }

    if (fieldSchema.type === "inline_object") {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      ) {
        return `Field "${fieldName}" on kind "${objectKind}" must be an inline object.`;
      }
      return this.validateObjectAgainstFields(
        value as Record<string, unknown>,
        fieldSchema.fields,
      ).error;
    }

    if (fieldSchema.type === "record") {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      ) {
        return `Field "${fieldName}" on kind "${objectKind}" must be a record object.`;
      }
      return this.validateRecordObject(
        value as Record<string, unknown>,
        fieldSchema.values,
      );
    }

    if (fieldSchema.type === "union") {
      // Object union member — the value must be one of the declared kinds.
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const kinds = fieldSchema.kinds ?? [];
        if (kinds.length === 0) {
          return `Field "${fieldName}" on kind "${objectKind}" must be ${fieldSchema.scalars.join(" | ")}.`;
        }
        const memberKind = readObjectKind(value as Record<string, unknown>);
        if (!memberKind || !kinds.includes(memberKind)) {
          return `Field "${fieldName}" on kind "${objectKind}" must be one of kinds: ${kinds.join(", ")}.`;
        }
        const memberSchema = this.lookupSchema(memberKind);
        if (!memberSchema) {
          return `Unknown union member kind "${memberKind}" on field "${fieldName}".`;
        }
        return this.validateObjectAgainstSchema(
          value as Record<string, unknown>,
          memberSchema,
        ).error;
      }
      return this.validateScalarField(fieldSchema, value, fieldName);
    }

    if (
      fieldSchema.type === "string" ||
      fieldSchema.type === "number" ||
      fieldSchema.type === "boolean" ||
      fieldSchema.type === "enum"
    ) {
      return this.validateScalarField(fieldSchema, value, fieldName);
    }

    return `Unsupported field schema for "${fieldName}".`;
  }

  private validateValueAgainstField(
    fieldSchema: FieldSchema,
    valueKind: "object" | "array" | "scalar",
    value: unknown,
    fieldName: string,
  ): string | null {
    if (fieldSchema.type === "json") {
      // Any placement is legal for a json-any field.
      return null;
    }
    if (fieldSchema.type === "array" || fieldSchema.type === "json[]") {
      return valueKind === "array"
        ? null
        : `Field "${fieldName}" must be an array.`;
    }
    if (
      fieldSchema.type === "object" ||
      fieldSchema.type === "inline_object"
    ) {
      return valueKind === "object"
        ? null
        : `Field "${fieldName}" must be an object.`;
    }
    if (fieldSchema.type === "record") {
      return valueKind === "object"
        ? null
        : `Field "${fieldName}" must be a record object.`;
    }
    if (isScalarArrayType(fieldSchema.type)) {
      return valueKind === "array"
        ? null
        : `Field "${fieldName}" must be an array.`;
    }
    if (fieldSchema.type === "union" && (fieldSchema.kinds?.length ?? 0) > 0) {
      // Object union members arrive as objects; scalars stay scalar-checked.
      if (valueKind === "object") return null;
    }
    if (valueKind !== "scalar") {
      return `Field "${fieldName}" must be a scalar.`;
    }
    return this.validateScalarField(fieldSchema, value, fieldName);
  }

  private validateScalarField(
    fieldSchema: FieldSchema,
    value: unknown,
    fieldName: string,
  ): string | null {
    if (value === null) {
      return fieldSchema.nullable
        ? null
        : `Field "${fieldName}" cannot be null.`;
    }

    if (fieldSchema.type === "enum") {
      if (typeof value !== "string") {
        return `Field "${fieldName}" must be a string.`;
      }
      // `open` — the option set is advisory ("these OR any string"); any
      // string value is legal. Closed enums reject unknown values.
      if (!fieldSchema.open && !fieldSchema.values.includes(value)) {
        return `Field "${fieldName}" must be one of: ${fieldSchema.values.join(", ")}.`;
      }
      return null;
    }

    if (fieldSchema.type === "union") {
      const valueType = typeof value;
      if (
        valueType !== "string" &&
        valueType !== "number" &&
        valueType !== "boolean"
      ) {
        return `Field "${fieldName}" must be ${fieldSchema.scalars.join(" | ")}.`;
      }
      if (
        !fieldSchema.scalars.includes(
          valueType as "string" | "number" | "boolean",
        )
      ) {
        return `Field "${fieldName}" must be ${fieldSchema.scalars.join(" | ")}.`;
      }
      return null;
    }

    if (
      fieldSchema.type === "string" ||
      fieldSchema.type === "number" ||
      fieldSchema.type === "boolean"
    ) {
      if (typeof value !== fieldSchema.type) {
        return `Field "${fieldName}" must be ${fieldSchema.type}.`;
      }
      // Numeric bounds (inclusive, mirroring JSON Schema minimum/maximum).
      // `step` (multipleOf) stays annotation-level here — float modulo is
      // unreliable; the emitted JSON Schema gate (ajv/Pydantic) owns it.
      if (fieldSchema.type === "number" && typeof value === "number") {
        if (fieldSchema.min !== undefined && value < fieldSchema.min) {
          return `Field "${fieldName}" must be >= ${fieldSchema.min}.`;
        }
        if (fieldSchema.max !== undefined && value > fieldSchema.max) {
          return `Field "${fieldName}" must be <= ${fieldSchema.max}.`;
        }
      }
      return null;
    }

    return `Field "${fieldName}" is not a scalar.`;
  }

  private validateRecordScalar(
    valueType: RecordValueType,
    value: unknown,
    fieldName: string,
  ): string | null {
    if (valueType === "json") return null;
    if (typeof value !== valueType) {
      return `Record field "${fieldName}" must be ${valueType}.`;
    }
    return null;
  }

  private validateRecordObject(
    objectValue: Record<string, unknown>,
    valueType: RecordValueType,
  ): string | null {
    if (valueType === "json") return null;
    for (const [key, entry] of Object.entries(objectValue)) {
      if (typeof entry !== valueType) {
        return `Record key "${key}" must be ${valueType}.`;
      }
    }
    return null;
  }

  private validateObjectAgainstFields(
    objectValue: Record<string, unknown>,
    fields: Record<string, FieldSchema>,
  ): SchemaValidationOutcome {
    const optionalMissing: string[] = [];
    const extraFields: string[] = [];
    const emptyOutcome = { optionalMissing, extraFields };

    for (const [fieldName, fieldSchema] of Object.entries(fields)) {
      if (fieldSchema.required) {
        if (!(fieldName in objectValue)) {
          return {
            error: `Inline object is missing required field "${fieldName}".`,
            ...emptyOutcome,
          };
        }
        continue;
      }

      if (!(fieldName in objectValue)) {
        optionalMissing.push(fieldName);
      }
    }

    for (const [fieldName, fieldValue] of Object.entries(objectValue)) {
      const fieldSchema = fields[fieldName];
      if (!fieldSchema) {
        extraFields.push(fieldName);
        continue;
      }

      const error = this.validateFinalFieldValue(
        fieldSchema,
        fieldValue,
        fieldName,
        "inline_object",
      );
      if (error) {
        return { error, optionalMissing, extraFields };
      }
    }

    return { error: null, optionalMissing, extraFields };
  }

  private registerObjectContext(path: JsonPath): void {
    const fieldSchema = this.resolveParentFieldSchema(path);
    if (!fieldSchema) return;

    const pathKey = this.pathKey(path);
    if (fieldSchema.type === "inline_object") {
      this.inlineSchemas.set(pathKey, fieldSchema.fields);
    }
    if (fieldSchema.type === "record") {
      this.recordSchemas.set(pathKey, fieldSchema.values);
    }
  }

  private resolveParentFieldSchema(path: JsonPath): FieldSchema | undefined {
    const fieldKey = this.fieldKeyFromPath(path);
    if (!fieldKey) return undefined;

    const parentPath = path.slice(0, -1);
    const parentKind = this.getObjectKindForPath(parentPath);
    if (!parentKind) return undefined;

    return this.lookupSchema(parentKind)?.fields[fieldKey];
  }

  private getObjectKindForPath(path: JsonPath): string | null {
    return (
      this.objectKinds.get(this.pathKey(path)) ??
      (path.length === 0 ? this.rootKind || null : null)
    );
  }

  private getDirectObjectKind(objectPath: JsonPath): string | null {
    if (objectPath.length === 0) {
      return this.rootKind || null;
    }
    return this.objectKinds.get(this.pathKey(objectPath)) ?? null;
  }

  private isAllowedSchemaField(
    objectPath: JsonPath,
    fieldKey: string,
    objectKind: string,
  ): boolean {
    const pathKey = this.pathKey(objectPath);
    const inlineFields = this.inlineSchemas.get(pathKey);
    if (inlineFields) {
      return fieldKey in inlineFields;
    }

    if (this.recordSchemas.has(pathKey)) {
      return true;
    }

    const schema = this.lookupSchema(objectKind);
    return !!schema?.fields[fieldKey];
  }

  private parentFieldName(path: JsonPath): string | undefined {
    if (path.length === 0) return undefined;
    const parent = path[path.length - 2];
    return typeof parent === "string" ? parent : undefined;
  }

  private fieldKeyFromPath(path: JsonPath): string | null {
    const last = path[path.length - 1];
    return typeof last === "string" ? last : null;
  }

  private isKindFieldPath(path: JsonPath): boolean {
    return path[path.length - 1] === KIND_KEY;
  }

  private pathKey(path: JsonPath): string {
    return path.map((segment) => String(segment)).join(".");
  }

  private lookupSchema(kind: string): KindSchema | undefined {
    return this.resolver.get(kind) ?? this.arrivedSchemas.get(kind);
  }

  private fail(reason: string, at: number): void {
    if (this.failed) return;
    this.failed = true;
    this.emit({ type: "error", reason, at });
  }

  private emit(event: KindStreamEvent): void {
    this.options.onEvent(event);
  }

  private currentFrame(): Frame | undefined {
    return this.stack[this.stack.length - 1];
  }
}

export function createKindStreamParser(
  options: KindStreamParserOptions,
): KindStreamParser {
  return new KindStreamParser(options);
}
