"use client";

import {
  MillerColumns as CanonicalMillerColumns,
  type MillerColumnsProps,
} from "@/features/scopes/components/active-context/miller-columns/MillerColumns";

// Demo shim — canonical Miller Columns lives under features/scopes.
export function MillerColumns(props: MillerColumnsProps) {
  return <CanonicalMillerColumns {...props} />;
}
