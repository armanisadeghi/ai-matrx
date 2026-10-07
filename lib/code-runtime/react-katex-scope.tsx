"use client";

/**
 * The `react-katex` module that generated code imports (`import { BlockMath,
 * InlineMath } from "react-katex"`). Same names and props as the package, but
 * backed by the ONE rich-content engine's math rendering — no direct KaTeX
 * edge. Existing generated components keep working unchanged.
 */
import type { ReactNode } from "react";
import DisplayMath from "@/features/math/components/DisplayMath";
import InlineMathText from "@/features/math/components/InlineMathText";

interface MathProps {
  /** Pure TeX, no delimiters (the package also accepts it as children). */
  math?: string;
  children?: ReactNode;
  [key: string]: unknown;
}

function tex({ math, children }: MathProps): string {
  if (typeof math === "string") return math;
  if (typeof children === "string") return children;
  return "";
}

export function BlockMath(props: MathProps) {
  return <DisplayMath math={tex(props)} />;
}

export function InlineMath(props: MathProps) {
  const expression = tex(props);
  return <InlineMathText text={expression ? `\\(${expression}\\)` : ""} />;
}
