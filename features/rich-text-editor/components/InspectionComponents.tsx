import { forwardRef, useState, useEffect } from "react";
import { Copy } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cleanHTML, formatHTML, structureHTML } from "../admin/htmlFormatter";

type ViewMode = "original" | "cleaned" | "structured" | "formatted";

export const InspectHtmlUtil = forwardRef<HTMLDivElement, { editorId: string }>(
  ({ editorId }, ref) => {
    const [viewMode, setViewMode] = useState<ViewMode>("original");
    const [html, setHtml] = useState({
      original: "",
      cleaned: "",
      structured: "",
      formatted: "",
    });
    const [copyStatus, setCopyStatus] = useState("Copy");
    const [formattingOptions, setFormattingOptions] = useState({
      indentSize: 4,
      showLineNumbers: true,
      showNodeTypes: true,
      highlightChips: true,
    });

    const updateHTML = () => {
      if (!ref || !("current" in ref) || !ref.current) return;

      try {
        const originalHtml = ref.current.innerHTML;
        const cleanedHtml = cleanHTML(originalHtml);
        const structuredHtml = structureHTML(cleanedHtml);
        const formattedHtml = formatHTML(originalHtml, formattingOptions);

        setHtml({
          original: originalHtml,
          cleaned: cleanedHtml,
          structured: structuredHtml,
          formatted: formattedHtml,
        });
      } catch (err) {
        console.warn("Error updating HTML:", err);
      }
    };

    useEffect(() => {
      updateHTML();
      const interval = setInterval(updateHTML, 500);
      return () => clearInterval(interval);
    }, [ref, formattingOptions]);

    const handleCopy = async () => {
      const textToCopy = html[viewMode];

      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopyStatus("Copied!");
        setTimeout(() => setCopyStatus("Copy"), 2000);
      } catch (err) {
        setCopyStatus("Failed to copy");
        setTimeout(() => setCopyStatus("Copy"), 2000);
      }
    };

    const ViewButton = ({ mode, label }: { mode: ViewMode; label: string }) => (
      <button
        className={`px-3 py-1 text-sm rounded-md transition-colors duration-200 ${
          viewMode === mode
            ? "bg-blue-500 text-white"
            : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
        }`}
        onClick={() => setViewMode(mode)}
      >
        {label}
      </button>
    );

    return (
      <div className="flex flex-col h-full w-full space-y-2">
        <div className="flex justify-between items-center">
          {/* Toolbar content remains the same */}
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            HTML Inspector
          </label>
          <div className="flex space-x-2">
            <ViewButton mode="original" label="Original" />
            <ViewButton mode="cleaned" label="Cleaned" />
            <ViewButton mode="structured" label="Structured" />
            <ViewButton mode="formatted" label="Formatted" />
            <button
              className="px-3 py-1 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-200"
              onClick={updateHTML}
            >
              Refresh
            </button>
            <button
              className="inline-flex items-center px-3 py-1 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors duration-200 space-x-1"
              onClick={handleCopy}
            >
              <Copy className="w-4 h-4" />
              <span>{copyStatus}</span>
            </button>
          </div>
        </div>

        {viewMode === "formatted" && (
          <div className="w-full">
            {/* Formatting options remain the same */}
            <label className="flex items-center space-x-2">
              <Checkbox
                checked={formattingOptions.showLineNumbers}
                onCheckedChange={(v) =>
                  setFormattingOptions((prev) => ({
                    ...prev,
                    showLineNumbers: v === true,
                  }))
                }
              />
              <span className="text-sm">Line Numbers</span>
            </label>
            <label className="flex items-center space-x-2">
              <Checkbox
                checked={formattingOptions.showNodeTypes}
                onCheckedChange={(v) =>
                  setFormattingOptions((prev) => ({
                    ...prev,
                    showNodeTypes: v === true,
                  }))
                }
              />
              <span className="text-sm">Node Types</span>
            </label>
            <label className="flex items-center space-x-2">
              <Checkbox
                checked={formattingOptions.highlightChips}
                onCheckedChange={(v) =>
                  setFormattingOptions((prev) => ({
                    ...prev,
                    highlightChips: v === true,
                  }))
                }
              />
              <span className="text-sm">Highlight Chips</span>
            </label>
          </div>
        )}

        <textarea
          className="flex-1 w-full p-2 font-mono text-sm border border-border rounded-lg bg-textured text-gray-900 dark:text-gray-100"
          value={html[viewMode]}
          readOnly
        />
      </div>
    );
  },
);
