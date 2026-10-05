"use client";

import { ProFieldWidthsShowcase } from "@/components/official/ProFieldWidthsShowcase";

export default function ProFieldControlsDemoPage() {
  return (
    <div className="h-full w-full overflow-y-auto bg-textured">
      <div className="mx-auto max-w-4xl p-4">
        <ProFieldWidthsShowcase />
      </div>
    </div>
  );
}
