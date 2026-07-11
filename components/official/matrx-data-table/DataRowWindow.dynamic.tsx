"use client";

/**
 * Dynamic front door for DataRowWindow — keeps WindowPanel out of the
 * parent chunk until a row window is actually opened.
 */

import dynamic from "next/dynamic";
import type { DataRowWindowProps } from "./DataRowWindow";

export type { DataRowWindowProps };

const DataRowWindow = dynamic(
  () => import("./DataRowWindow").then((m) => ({ default: m.DataRowWindow })),
  { ssr: false, loading: () => null },
);

export default DataRowWindow;
