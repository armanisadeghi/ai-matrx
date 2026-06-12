"use client";

import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Card, CardTitle } from "@/components/ui/card";
import { CheckCircleIcon, XCircleIcon } from "lucide-react";
import StreamDisplayOverlay from "./StreamDisplayOverlay";
import { MouseEvent } from "react";

interface StreamBooleanDisplayProps {
  title: string;
  selector: (state: RootState) => boolean;
  isFullscreen?: boolean;
}

const StreamBooleanDisplay = ({
  title,
  selector,
  isFullscreen = false,
}: StreamBooleanDisplayProps) => {
  // Safely handle potentially null/undefined values
  const rawValue = useSelector(selector);
  const value = Boolean(rawValue);

  // Prevent event propagation to avoid triggering fullscreen mode
  const handleInteractiveClick = (e: MouseEvent) => {
    e.stopPropagation();
  };

  // The boolean indicator display
  const renderIndicator = () => (
    <div
      className="flex-grow flex items-center justify-center"
      onClick={handleInteractiveClick}
    >
      {value ? (
        <div className="flex flex-col items-center space-y-2">
          <CheckCircleIcon
            className={
              isFullscreen
                ? "h-24 w-24 text-green-500 dark:text-green-400"
                : "h-12 w-12 text-green-500 dark:text-green-400"
            }
          />
          <span
            className={
              isFullscreen
                ? "text-lg font-medium text-green-600 dark:text-green-400"
                : "text-sm font-medium text-green-600 dark:text-green-400"
            }
          >
            True
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-2">
          <XCircleIcon
            className={
              isFullscreen
                ? "h-24 w-24 text-gray-400 dark:text-gray-500"
                : "h-12 w-12 text-gray-400 dark:text-gray-500"
            }
          />
          <span
            className={
              isFullscreen
                ? "text-lg font-medium text-gray-500 dark:text-gray-400"
                : "text-sm font-medium text-gray-500 dark:text-gray-400"
            }
          >
            False
          </span>
        </div>
      )}
    </div>
  );

  // If fullscreen, just return the indicator in a centered container
  if (isFullscreen) {
    return (
      <div
        className="flex items-center justify-center h-full"
        onClick={handleInteractiveClick}
      >
        {renderIndicator()}
      </div>
    );
  }

  // Normal view with card container
  return (
    <Card className="h-full bg-gray-50 dark:bg-gray-900 border-border flex flex-col">
      <CardHeader className="p-3 pb-0">
        <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 flex-grow">
        <StreamDisplayOverlay title={title} className="h-[calc(95dvh-5rem)]">
          {renderIndicator()}
        </StreamDisplayOverlay>
      </CardContent>
    </Card>
  );
};

export default StreamBooleanDisplay;
