"use client";

import React from "react";
import { notFound, useRouter } from "next/navigation";
import {
  componentList,
  ComponentEntry,
  ComponentCategory,
  categoryIcons,
  categoryNames,
} from "../parts/component-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ExternalLink, FileCode } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import dynamic from "next/dynamic";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

// Create a type for the dynamic component that accepts component prop
type ComponentDisplayProps = {
  component?: ComponentEntry;
};

export default function ComponentDetailPage({
  params,
}: {
  params: Promise<{ componentId: string }>;
}) {
  const router = useRouter();
  const resolvedParams = React.use(params);
  const component = componentList.find(
    (c) => c.id === resolvedParams.componentId,
  );

  if (!component) {
    return notFound();
  }

  // Dynamically import the selected component with fallback
  const ComponentDisplay = dynamic<ComponentDisplayProps>(
    () =>
      import(`../component-displays/${component.id}`).catch(() => {
        // Fallback to placeholder if component display doesn't exist
        return import("../component-displays/placeholder");
      }),
    {
      loading: () => (
        <div className="flex items-center justify-center h-48">
          Loading component...
        </div>
      ),
      ssr: false,
    },
  );

  // Find related components (share at least one category)
  const relatedComponents = componentList
    .filter(
      (c) =>
        c.categories.some((cat) => component.categories.includes(cat)) &&
        c.id !== component.id,
    )
    .slice(0, 3);

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div className="md:col-span-3">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChevronLeftTapButton onClick={() => router.back()} />
                <span className="shrink-0">
                  {categoryIcons[component.categories[0]]}
                </span>
                <span className="min-w-0 break-words">{component.name}</span>
              </CardTitle>

              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mt-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {component.categories.map((cat) => (
                      <Badge
                        key={cat}
                        className="text-xs font-medium px-2 py-0.5"
                      >
                        {categoryNames[cat]}
                      </Badge>
                    ))}
                    {component.tags?.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-xs font-normal"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <CardDescription className="mt-2">
                    {component.description}
                  </CardDescription>
                  <p className="text-[11px] text-muted-foreground mt-2 break-words">
                    <code className="text-[11px] py-1 rounded break-all">
                      {component.path}
                    </code>
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 w-full sm:w-auto sm:shrink-0"
                >
                  <FileCode className="h-4 w-4" />
                  Source
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-3 sm:p-4 rounded-lg border-border bg-gray-50 dark:bg-gray-900 overflow-x-auto">
                <ComponentDisplay component={component} />
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="md:col-span-1">
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Categories
                </h4>
                <div className="flex flex-col gap-1 mt-1">
                  {component.categories.map((cat) => (
                    <p key={cat} className="flex items-center gap-2">
                      {categoryIcons[cat]}
                      {categoryNames[cat]}
                    </p>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Tags
                </h4>
                <div className="flex flex-wrap gap-1 mt-1">
                  {component.tags?.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-xs font-normal"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {relatedComponents.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Related Components</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-auto max-h-64">
                  <div className="p-4 space-y-2">
                    {relatedComponents.map((related) => (
                      <Button
                        key={related.id}
                        variant="ghost"
                        className="w-full justify-start font-normal text-left"
                        onClick={() =>
                          router.push(
                            `/administration/official-components/${related.id}`,
                          )
                        }
                      >
                        <div className="flex items-center gap-2">
                          {categoryIcons[related.categories[0]]}
                          <span>{related.name}</span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
