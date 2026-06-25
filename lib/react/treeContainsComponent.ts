import * as React from "react";

/**
 * Returns true if `Component` appears anywhere in the React element tree under
 * `node`. Used to detect optional a11y children (e.g. DialogDescription)
 * without rendering duplicates.
 *
 * DEFENSIVE + LOUD. A non-renderable node — a plain object or function passed
 * as a React child — is a real bug: React throws "Objects are not valid as a
 * React child" the instant it renders one. This a11y probe must NOT be the
 * crash site. `React.Children.toArray` would throw HERE, producing a trace that
 * points at the dialog primitive instead of the component that leaked the
 * object (this misdirection has burned real debugging hours). So we walk the
 * tree by hand, SKIP any non-renderable node, and scream in dev with its keys —
 * then let React report the defect at the true render site with the offending
 * component in the stack. For every VALID tree the result is identical to the
 * old `React.Children.toArray(node).some(...)`.
 */
export function treeContainsComponent(
  node: React.ReactNode,
  Component: React.ElementType,
): boolean {
  if (node == null || typeof node === "boolean") return false;

  if (Array.isArray(node)) {
    return node.some((child) => treeContainsComponent(child, Component));
  }

  if (React.isValidElement(node)) {
    if (node.type === Component) return true;
    const props = node.props as { children?: React.ReactNode };
    return props.children != null
      ? treeContainsComponent(props.children, Component)
      : false;
  }

  // Strings / numbers are valid leaf children but never the Component.
  if (typeof node === "string" || typeof node === "number") return false;

  // Non-array iterables (Set, Map, generator) are valid React children — React
  // supports them — so traverse rather than reject.
  if (typeof node === "object" && Symbol.iterator in node) {
    return Array.from(node as Iterable<React.ReactNode>).some((child) =>
      treeContainsComponent(child, Component),
    );
  }

  // Anything else (a raw object, a function) is NOT a valid React child. React
  // will throw when it renders this; we must not throw first and hide the cause.
  if (process.env.NODE_ENV !== "production") {
    const keys =
      typeof node === "object"
        ? ` with keys {${Object.keys(node).join(", ")}}`
        : "";
    console.error(
      `[treeContainsComponent] A non-renderable value${keys} is being passed as a React child. ` +
        "React will throw 'Objects are not valid as a React child' at the real render site. " +
        "Stringify it (e.g. JSON.stringify) before rendering.",
      node,
    );
  }
  return false;
}
