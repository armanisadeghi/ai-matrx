"use client";

import React from "react";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { ShikiCodeView } from "@/features/code-editor/components/code-block/highlight/ShikiCodeView";

/** Read-only SQL (or other) source for the database admin screens. */
const SyntaxHighlighter = ({
  code,
  language = "sql",
}: {
  code: string;
  language?: string;
}) => {
  const mode = useThemeMode() === "dark" ? "dark" : "light";
  return (
    <div className="overflow-hidden rounded-lg text-sm">
      <ShikiCodeView
        code={code}
        language={language}
        mode={mode}
        surface="transparent"
        fontSize={14}
      />
    </div>
  );
};

export default SyntaxHighlighter;
