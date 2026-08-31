"use client";

import { CopyTapButton } from "@ai-matrx/tap-target/buttons";

/**
 * RIGHT region — contextual actions for the active template.
 * Tap buttons self-space; the only non-tap item (Chat badge) uses a margin.
 *
 * A control is absent or honest: with no template code there is nothing to
 * copy and no words here to explain a greyed button, so the button is not
 * rendered at all.
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
      {templateCode ? (
        <CopyTapButton
          onClick={copyCode}
          ariaLabel="Copy template code"
          tooltip="Copy template code"
        />
      ) : null}
    </div>
  );
}
