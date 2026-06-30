"use client";

import { CopyTapButton } from "@/components/icons/tap-buttons";

/**
 * RIGHT region — contextual actions for the active template.
 * Tap buttons self-space; the only non-tap item (Chat badge) uses a margin.
 */
export function TemplateModeActions({
  templateCode,
  supportsChat,
}: {
  templateCode?: string;
  supportsChat?: boolean;
}) {
  const copyCode = () => {
    if (templateCode) void navigator.clipboard.writeText(templateCode);
  };

  return (
    <div className="flex items-center">
      {supportsChat && (
        <span className="hidden xl:inline-flex items-center px-1.5 py-0.5 mr-1 rounded text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          Chat
        </span>
      )}
      <CopyTapButton
        onClick={copyCode}
        ariaLabel="Copy template code"
        tooltip="Copy template code"
        disabled={!templateCode}
      />
    </div>
  );
}
