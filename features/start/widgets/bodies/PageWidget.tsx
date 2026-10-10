"use client";

// features/start/widgets/bodies/PageWidget.tsx — one of the person's own data pages (`DataPage`). The
// start page of before (one chosen page) is this widget now; nothing was lost.
import Link from "next/link";
import { DataPage } from "@/features/applets/embed/DataPage";
import type { StartWidgetBodyProps } from "../types";
import { WidgetNotice } from "../frame";

export function PageWidget({ config }: StartWidgetBodyProps) {
  if (!config.pageId) {
    return (
      <WidgetNotice>
        <Link href="/data/pages" className="underline">
          Choose a page
        </Link>
      </WidgetNotice>
    );
  }
  return (
    <div className="h-full overflow-y-auto px-2">
      <DataPage id={config.pageId} />
    </div>
  );
}
