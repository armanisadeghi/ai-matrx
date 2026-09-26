"use client";

import { Camera } from "lucide-react";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";

/**
 * Settings truth sweep (2026-09-25, lane ai-media-editor): this tab used to
 * offer five controls — default filter, export resolution, aspect ratio,
 * auto-enhance, watermark — that the photo editor (`/images/edit`,
 * `features/image-studio/modes/edit`) never read. Confirmed against the
 * editor's own filter/aspect-ratio/watermark UI, which is chosen per-edit
 * inside the tool, not defaulted from a global preference. Controls removed
 * (the underlying preference keys are left alone; no user data deleted).
 *
 * If a real "default filter/export size" concept gets built for the photo
 * editor, it belongs back here wired to that code path — not re-added as
 * another set of ignored selects.
 */
export default function PhotoEditingTab() {
  return (
    <>
      <SettingsSubHeader
        title="Photo editing"
        description="No global defaults yet — choose filters, resolution, aspect ratio, and watermark directly in the photo editor each time."
        icon={Camera}
      />
      <SettingsCallout tone="info">
        The photo editor doesn't have default-preference controls yet. Open
        the editor from any image to set filters, export size, aspect ratio,
        and watermark for that edit.
      </SettingsCallout>
    </>
  );
}
