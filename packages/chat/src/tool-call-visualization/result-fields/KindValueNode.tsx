"use client";

/**
 * KindValueNode — how the value grid draws a node that IS a kind: through the
 * one value door, `AnswerValueView` (its own component, or the structured floor
 * beneath it), never as a key/value grid, a JSON tree or a line of JSON text
 * (Arman, 2026-09-30: a kind is never drawn raw).
 *
 * Bounded: a kind component that hands its own value back to the grid would
 * loop through its own door forever. Past a few nested routes of the SAME kind
 * the node renders as the floor does — the fields, without the marker.
 */

import React, { createContext, useContext } from "react";
import { KindValueFrontDoor } from "@host/components/official/structured-value/KindValueFrontDoor";
import { isPlainObject } from "./shape";
import { ResultValue, type ResultDensity } from "./ResultValue";

/** Kinds this subtree is already being drawn as, outermost first. */
const KindRouteStack = createContext<readonly string[]>([]);

/** Same-kind routes allowed inside one another before the node stops routing. */
const MAX_SAME_KIND_NESTING = 3;

export interface KindValueNodeProps {
  value: unknown;
  slug: string | null;
  density: ResultDensity;
  depth?: number;
  embedMedia?: boolean;
}

function withoutRootKind(value: unknown): unknown {
  if (!isPlainObject(value) || !("__kind" in value)) return value;
  const { __kind: _marker, ...fields } = value;
  return fields;
}

export function KindValueNode({
  value,
  slug,
  density,
  depth = 0,
  embedMedia = true,
}: KindValueNodeProps) {
  const stack = useContext(KindRouteStack);
  const key = slug ?? "";
  const nested = stack.filter((entry) => entry === key).length;
  if (nested >= MAX_SAME_KIND_NESTING && typeof value !== "string") {
    return (
      <ResultValue
        value={withoutRootKind(value)}
        density={density}
        depth={depth + 1}
        embedMedia={embedMedia}
      />
    );
  }
  return (
    <KindRouteStack.Provider value={[...stack, key]}>
      <KindValueFrontDoor value={value} density={density} />
    </KindRouteStack.Provider>
  );
}

export default KindValueNode;
