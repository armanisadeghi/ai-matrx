"use client";

import NextNavCardFull from "@/components/matrx/navigation/NextNavCardFull";
import { buildModuleNavItems } from "@/components/matrx/navigation/buildModuleNavItems";
import { filteredPages } from "./config";
import { Box, TestTube } from "lucide-react";

export default function ExperimentalPromptsPage() {
  const items = buildModuleNavItems(filteredPages, {
    defaultIcon: Box,
    iconClassName: "w-5 h-5 sm:w-6 sm:h-6 text-primary",
  });

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-5xl">
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-2 mb-2">
              <TestTube className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              <h1 className="text-2xl sm:text-3xl font-bold">
                Experimental Features
              </h1>
            </div>
            <p className="text-sm sm:text-base text-muted-foreground">
              Explore and test cutting-edge prompt engineering tools
            </p>
          </div>
          <NextNavCardFull
            items={items}
            variant="feature"
            showPath={true}
            columns={1}
          />
        </div>
      </div>
    </div>
  );
}
