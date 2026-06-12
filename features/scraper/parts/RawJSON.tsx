"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { safeStringify, copyToClipboard } from "../utils/scraper-utils";
import { formatJson } from "@/utils/json/json-cleaner-utility";
import { CopyIcon } from "lucide-react";

/**
 * Component for displaying raw JSON data
 */
const RawJSON = ({ pageData }) => {
  if (!pageData) {
    return <div className="p-4 text-gray-500 dark:text-gray-400">No raw data available</div>;
  }
  
  const jsonStr = formatJson(pageData);
  
  return (
    <div className="p-4">
      <div className="mb-4 flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => copyToClipboard(jsonStr)}>
          <CopyIcon className="w-4 h-4" />
        </Button>
      </div>
      <pre className="whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 p-4 rounded-md text-sm text-gray-800 dark:text-gray-200 overflow-auto max-h-[70dvh]">
        {jsonStr}
      </pre>
    </div>
  );
};

export default RawJSON;