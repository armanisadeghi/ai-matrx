"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors } from "@/lib/redux/brokerSlice";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

// Helper function to copy text to clipboard
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error("Failed to copy text: ", err);
    return false;
  }
};

// Recursive component for displaying nested structures
const RecursiveValueViewer = ({ value, path = "", depth = 0 }) => {
  // For rendering primitive values
  const renderPrimitive = (val, type) => {
    if (val === null) return <span className="text-gray-500 italic">null</span>;
    if (val === undefined)
      return <span className="text-gray-500 italic">undefined</span>;

    switch (type) {
      case "boolean":
        return (
          <Badge
            variant={val ? "success" : "destructive"}
            className="font-mono"
          >
            {val.toString()}
          </Badge>
        );
      case "number":
        return (
          <span className="font-mono text-blue-600 dark:text-blue-400">
            {val}
          </span>
        );
      case "string":
        // Handle URLs specially
        if (typeof val === "string" && val.startsWith("http")) {
          return (
            <a
              href={val}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline break-all"
            >
              {val}
            </a>
          );
        }
        return (
          <span className="font-mono text-green-600 dark:text-green-400 break-all">
            "{val}"
          </span>
        );
      default:
        return <span className="font-mono">{String(val)}</span>;
    }
  };

  // For arrays: render each item with its index
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <div className="text-gray-500 italic pl-4 py-1">Empty array</div>;
    }

    return (
      <div className="pl-4 border-t border-slate-300 dark:border-slate-700">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm pt-1 pb-3">
          <Badge variant="outline" className="font-mono border-none">
            (LIST/ARRAY: {value.length} items inside)
          </Badge>
        </div>
        {value.map((item, index) => (
          <div key={`${path}.${index}`} className="py-1">
            <div className="flex items-start gap-2">
              <span className="text-slate-500 dark:text-slate-400 font-mono min-w-[50px]">
                [{index}]:
              </span>
              <div className="flex-1">
                {typeof item === "object" && item !== null ? (
                  <RecursiveValueViewer
                    value={item}
                    path={`${path}.${index}`}
                    depth={depth + 1}
                  />
                ) : (
                  renderPrimitive(item, typeof item)
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // For objects: render each key-value pair
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return <div className="text-gray-500 italic pl-4 py-1">Empty object</div>;
    }

    return (
      <div className="pl-4 border-t border-slate-300 dark:border-slate-700">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm pt-1 pb-3">
          <Badge variant="outline" className="font-mono border-none">
            (STRUCTURED DATA OBJECT: {entries.length} individually named items
            inside)
          </Badge>
        </div>
        {entries.map(([key, val]) => (
          <div key={`${path}.${key}`} className="py-1">
            <div className="flex items-start gap-2">
              <span
                className="text-yellow-600 dark:text-yellow-400 font-mono min-w-[120px] truncate"
                title={key}
              >
                {key}:
              </span>
              <div className="flex-1">
                {typeof val === "object" && val !== null ? (
                  <RecursiveValueViewer
                    value={val}
                    path={`${path}.${key}`}
                    depth={depth + 1}
                  />
                ) : (
                  renderPrimitive(val, typeof val)
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // For primitive values
  return renderPrimitive(value, typeof value);
};

const CopyButton = ({ text, size = "sm" }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Button
      variant="ghost"
      size={size as "default" | "icon" | "sm" | "lg"}
      className="h-6 w-6 p-0 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full"
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
      )}
    </Button>
  );
};

const BrokerValuesSimpleViewer = () => {
  const brokers = useAppSelector(brokerSelectors.selectAllValues);
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);

  // Get broker keys for the left column
  const brokerKeys = Object.keys(brokers);

  // Get the value of the selected broker
  const selectedValue = selectedBroker ? brokers[selectedBroker] : null;

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-900">
      <p className="text-sm text-slate-600 dark:text-slate-400 px-4 py-2 mb-2 max-w-full">
        Brokers are the the source of Dynamic data shared across the entire
        application. A broker value can be used in any Workflow, Recipe, Applet
        or updated in real time. Some Brokers are created and set by the system,
        but most are specific to your company, your app, or your applets. You
        can set values in one applet and then access them in another.
      </p>

      <div className="flex h-full w-full gap-6">
        {/* Left column: List of brokers */}
        <div className="w-1/3 border-r border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-medium mb-3 px-4 py-2 text-slate-800 dark:text-slate-200">
            Broker Keys
          </h3>
          <ScrollArea className="h-[calc(100%-3rem)] w-full">
            <div className="px-2">
              {brokerKeys.map((key) => (
                <div
                  key={key}
                  className="flex items-center mb-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md"
                >
                  <button
                    onClick={() => setSelectedBroker(key)}
                    className={`flex-1 text-left px-4 py-2 font-mono text-sm rounded-md ${
                      selectedBroker === key
                        ? "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {key}
                  </button>
                  <div className="pr-2">
                    <CopyButton text={key} />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right column: Key-value pair display */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-3 px-4 py-2">
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">
              {selectedBroker || "Select a broker"}
            </h3>
            {selectedValue !== null && (
              <CopyButton
                text={
                  typeof selectedValue === "object"
                    ? JSON.stringify(selectedValue, null, 2)
                    : String(selectedValue)
                }
                size="default"
              />
            )}
          </div>
          <div className="flex-1 bg-white dark:bg-slate-950 rounded-md p-4 border border-slate-200 dark:border-slate-800 overflow-hidden h-[calc(100%-3.5rem)]">
            <ScrollArea className="h-full w-full">
              <div className="text-sm text-slate-800 dark:text-slate-200 pb-4">
                {selectedValue === null ? (
                  <span className="text-gray-500 italic">
                    Select a broker from the list
                  </span>
                ) : selectedBroker ? (
                  <RecursiveValueViewer
                    value={selectedValue}
                    path={selectedBroker}
                  />
                ) : null}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrokerValuesSimpleViewer;
