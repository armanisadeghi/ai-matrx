"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/ui/spinner";

interface PreviewLoadingWithMessageProps {
  isLoading: boolean;
  isPreview: boolean;
}

export default function PreviewLoadingWithMessage({ isLoading, isPreview }: PreviewLoadingWithMessageProps) {
  const [showMessage, setShowMessage] = useState(true);
  
  useEffect(() => {
    if (!isLoading && isPreview) {
      const timer = setTimeout(() => {
        setShowMessage(false);
      }, 2000);
      
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [isLoading, isPreview]);
  
  if (!isPreview || (isPreview && !isLoading && !showMessage)) {
    return null;
  }
  
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-3">
      <LoadingSpinner />
      <p className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold text-lg px-4 py-2 rounded-md shadow-sm border border-indigo-200 dark:border-indigo-800 transition-all">
        Not intended to match the exact sizing and spacing
      </p>
    </div>
  );
}
