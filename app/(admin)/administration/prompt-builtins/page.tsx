"use client";

import React from "react";
import { PromptBuiltinsManager } from "@/features/prompt-builtins/admin/PromptBuiltinsManager";

export default function CategoriesAndShortcutsPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <PromptBuiltinsManager />
      </div>
    </div>
  );
}
