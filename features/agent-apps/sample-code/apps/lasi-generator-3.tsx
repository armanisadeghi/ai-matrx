import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Search,
  Zap,
  TrendingUp,
  GitBranch,
  Link2,
  Layers
} from "lucide-react";

export default function LSIKeywordGenerator({
  onExecute,
  response,
  isStreaming,
  isExecuting,
  error,
  rateLimitInfo,
}) {
  const [variables, setVariables] = useState({
    primary_keyword: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!variables.primary_keyword.trim()) return;
    await onExecute(variables);
  };

  const isFormValid = variables.primary_keyword.trim().length > 0;

  // Parse the response to extract structured data
  const parseResponse = (text) => {
    if (!text) return null;

    const sections = {
      parent: [],
      child: [],
      natural: [],
      related: [],
    };

    const lines = text.split("\n");
    let currentSection = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes("### Parent LSIs")) {
        currentSection = "parent";
      } else if (trimmed.includes("### Child LSIs")) {
        currentSection = "child";
      } else if (trimmed.includes("### Natural LSIs")) {
        currentSection = "natural";
      } else if (trimmed.includes("### Related LSIs")) {
        currentSection = "related";
      } else if (trimmed.startsWith("-") && currentSection) {
        const keyword = trimmed.substring(1).trim();
        if (keyword) {
          sections[currentSection].push(keyword);
        }
      }
    }

    return sections;
  };

  const parsedData = parseResponse(response);
  const hasResults =
    parsedData && Object.values(parsedData).some((arr) => arr.length > 0);

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="pt-8 pb-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-xl flex-shrink-0">
              <Search className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2 flex-1">
              <h1 className="text-4xl font-bold text-foreground">
                LSI Keyword Generator
              </h1>
              <p className="text-muted-foreground text-lg">
                Generate comprehensive LSI keyword variations for SEO
                optimization. Get parent, child, natural, and related keywords
                instantly.
              </p>
            </div>
          </div>
        </div>

        {/* Rate Limit Warning */}
        {rateLimitInfo &&
          rateLimitInfo.remaining <= 2 &&
          rateLimitInfo.remaining > 0 && (
            <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg backdrop-blur-sm">
              <p className="text-sm text-warning text-center">
                ⚠️ Only {rateLimitInfo.remaining} free generations remaining.
                <a
                  href="/sign-up"
                  className="underline ml-1 font-semibold hover:text-warning/80 transition-colors"
                >
                  Sign up
                </a>{" "}
                for unlimited access.
              </p>
            </div>
          )}

        {/* Input Form - Compact when results are shown */}
        <Card
          className={`border-2 transition-all duration-300 ${hasResults ? "shadow-sm" : "shadow-xl border-primary/20"}`}
        >
          <CardContent className={hasResults ? "pt-4 pb-4" : "pt-6 pb-6"}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                {!hasResults && (
                  <Label htmlFor="keyword" className="text-base font-semibold">
                    Primary Keyword
                  </Label>
                )}
                <div className="flex gap-3">
                  <Input
                    id="keyword"
                    value={variables.primary_keyword}
                    onChange={(e) =>
                      setVariables({
                        ...variables,
                        primary_keyword: e.target.value,
                      })
                    }
                    placeholder="e.g., Computer Repair Shop, Bike Shop, Breast Augmentation..."
                    disabled={isExecuting}
                    className={`${hasResults ? "h-11" : "h-12"} text-base`}
                    autoFocus={!hasResults}
                  />
                  <Button
                    type="submit"
                    disabled={!isFormValid || isExecuting || isStreaming}
                    className={`${hasResults ? "h-11 px-6" : "h-12 px-8"} font-semibold`}
                    size={hasResults ? "default" : "lg"}
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Generate LSIs
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="border-2 border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <Search className="w-5 h-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-destructive text-lg">
                    {error.type}
                  </p>
                  <p className="text-sm text-destructive/80 mt-1">
                    {error.message}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Display */}
        {hasResults && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Parent LSIs */}
            {parsedData.parent.length > 0 && (
              <Card className="border-2 border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent hover:shadow-lg transition-all duration-300">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <div className="text-blue-600 dark:text-blue-400">
                        Parent LSIs
                      </div>
                      <div className="text-xs font-normal text-muted-foreground mt-0.5">
                        Broader terms encompassing your keyword
                      </div>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.parent.map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-full text-sm font-medium text-blue-700 dark:text-blue-300 transition-colors cursor-default"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Child LSIs */}
            {parsedData.child.length > 0 && (
              <Card className="border-2 border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent hover:shadow-lg transition-all duration-300">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <GitBranch className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                      <div className="text-purple-600 dark:text-purple-400">
                        Child LSIs
                      </div>
                      <div className="text-xs font-normal text-muted-foreground mt-0.5">
                        More specific variations of your keyword
                      </div>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.child.map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-full text-sm font-medium text-purple-700 dark:text-purple-300 transition-colors cursor-default"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Natural LSIs */}
            {parsedData.natural.length > 0 && (
              <Card className="border-2 border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent hover:shadow-lg transition-all duration-300">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <Layers className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <div className="text-green-600 dark:text-green-400">
                        Natural LSIs
                      </div>
                      <div className="text-xs font-normal text-muted-foreground mt-0.5">
                        Direct synonyms and equivalent terms
                      </div>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.natural.map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-full text-sm font-medium text-green-700 dark:text-green-300 transition-colors cursor-default"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Related LSIs */}
            {parsedData.related.length > 0 && (
              <Card className="border-2 border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent hover:shadow-lg transition-all duration-300">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-orange-500/10 rounded-lg">
                      <Link2 className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <div className="text-orange-600 dark:text-orange-400">
                        Related LSIs
                      </div>
                      <div className="text-xs font-normal text-muted-foreground mt-0.5">
                        Associated services and topics
                      </div>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.related.map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded-full text-sm font-medium text-orange-700 dark:text-orange-300 transition-colors cursor-default"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Streaming Indicator */}
        {isStreaming && (
          <div className="flex items-center justify-center gap-3 py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-lg text-muted-foreground font-medium">
              Analyzing keyword variations...
            </span>
          </div>
        )}

        {/* Raw Response Fallback (if parsing fails) */}
        {response && !hasResults && !isStreaming && (
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                LSI Keywords
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none dark:prose-invert">
                <pre className="whitespace-pre-wrap text-sm bg-muted/50 p-4 rounded-lg overflow-x-auto">
                  {response}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info Footer */}
        {!response && !isExecuting && (
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
                <div className="space-y-2">
                  <div className="p-3 bg-blue-500/10 rounded-lg w-fit mx-auto">
                    <TrendingUp className="w-6 h-6 text-blue-500" />
                  </div>
                  <h3 className="font-semibold text-sm">Parent LSIs</h3>
                  <p className="text-xs text-muted-foreground">
                    Broader category terms
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="p-3 bg-purple-500/10 rounded-lg w-fit mx-auto">
                    <GitBranch className="w-6 h-6 text-purple-500" />
                  </div>
                  <h3 className="font-semibold text-sm">Child LSIs</h3>
                  <p className="text-xs text-muted-foreground">
                    Specific variations
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="p-3 bg-green-500/10 rounded-lg w-fit mx-auto">
                    <Layers className="w-6 h-6 text-green-500" />
                  </div>
                  <h3 className="font-semibold text-sm">Natural LSIs</h3>
                  <p className="text-xs text-muted-foreground">
                    Direct synonyms
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="p-3 bg-orange-500/10 rounded-lg w-fit mx-auto">
                    <Link2 className="w-6 h-6 text-orange-500" />
                  </div>
                  <h3 className="font-semibold text-sm">Related LSIs</h3>
                  <p className="text-xs text-muted-foreground">
                    Associated topics
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
