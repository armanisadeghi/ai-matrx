"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type RuntimeBrokerValues = Record<string, unknown>;

/** Live applet broker values — reads the runtime `broker` slice when mounted. */
function selectRuntimeBrokerValues(state: RootState): RuntimeBrokerValues {
  const brokerSlice = (
    state as RootState & { broker?: { brokers?: RuntimeBrokerValues } }
  ).broker;
  return brokerSlice?.brokers ?? {};
}

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

// Reusable copy button component
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

const BrokerValuesAdvancedViewer = () => {
  const brokers = useAppSelector(selectRuntimeBrokerValues);
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);

  // Get broker keys for the left column
  const brokerKeys = Object.keys(brokers);

  // Get the value of the selected broker
  const selectedValue = selectedBroker ? brokers[selectedBroker] : null;

  // Custom JSON formatter to handle long text better
  const formatValue = (value: any): React.ReactNode => {
    if (value === null) return <span className="text-gray-500">null</span>;
    if (value === undefined)
      return <span className="text-gray-500">undefined</span>;

    if (typeof value === "string") {
      // For strings, wrap them in quotes but ensure they break properly
      return (
        <span className="text-green-600 dark:text-green-400 break-all">
          "{value}"
        </span>
      );
    }

    if (typeof value === "number") {
      return <span className="text-blue-600 dark:text-blue-400">{value}</span>;
    }

    if (typeof value === "boolean") {
      return (
        <span className="text-purple-600 dark:text-purple-400">
          {String(value)}
        </span>
      );
    }

    if (Array.isArray(value)) {
      return (
        <div className="pl-4">
          [
          {value.map((item, index) => (
            <div key={index} className="ml-2">
              {formatValue(item)}
              {index < value.length - 1 && ","}
            </div>
          ))}
          ]
        </div>
      );
    }

    if (typeof value === "object") {
      return (
        <div className="pl-4">
          {"{"}
          {Object.entries(value).map(([key, val], index, arr) => (
            <div key={key} className="ml-2">
              <span className="text-yellow-600 dark:text-yellow-400">
                "{key}"
              </span>
              : {formatValue(val)}
              {index < arr.length - 1 && ","}
            </div>
          ))}
          {"}"}
        </div>
      );
    }

    return String(value);
  };

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

        {/* Right column: Raw value display */}
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
              <div className="font-mono text-sm text-slate-800 dark:text-slate-200">
                {selectedValue === null
                  ? "Select a broker from the list"
                  : formatValue(selectedValue)}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrokerValuesAdvancedViewer;
