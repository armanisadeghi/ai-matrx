import type { DiffNode, DiffOptions, DiffResult, DiffStats, IdentityKeyFn } from "./types";

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  return false;
}

function isPrimitive(value: unknown): boolean {
  return value === null || value === undefined || typeof value !== "object";
}

/** Safe to recurse into with `key in obj` / Object.keys. */
function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getIdentityKey(
  config: string | IdentityKeyFn | undefined,
  item: unknown,
  index: number,
): string {
  if (!config) return String(index);
  if (typeof config === "function") return config(item, index);
  if (typeof item === "object" && item !== null && config in (item as Record<string, unknown>)) {
    return String((item as Record<string, unknown>)[config]);
  }
  return String(index);
}

function diffArrayOfPrimitives(
  oldArr: unknown[],
  newArr: unknown[],
  path: string[],
): DiffNode[] {
  const oldSet = new Set(oldArr.map((v) => JSON.stringify(v)));
  const newSet = new Set(newArr.map((v) => JSON.stringify(v)));
  const nodes: DiffNode[] = [];

  for (let i = 0; i < oldArr.length; i++) {
    const serialized = JSON.stringify(oldArr[i]);
    if (!newSet.has(serialized)) {
      nodes.push({
        path: [...path, String(i)],
        key: String(i),
        changeType: "removed",
        oldValue: oldArr[i],
        newValue: undefined,
      });
    }
  }

  for (let i = 0; i < newArr.length; i++) {
    const serialized = JSON.stringify(newArr[i]);
    if (!oldSet.has(serialized)) {
      nodes.push({
        path: [...path, String(i)],
        key: String(i),
        changeType: "added",
        oldValue: undefined,
        newValue: newArr[i],
      });
    }
  }

  if (nodes.length === 0) {
    const reordered = !deepEqual(oldArr, newArr);
    if (reordered) {
      return [
        {
          path,
          key: path[path.length - 1] ?? "",
          changeType: "reordered",
          oldValue: oldArr,
          newValue: newArr,
        },
      ];
    }
  }

  return nodes;
}

function diffArrayOfObjects(
  oldArr: unknown[],
  newArr: unknown[],
  path: string[],
  identityConfig: string | IdentityKeyFn | undefined,
  options: DiffOptions,
  depth: number,
): DiffNode[] {
  const oldByKey = new Map<string, { item: unknown; index: number }>();
  const newByKey = new Map<string, { item: unknown; index: number }>();

  for (let i = 0; i < oldArr.length; i++) {
    const key = getIdentityKey(identityConfig, oldArr[i], i);
    oldByKey.set(key, { item: oldArr[i], index: i });
  }

  for (let i = 0; i < newArr.length; i++) {
    const key = getIdentityKey(identityConfig, newArr[i], i);
    newByKey.set(key, { item: newArr[i], index: i });
  }

  const nodes: DiffNode[] = [];
  const processedNew = new Set<string>();

  for (const [key, { item: oldItem, index: oldIdx }] of oldByKey) {
    const newEntry = newByKey.get(key);
    if (!newEntry) {
      nodes.push({
        path: [...path, String(oldIdx)],
        key,
        changeType: "removed",
        oldValue: oldItem,
        newValue: undefined,
      });
    } else {
      processedNew.add(key);
      if (deepEqual(oldItem, newEntry.item)) {
        nodes.push({
          path: [...path, String(newEntry.index)],
          key,
          changeType: "unchanged",
          oldValue: oldItem,
          newValue: newEntry.item,
        });
      } else if (!isPlainObject(oldItem) || !isPlainObject(newEntry.item)) {
        // An array is only "of objects" because its FIRST element was one.
        // A heterogeneous array ([{...}, "str"], [{...}, null], nested arrays)
        // pairs a non-object against something here, and recursing would run
        // `key in <string>` / Object.keys(null) and THROW — inside a render for
        // every viewer built on this engine. A mismatched pair is simply a
        // modified leaf.
        nodes.push({
          path: [...path, String(newEntry.index)],
          key,
          changeType: "modified",
          oldValue: oldItem,
          newValue: newEntry.item,
        });
      } else {
        const children = diffObjects(
          oldItem as Record<string, unknown>,
          newEntry.item as Record<string, unknown>,
          [...path, String(newEntry.index)],
          options,
          depth + 1,
        );
        nodes.push({
          path: [...path, String(newEntry.index)],
          key,
          changeType: "modified",
          oldValue: oldItem,
          newValue: newEntry.item,
          children,
        });
      }
    }
  }

  for (const [key, { item: newItem, index: newIdx }] of newByKey) {
    if (!processedNew.has(key) && !oldByKey.has(key)) {
      nodes.push({
        path: [...path, String(newIdx)],
        key,
        changeType: "added",
        oldValue: undefined,
        newValue: newItem,
      });
    }
  }

  return nodes;
}

function diffArrays(
  oldArr: unknown[],
  newArr: unknown[],
  path: string[],
  options: DiffOptions,
  depth: number,
): DiffNode[] {
  if (oldArr.length === 0 && newArr.length === 0) return [];

  const hasPrimitiveOld = oldArr.length > 0 && isPrimitive(oldArr[0]);
  const hasPrimitiveNew = newArr.length > 0 && isPrimitive(newArr[0]);

  if (hasPrimitiveOld || hasPrimitiveNew) {
    return diffArrayOfPrimitives(oldArr, newArr, path);
  }

  const fieldName = path[path.length - 1] ?? "";
  const identityConfig = options.identityKeys?.[fieldName];

  return diffArrayOfObjects(oldArr, newArr, path, identityConfig, options, depth);
}

function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  path: string[],
  options: DiffOptions,
  depth: number,
): DiffNode[] {
  if (options.maxDepth && depth > options.maxDepth) {
    if (!deepEqual(oldObj, newObj)) {
      return [
        {
          path,
          key: path[path.length - 1] ?? "",
          changeType: "modified",
          oldValue: oldObj,
          newValue: newObj,
        },
      ];
    }
    return [];
  }

  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const nodes: DiffNode[] = [];

  for (const key of allKeys) {
    if (options.skipUnderscorePrefix !== false && key.startsWith("_")) continue;
    if (options.excludePaths?.has(key)) continue;

    const fullPath = [...path, key];
    const oldVal = oldObj[key];
    const newVal = newObj[key];

    if (!(key in oldObj)) {
      nodes.push({
        path: fullPath,
        key,
        changeType: "added",
        oldValue: undefined,
        newValue: newVal,
      });
    } else if (!(key in newObj)) {
      nodes.push({
        path: fullPath,
        key,
        changeType: "removed",
        oldValue: oldVal,
        newValue: undefined,
      });
    } else if (deepEqual(oldVal, newVal)) {
      nodes.push({
        path: fullPath,
        key,
        changeType: "unchanged",
        oldValue: oldVal,
        newValue: newVal,
      });
    } else if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      const children = diffArrays(oldVal, newVal, fullPath, options, depth + 1);
      const hasChanges = children.some((c) => c.changeType !== "unchanged");
      nodes.push({
        path: fullPath,
        key,
        changeType: hasChanges ? "modified" : "unchanged",
        oldValue: oldVal,
        newValue: newVal,
        children,
      });
    } else if (
      typeof oldVal === "object" &&
      oldVal !== null &&
      typeof newVal === "object" &&
      newVal !== null &&
      !Array.isArray(oldVal) &&
      !Array.isArray(newVal)
    ) {
      const children = diffObjects(
        oldVal as Record<string, unknown>,
        newVal as Record<string, unknown>,
        fullPath,
        options,
        depth + 1,
      );
      const hasChanges = children.some((c) => c.changeType !== "unchanged");
      nodes.push({
        path: fullPath,
        key,
        changeType: hasChanges ? "modified" : "unchanged",
        oldValue: oldVal,
        newValue: newVal,
        children,
      });
    } else {
      nodes.push({
        path: fullPath,
        key,
        changeType: "modified",
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  return nodes;
}

function computeStats(nodes: DiffNode[]): DiffStats {
  const stats: DiffStats = { added: 0, removed: 0, modified: 0, unchanged: 0, total: 0 };

  for (const node of nodes) {
    stats.total++;
    switch (node.changeType) {
      case "added":
        stats.added++;
        break;
      case "removed":
        stats.removed++;
        break;
      case "modified":
      case "reordered":
        stats.modified++;
        break;
      case "unchanged":
        stats.unchanged++;
        break;
    }
  }

  return stats;
}

export function computeDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  options: DiffOptions = {},
): DiffResult {
  const root = diffObjects(oldObj, newObj, [], options, 0);
  const stats = computeStats(root);
  const hasChanges = stats.added + stats.removed + stats.modified > 0;

  return { root, stats, hasChanges };
}
