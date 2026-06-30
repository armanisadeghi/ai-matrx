import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Check, Copy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const JsonDataDisplay = (parsedContent: any) => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  let displayContent = "";
  try {
    displayContent = JSON.stringify(parsedContent, null, 2);
  } catch (err) {
    setError("Failed to parse content");
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-4 right-4 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Copy to clipboard"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
      <pre className="p-4 pr-12 whitespace-pre-wrap overflow-y-auto font-mono text-sm bg-gray-50 dark:bg-gray-900 rounded-md">
        {displayContent}
      </pre>
    </Card>
  );
};

export default JsonDataDisplay;
