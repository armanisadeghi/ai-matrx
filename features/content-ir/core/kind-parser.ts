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
 * Moved from app/(dev)/demos/json-block-detector/kind-stream-parser.ts (the
 * demo is now a consumer). Phase 0 change: `block_snapshot` carries the
 * residue channel (unknown keys are no longer merged into snapshot values).
 */

import { JsonStreamTokenizer, type JsonToken } from "./json-tokenizer";
import type { IrPath, IrResidue } from "./ir-types";
import {
  KIND_KEY,
  isScalarArrayType,
  readObjectKind,
  scalarArrayItemType,
  type ArrayItemScalarType,
  type FieldSchema,
  type KindSchema,
} from "./kind-schema.types";
import { buildCompliantKindSnapshot } from "./kind-snapshot";

/** Kept as the historical name for the parser's event paths. */
export type JsonPath = IrPath;

type ObjectFrame = {
  kind: "object";
  path: JsonPath;
  value: Record<string, unknown>;
  expecting: "keyOrEnd" | "key" | "colon" | "value" | "commaOrEnd";
  currentKey?: string;
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
  | { type: "kind_identified"; kind: string; path: JsonPath; at: number }
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
  schemas: Record<string, KindSchema>;
};

export class KindStreamParser {
  private readonly schemas: Record<string, KindSchema>;
  private readonly stack: Frame[] = [];
  private readonly objectKinds = new Map<string, string>();
  private readonly inlineSchemas = new Map<
    string,
    Record<string, FieldSchema>
  >();
  private readonly recordSchemas = new Map<string, ArrayItemScalarType>();
  private readonly rawObjectPaths = new Set<string>();
  private readonly deferredFields = new Map<
    string,
    Array<{ key: string; value: unknown; at: number }>
  >();
  private readonly awaitingKindPaths = new Set<string>();

  private tokenizer: JsonStreamTokenizer;
  private root: unknown;
  private rootKind = "";
  private rootDone = false;
  private failed = false;

  constructor(private readonly options: KindStreamParserOptions) {
    this.schemas = options.schemas;

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

    if (!this.rootDone) {
      this.fail(
        "Stream ended before the root JSON object was complete.",
        this.tokenizer.position,
      );
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
    const path = this.placeValue(value, kind, at, false);
    if (!path || this.failed) return;

    if (kind === "object") {
      this.emit({ type: "object_start", path, at });
      this.registerObjectContext(path);
      const pathKey = this.pathKey(path);
      if (
        !this.inlineSchemas.has(pathKey) &&
        !this.recordSchemas.has(pathKey)
      ) {
        this.awaitingKindPaths.add(pathKey);
        this.emit({ type: "pending_kind", path, at });
      }
      this.stack.push({
        kind: "object",
        path,
        value: value as Record<string, unknown>,
        expecting: "keyOrEnd",
        keyCount: 0,
      });
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

      const placementError = this.validateFieldPlacement(
        parent,
        fieldKey,
        valueKind,
        value,
        at,
      );
      if (placementError) {
        this.fail(placementError, at);
        return null;
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

      const placementError = this.validateArrayItemPlacement(
        parent,
        fieldKey,
        valueKind,
        value,
        at,
      );
      if (placementError) {
        this.fail(placementError, at);
        return null;
      }

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
      this.fail(`Duplicate key "${key}" is not allowed.`, at);
      return;
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

  private onValueFinalized(path: JsonPath, value: unknown, at: number): void {
    if (this.failed) return;

    const pathKey = this.pathKey(path);

    if (this.isKindFieldPath(path)) {
      if (typeof value !== "string") {
        return;
      }

      const objectPath = path.slice(0, -1);
      const objectPathKey = this.pathKey(objectPath);
      this.objectKinds.set(objectPathKey, value);

      this.emit({
        type: "kind_identified",
        kind: value,
        path: objectPath,
        at,
      });

      this.clearKindWait(objectPath, "identified", at, value);

      if (objectPath.length === 0) {
        this.rootKind = value;
      }

      this.flushDeferredFields(objectPath, value, at);
      this.emitBlockSnapshotForObject(objectPath, at);
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

  private completeTypedObject(
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

    this.emitSchemaNotices(path, kind, outcome, at);
    this.emitBlockSnapshotForObject(path, at, true);
    this.objectKinds.set(pathKey, kind);
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

    const kind = readObjectKind(rootObject);
    const schema = kind ? this.lookupSchema(kind) : undefined;

    if (!kind) {
      this.emitRawObject(
        [],
        rootObject,
        `Root object is missing "${KIND_KEY}".`,
        at,
      );
    } else if (!schema) {
      this.emitRawObject(
        [],
        rootObject,
        `No block schema registered for "${kind}".`,
        at,
      );
    } else {
      const outcome = this.validateObjectAgainstSchema(rootObject, schema);
      if (outcome.error) {
        this.emitRawObject([], rootObject, outcome.error, at);
      } else {
        this.emitSchemaNotices([], kind, outcome, at);
      }
    }

    this.emit({
      type: "complete",
      kind: kind ?? "",
      value: rootObject,
      at,
    });
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
      kind,
      reason,
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

    const schema = this.lookupSchema(kind);
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
   * On `complete` snapshots the frame has already been popped — the finalized
   * value lives on the parent frame (or is the root itself).
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
    return typeof cursor === "object" && cursor !== null && !Array.isArray(cursor)
      ? (cursor as Record<string, unknown>)
      : null;
  }

  private validateFieldPlacement(
    parent: ObjectFrame,
    fieldKey: string,
    valueKind: "object" | "array" | "scalar",
    value: unknown,
    _at: number,
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
      if (valueKind !== "scalar") {
        return `Record field "${fieldKey}" must be a scalar.`;
      }
      return this.validateRecordScalar(recordValueType, value, fieldKey);
    }

    return null;
  }

  private validateArrayItemPlacement(
    parent: Frame,
    fieldKey: string | undefined,
    valueKind: "object" | "array" | "scalar",
    value: unknown,
    _at: number,
  ): string | null {
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
    if (isScalarArrayType(fieldSchema.type)) {
      if (!Array.isArray(value)) {
        return `Field "${fieldName}" on kind "${objectKind}" must be an array.`;
      }
      const itemType = scalarArrayItemType(fieldSchema.type);
      if (!value.every((item) => typeof item === itemType)) {
        return `Field "${fieldName}" on kind "${objectKind}" must be an array of ${itemType}s.`;
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
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
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
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return `Field "${fieldName}" on kind "${objectKind}" must be an inline object.`;
      }
      return this.validateObjectAgainstFields(
        value as Record<string, unknown>,
        fieldSchema.fields,
      ).error;
    }

    if (fieldSchema.type === "record") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return `Field "${fieldName}" on kind "${objectKind}" must be a record object.`;
      }
      return this.validateRecordObject(
        value as Record<string, unknown>,
        fieldSchema.values,
      );
    }

    if (
      fieldSchema.type === "string" ||
      fieldSchema.type === "number" ||
      fieldSchema.type === "boolean" ||
      fieldSchema.type === "enum" ||
      fieldSchema.type === "union"
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
    if (fieldSchema.type === "array") {
      return valueKind === "array"
        ? null
        : `Field "${fieldName}" must be an array.`;
    }
    if (fieldSchema.type === "object" || fieldSchema.type === "inline_object") {
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
      if (!fieldSchema.values.includes(value)) {
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
      return null;
    }

    return `Field "${fieldName}" is not a scalar.`;
  }

  private validateRecordScalar(
    valueType: ArrayItemScalarType,
    value: unknown,
    fieldName: string,
  ): string | null {
    if (typeof value !== valueType) {
      return `Record field "${fieldName}" must be ${valueType}.`;
    }
    return null;
  }

  private validateRecordObject(
    objectValue: Record<string, unknown>,
    valueType: ArrayItemScalarType,
  ): string | null {
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
    return this.schemas[kind];
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
