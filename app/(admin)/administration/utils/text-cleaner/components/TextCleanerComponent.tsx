"use client";

import React, { useCallback } from "react";
import { useTextCleaner } from "../hooks/useTextCleaner";
import { useClipboard } from "@/hooks/useClipboard";
import { textContext } from "@/app/(admin)/administration/utils/text-cleaner/configs";
import AnimatedSelect from "@/components/matrx/AnimatedForm/AnimatedSelect";
import { FormField } from "@/types/AnimatedFormTypes";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

import { toast } from "@/components/ui/use-toast";

type GroupedPatterns = {
  [key: string]: Array<{
    key: string;
    pattern: any;
  }>;
};

export const TextCleanerComponent: React.FC = () => {
  const {
    inputText,
    cleanedText,
    prefixes,
    suffixes,
    selectedContexts,
    activePatterns,
    patterns,
    removeDuplicates,
    preserveClasses,
    preserveStyles,
    preserveDataAttributes,
    preserveAriaAttributes,
    handleContextChange,
    handleInputChange,
    setRemoveDuplicates,
    setPreserveClasses,
    setPreserveStyles,
    setPreserveDataAttributes,
    setPreserveAriaAttributes,
    processText,
    extractText,
    togglePattern,
    errorMode,
    errorFormat,
    parsedErrors,
    errorStats,
    toggleErrorMode,
    changeErrorFormat,
    clearErrors,
  } = useTextCleaner();

  const { copyText } = useClipboard();

  const handleRefresh = useCallback(() => {
    processText(inputText);
    toast({
      title: "Text Updated",
      description: "The text has been refreshed with current settings.",
      duration: 2000,
    });
  }, [processText, inputText]);

  const formatNumber = useCallback((num: number) => {
    return num.toLocaleString();
  }, []);

  const handleCopyTextWithPrefixSuffix = useCallback(
    async (index: number) => {
      const prefix = prefixes[index];
      const suffix = suffixes[index];

      let combinedText = "";
      if (prefix) combinedText += `${prefix}\n\n`;
      combinedText += cleanedText;
      if (suffix) combinedText += `\n\n${suffix}`;

      await copyText(combinedText, "Text with prefix and suffix copied!");
    },
    [prefixes, suffixes, cleanedText, copyText],
  );

  const getGroupedPatterns = useCallback((): GroupedPatterns => {
    return Object.entries(patterns).reduce(
      (acc: GroupedPatterns, [key, pattern]) => {
        let category = "Other";
        if (key.toLowerCase().includes("entity")) {
          category = "Entities";
        } else if (
          key.toLowerCase().includes("attr") ||
          key.toLowerCase().includes("class") ||
          key.toLowerCase().includes("style")
        ) {
          category = "Attributes";
        } else if (
          key.toLowerCase().includes("tag") ||
          key.toLowerCase().includes("content")
        ) {
          category = "Content";
        } else if (key.toLowerCase().includes("event")) {
          category = "Events";
        }

        if (!acc[category]) {
          acc[category] = [];
        }

        acc[category].push({ key, pattern });
        return acc;
      },
      {},
    );
  }, [patterns]);

  const contextSelectField: FormField = {
    name: "context",
    label: "Context",
    type: "select",
    options: textContext.map((entry) => entry.name),
    required: false,
  };

  const renderErrorStats = useCallback(() => {
    if (!errorStats) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{errorStats.total} Total Errors</Badge>
          {errorStats.bySeverity.error && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errorStats.bySeverity.error} Errors
            </Badge>
          )}
          {errorStats.bySeverity.warning && (
            <Badge variant="warning" className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {errorStats.bySeverity.warning} Warnings
            </Badge>
          )}
          {errorStats.bySeverity.info && (
            <Badge variant="info" className="flex items-center gap-1">
              <Info className="w-3 h-3" />
              {errorStats.bySeverity.info} Info
            </Badge>
          )}
        </div>
      </div>
    );
  }, [errorStats]);

  const renderErrorDetails = useCallback(() => {
    if (!parsedErrors?.length) return null;

    return (
      <Tabs defaultValue="essential" className="w-full">
        <TabsList>
          <TabsTrigger
            value="essential"
            onClick={() => changeErrorFormat("essential")}
          >
            Essential
          </TabsTrigger>
          <TabsTrigger value="basic" onClick={() => changeErrorFormat("basic")}>
            Basic
          </TabsTrigger>
          <TabsTrigger
            value="verbose"
            onClick={() => changeErrorFormat("verbose")}
          >
            Verbose
          </TabsTrigger>
          <TabsTrigger value="json" onClick={() => changeErrorFormat("json")}>
            JSON
          </TabsTrigger>
        </TabsList>
        <TabsContent value="essential" className="space-y-4">
          {parsedErrors.map((error, index) => {
            const suggestions = error.parsed?.error.suggestions;
            return (
              <Card key={index} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  {error.parsed?.error.severity === "error" && (
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  )}
                  {error.parsed?.error.severity === "warning" && (
                    <AlertTriangle className="w-4 h-4 text-warning" />
                  )}
                  <span className="font-medium">
                    {error.parsed?.error.errorCode}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap text-sm">
                  {error.parsed?.essential}
                </pre>
                {suggestions && suggestions.length > 0 && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    <div className="font-medium">Quick Fix:</div>
                    <div>{suggestions[0]}</div>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => copyText(error.parsed?.essential || "")}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="basic" className="space-y-4">
          {parsedErrors.map((error, index) => (
            <Card key={index} className="p-4">
              <pre className="whitespace-pre-wrap text-sm">
                {error.parsed?.basic}
              </pre>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => copyText(error.parsed?.basic || "")}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="verbose" className="space-y-4">
          {parsedErrors.map((error, index) => (
            <Card key={index} className="p-4">
              <pre className="whitespace-pre-wrap text-sm">
                {error.parsed?.verbose}
              </pre>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => copyText(error.parsed?.verbose || "")}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="json" className="space-y-4">
          {parsedErrors.map((error, index) => (
            <Card key={index} className="p-4">
              <pre className="whitespace-pre-wrap text-sm">
                {error.parsed?.json}
              </pre>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => copyText(error.parsed?.json || "")}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    );
  }, [parsedErrors, changeErrorFormat, copyText]);

  return (
    <div className="w-full space-y-4">
      <Card className="p-4">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-6">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Clean-up Options</h3>
              <div className="flex items-center space-x-2">
                <Switch
                  id="remove-duplicates"
                  checked={removeDuplicates}
                  onCheckedChange={(checked) => {
                    setRemoveDuplicates(checked);
                    processText(inputText);
                  }}
                />
                <Label htmlFor="remove-duplicates">Remove Duplicates</Label>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Preserve Attributes</h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="preserve-classes"
                    checked={preserveClasses}
                    onCheckedChange={(checked) => {
                      setPreserveClasses(checked);
                      processText(inputText);
                    }}
                  />
                  <Label htmlFor="preserve-classes">Classes</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="preserve-styles"
                    checked={preserveStyles}
                    onCheckedChange={(checked) => {
                      setPreserveStyles(checked);
                      processText(inputText);
                    }}
                  />
                  <Label htmlFor="preserve-styles">Styles</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="preserve-data-attrs"
                    checked={preserveDataAttributes}
                    onCheckedChange={(checked) => {
                      setPreserveDataAttributes(checked);
                      processText(inputText);
                    }}
                  />
                  <Label htmlFor="preserve-data-attrs">Data Attributes</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="preserve-aria-attrs"
                    checked={preserveAriaAttributes}
                    onCheckedChange={(checked) => {
                      setPreserveAriaAttributes(checked);
                      processText(inputText);
                    }}
                  />
                  <Label htmlFor="preserve-aria-attrs">ARIA Attributes</Label>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Error Handling</h3>
              <div className="flex items-center space-x-2">
                <Switch
                  id="error-mode"
                  checked={errorMode}
                  onCheckedChange={toggleErrorMode}
                />
                <Label htmlFor="error-mode">Error Mode</Label>
              </div>
            </div>

            <div className="ml-auto">
              <Button
                variant="outline"
                onClick={handleRefresh}
                className="flex items-center space-x-2"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div
        className={`grid gap-4 ${errorMode ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"}`}
      >
        {/* Input textarea remains the same */}
        <div className="space-y-2">
          <div className="relative">
            <Textarea
              value={inputText}
              onChange={(e) => handleInputChange(e.target.value)}
              rows={10}
              className="w-full resize-y"
              placeholder={
                errorMode
                  ? "Paste your error message here"
                  : "Paste your text here"
              }
            />
            <Button
              className="absolute right-2 bottom-2 p-2 h-[40px] min-h-[40px]"
              onClick={() => copyText(inputText)}
            >
              <Copy size={20} />
            </Button>
          </div>
          <Card className="border bg-muted">
            <CardContent className="p-3">
              <p className="text-sm text-muted-foreground">
                Characters: {formatNumber(inputText.length)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Cleaned text textarea remains the same */}
        <div className="space-y-2">
          <div className="relative">
            <Textarea
              value={cleanedText}
              readOnly
              rows={10}
              className="w-full resize-y"
              placeholder={
                errorMode
                  ? "Formatted error will appear here"
                  : "Your cleaned text will appear here"
              }
            />
            <Button
              className="absolute right-2 bottom-2 p-2 h-[40px] min-h-[40px]"
              onClick={() => copyText(cleanedText)}
            >
              <Copy size={20} />
            </Button>
          </div>
          <Card className="border bg-muted">
            <CardContent className="p-3">
              <p className="text-sm text-muted-foreground">
                Characters: {formatNumber(cleanedText.length)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Error Analysis Column */}
        {errorMode && (
          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="text-sm font-medium mb-4">Error Analysis</h3>
              {renderErrorStats()}
            </Card>
            {renderErrorDetails()}
          </div>
        )}
      </div>

      <Card className="mt-4">
        <CardContent className="p-4">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                Pattern Selection
                <span className="text-muted-foreground">
                  {activePatterns.length} active
                </span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-[300px] w-full rounded-md border p-4">
                {Object.entries(getGroupedPatterns()).map(
                  ([category, items]) => (
                    <div key={category} className="mb-6">
                      <h3 className="text-sm font-medium mb-2">{category}</h3>
                      <div className="space-y-2">
                        {items.map(({ key, pattern }) => (
                          <div
                            key={key}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={key}
                              checked={activePatterns.includes(key)}
                              onCheckedChange={() => {
                                togglePattern(key);
                                processText(inputText);
                              }}
                            />
                            <Label
                              htmlFor={key}
                              className="text-sm text-muted-foreground"
                            >
                              {key}
                              {pattern.replacement === null
                                ? " (remove)"
                                : " (replace)"}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-8">
        {selectedContexts.map((context, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-stretch space-x-2">
              <AnimatedSelect
                field={contextSelectField}
                value={
                  context
                    ? textContext.find((c) => c.id === context.id)?.name || ""
                    : ""
                }
                onChange={(value) => {
                  const selectedContext = textContext.find(
                    (c) => c.name === value,
                  );
                  if (selectedContext) {
                    handleContextChange(index, selectedContext.id);
                  }
                }}
                hideLabel={true}
                className="flex-grow h-[40px] min-h-[40px]"
              />
              <Button
                onClick={() => handleCopyTextWithPrefixSuffix(index)}
                className="p-2 flex-shrink-0 flex items-center justify-center h-[40px] min-h-[40px]"
              >
                <Copy size={20} />
              </Button>
            </div>
            <Textarea
              value={prefixes[index] || ""}
              readOnly
              rows={8}
              className="w-full resize-y"
              placeholder="Prefix will appear here"
            />
            <Textarea
              value={suffixes[index] || ""}
              readOnly
              rows={8}
              className="w-full resize-y"
              placeholder="Suffix will appear here"
            />
          </div>
        ))}
      </div>

      <Button onClick={() => copyText(extractText(inputText))}>
        Extract and Copy Text Between Markers
      </Button>
    </div>
  );
};
