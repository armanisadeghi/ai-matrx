import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";

interface ParsedData {
  keyword: string;
  categories: Record<string, string[]>;
}
import {
  Loader2,
  Search,
  Copy,
  Plus,
  X,
  Check,
  Edit2,
  FileText,
  FileSpreadsheet,
  RefreshCw,
  Zap
} from "lucide-react";

export default function LSIMarkdownGenerator({
  onExecute,
  response,
  isStreaming,
  isExecuting,
  error,
  rateLimitInfo,
}) {
  const [variables, setVariables] = useState({
    primary_keyword: "Bike Shop",
  });

  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [parseError, setParseError] = useState(false);
  const [addKeywordCategory, setAddKeywordCategory] = useState<string | null>(
    null,
  );
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [copiedCategory, setCopiedCategory] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Parse the streaming response
  useEffect(() => {
    if (!response) {
      setParsedData(null);
      setParseError(false);
      return;
    }

    try {
      const match = response.match(
        /<grouped_list>([\s\S]*?)(<\/grouped_list>|$)/,
      );
      if (!match) return;

      const content = match[1];
      const lines = content.split("\n").filter((line) => line.trim());
      const data: ParsedData = { keyword: "", categories: {} };
      let currentCategory: string | null = null;

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("## ")) {
          data.keyword = trimmed.replace("## ", "");
        } else if (trimmed.startsWith("### ")) {
          currentCategory = trimmed.replace("### ", "");
          data.categories[currentCategory] = [];
        } else if (trimmed.startsWith("- ") && currentCategory) {
          const keyword = trimmed.replace("- ", "");
          if (keyword) data.categories[currentCategory].push(keyword);
        }
      });

      if (!data.keyword || Object.keys(data.categories).length === 0) {
        setParseError(true);
        return;
      }

      setParseError(false);
      setParsedData(data);
    } catch (err) {
      console.error("Parse error:", err);
      setParseError(true);
    }
  }, [response]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setParsedData(null);
    setParseError(false);
    setEditMode({});
    setEditValues({});
    setHasSubmitted(true);
    await onExecute(variables);
  };

  const handleNewSearch = () => {
    setHasSubmitted(false);
    setParsedData(null);
    setParseError(false);
    setEditMode({});
    setEditValues({});
  };

  const copyToClipboard = (text, categoryName) => {
    navigator.clipboard.writeText(text);
    setCopiedCategory(categoryName);
    setTimeout(() => setCopiedCategory(null), 2000);
  };

  const copyCategory = (categoryName, keywords) => {
    const text = `${categoryName}\n${keywords.map((k) => `- ${k}`).join("\n")}`;
    copyToClipboard(text, categoryName);
  };

  const copyAllKeywords = () => {
    if (!parsedData) return;

    let text = `${parsedData.keyword}\n\n`;
    Object.entries(parsedData.categories).forEach(([category, keywords]) => {
      text += `${category}\n${keywords.map((k) => `- ${k}`).join("\n")}\n\n`;
    });

    copyToClipboard(text, "all");
  };

  const downloadAsMarkdown = () => {
    if (!parsedData) return;

    let markdown = `# ${parsedData.keyword}\n\n`;
    Object.entries(parsedData.categories).forEach(([category, keywords]) => {
      markdown += `## ${category}\n\n${keywords.map((k) => `- ${k}`).join("\n")}\n\n`;
    });

    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${parsedData.keyword.replace(/\s+/g, "-").toLowerCase()}-lsi-keywords.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAsCSV = () => {
    if (!parsedData) return;

    let csv = "Category,Keyword\n";
    Object.entries(parsedData.categories).forEach(([category, keywords]) => {
      keywords.forEach((keyword) => {
        csv += `"${category}","${keyword}"\n`;
      });
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${parsedData.keyword.replace(/\s+/g, "-").toLowerCase()}-lsi-keywords.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAsTXT = () => {
    if (!parsedData) return;

    let text = `${parsedData.keyword}\n${"=".repeat(parsedData.keyword.length)}\n\n`;
    Object.entries(parsedData.categories).forEach(([category, keywords]) => {
      text += `${category}\n${"-".repeat(category.length)}\n${keywords.map((k) => `• ${k}`).join("\n")}\n\n`;
    });

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${parsedData.keyword.replace(/\s+/g, "-").toLowerCase()}-lsi-keywords.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const addKeyword = (category: string) => {
    setAddKeywordCategory(category);
  };

  const handleAddKeywordConfirm = (newKeyword: string) => {
    if (!addKeywordCategory) return;
    setParsedData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        categories: {
          ...prev.categories,
          [addKeywordCategory]: [
            ...prev.categories[addKeywordCategory],
            newKeyword.trim(),
          ],
        },
      };
    });
    setAddKeywordCategory(null);
  };

  const removeKeyword = (category: string, index: number) => {
    setParsedData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        categories: {
          ...prev.categories,
          [category]: prev.categories[category].filter((_, i) => i !== index),
        },
      };
    });
  };

  const startEdit = (category: string, index: number, currentValue: string) => {
    const key = `${category}-${index}`;
    setEditMode({ ...editMode, [key]: true });
    setEditValues({ ...editValues, [key]: currentValue });
  };

  const saveEdit = (category: string, index: number) => {
    const key = `${category}-${index}`;
    const newValue = editValues[key];

    if (newValue && newValue.trim()) {
      setParsedData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          categories: {
            ...prev.categories,
            [category]: prev.categories[category].map((k, i) =>
              i === index ? newValue.trim() : k,
            ),
          },
        };
      });
    }

    setEditMode({ ...editMode, [key]: false });
  };

  const cancelEdit = (category: string, index: number) => {
    const key = `${category}-${index}`;
    setEditMode({ ...editMode, [key]: false });
  };

  const getCategoryColor = (category) => {
    const colors = {
      "Parent LSIs":
        "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300",
      "Child LSIs":
        "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300",
      "Natural LSIs":
        "bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300",
      "Related LSIs":
        "bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300",
    };
    return colors[category] || "bg-muted border-border text-foreground";
  };

  const getCategoryIcon = (category) => {
    if (category.includes("Parent")) return "↑";
    if (category.includes("Child")) return "↓";
    if (category.includes("Natural")) return "≈";
    if (category.includes("Related")) return "→";
    return "•";
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Compact Header */}
        {!hasSubmitted && (
          <div className="flex items-start gap-3 pt-4 pb-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0">
              <Search className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent leading-tight">
                LSI Keyword Generator
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Generate comprehensive LSI keyword variations
              </p>
            </div>
          </div>
        )}

        {/* Rate Limit Warning */}
        {rateLimitInfo &&
          rateLimitInfo.remaining <= 2 &&
          rateLimitInfo.remaining > 0 && (
            <Card className="border-warning/50 bg-warning/5">
              <CardContent className="py-3 px-4">
                <p className="text-sm text-warning flex items-center gap-2">
                  <span className="text-lg">⚠️</span>
                  Only {rateLimitInfo.remaining} free generations remaining.
                  <a
                    href="/sign-up"
                    className="underline font-semibold hover:text-warning/80"
                  >
                    Sign up
                  </a>
                  for unlimited access.
                </p>
              </CardContent>
            </Card>
          )}

        {/* Input Form - Full or Minimal */}
        {!hasSubmitted ? (
          <Card className="border-2 shadow-xl">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30">
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" />
                Enter Your Primary Keyword
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="keyword" className="text-base font-semibold">
                    Primary Keyword
                  </Label>
                  <Input
                    id="keyword"
                    value={variables.primary_keyword}
                    onChange={(e) =>
                      setVariables({ primary_keyword: e.target.value })
                    }
                    placeholder="e.g., Bike Shop, Computer Repair, Coffee Shop"
                    disabled={isExecuting}
                    className="text-lg h-12"
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter any keyword, service, product, or topic to generate
                    LSI variations
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={
                    !variables.primary_keyword.trim() ||
                    isExecuting ||
                    isStreaming
                  }
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  {isExecuting && (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  )}
                  {isExecuting
                    ? "Generating Keywords..."
                    : "Generate LSI Keywords"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-card border-2 border-border rounded-lg shadow-sm">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm text-muted-foreground flex-shrink-0">
              Keyword:
            </span>
            <span className="font-semibold text-foreground flex-1 truncate">
              {variables.primary_keyword}
            </span>
            <Button
              onClick={handleNewSearch}
              variant="ghost"
              size="sm"
              className="flex-shrink-0"
              disabled={isExecuting || isStreaming}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              New Search
            </Button>
          </div>
        )}

        {/* Loading State - Show when executing but no response yet */}
        {hasSubmitted &&
          (isExecuting || isStreaming) &&
          !parsedData &&
          !error && (
            <Card className="border-2 shadow-xl overflow-hidden">
              <div className="relative">
                {/* Animated gradient background */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 animate-pulse" />

                <CardContent className="relative py-16 px-6">
                  <div className="flex flex-col items-center justify-center space-y-6">
                    {/* Animated icon */}
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full blur-xl opacity-50 animate-pulse" />
                      <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
                        <Zap className="w-10 h-10 text-white animate-pulse" />
                      </div>
                    </div>

                    {/* Loading text */}
                    <div className="text-center space-y-2">
                      <h3 className="text-2xl font-bold text-foreground">
                        Analyzing "{variables.primary_keyword}"
                      </h3>
                      <p className="text-muted-foreground max-w-md">
                        Our AI is generating comprehensive LSI keyword
                        variations across multiple categories...
                      </p>
                    </div>

                    {/* Loading steps */}
                    <div className="w-full max-w-md space-y-3">
                      <div className="flex items-center gap-3 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        <span className="text-muted-foreground">
                          Identifying parent keywords...
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                        <span className="text-muted-foreground">
                          Finding child variations...
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                        <span className="text-muted-foreground">
                          Discovering natural LSIs...
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                        <span className="text-muted-foreground">
                          Analyzing related terms...
                        </span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full max-w-md">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-[shimmer_2s_ease-in-out_infinite] bg-[length:200%_100%]" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </div>
            </Card>
          )}

        {/* Parse Error */}
        {parseError && !isStreaming && !isExecuting && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="py-4 px-4">
              <p className="text-sm text-destructive">
                Could not parse the response. Please retry.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Error Display */}
        {error && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="py-4 px-4">
              <div className="flex items-start gap-3">
                <X className="w-5 h-5 text-destructive mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive">{error.type}</p>
                  <p className="text-sm text-destructive/80 mt-1">
                    {error.message}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {parsedData && (
          <div className="space-y-6">
            {/* Results Header with Download Options */}
            <Card className="border-2 shadow-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-bold text-foreground mb-2">
                      {parsedData.keyword}
                    </h2>
                    <p className="text-muted-foreground">
                      {Object.values(parsedData.categories).reduce(
                        (sum, arr) => sum + arr.length,
                        0,
                      )}{" "}
                      total keywords across{" "}
                      {Object.keys(parsedData.categories).length} categories
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <Button
                      onClick={copyAllKeywords}
                      variant="outline"
                      size="sm"
                    >
                      {copiedCategory === "all" ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copy All
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={downloadAsMarkdown}
                      variant="outline"
                      size="sm"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Markdown
                    </Button>
                    <Button onClick={downloadAsCSV} variant="outline" size="sm">
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      CSV
                    </Button>
                    <Button onClick={downloadAsTXT} variant="outline" size="sm">
                      <FileText className="w-4 h-4 mr-2" />
                      TXT
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Streaming Indicator */}
            {isStreaming && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating more keywords...</span>
              </div>
            )}

            {/* Category Cards */}
            <div className="grid gap-6 md:grid-cols-2">
              {Object.entries(parsedData.categories).map(
                ([category, keywords]) => (
                  <Card
                    key={category}
                    className="border-2 shadow-lg hover:shadow-xl transition-shadow"
                  >
                    <CardHeader
                      className={`${getCategoryColor(category)} border-b-2`}
                    >
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <span className="text-2xl">
                            {getCategoryIcon(category)}
                          </span>
                          {category}
                          <span className="text-sm font-normal opacity-75">
                            ({keywords.length})
                          </span>
                        </CardTitle>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => addKeyword(category)}
                            className="h-8 w-8 p-0"
                            title="Add keyword"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyCategory(category, keywords)}
                            className="h-8 w-8 p-0"
                            title="Copy category"
                          >
                            {copiedCategory === category ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <ul className="space-y-2">
                        {keywords.map((keyword, index) => {
                          const editKey = `${category}-${index}`;
                          const isEditing = editMode[editKey];

                          return (
                            <li
                              key={index}
                              className="flex items-center gap-2 group p-2 rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              <span className="text-muted-foreground select-none">
                                •
                              </span>
                              {isEditing ? (
                                <>
                                  <Input
                                    value={editValues[editKey]}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        [editKey]: e.target.value,
                                      })
                                    }
                                    className="flex-1 h-8"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        saveEdit(category, index);
                                      if (e.key === "Escape")
                                        cancelEdit(category, index);
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => saveEdit(category, index)}
                                    className="h-8 w-8 p-0"
                                  >
                                    <Check className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => cancelEdit(category, index)}
                                    className="h-8 w-8 p-0"
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <span className="flex-1 text-foreground">
                                    {keyword}
                                  </span>
                                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        startEdit(category, index, keyword)
                                      }
                                      className="h-7 w-7 p-0"
                                      title="Edit"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        removeKeyword(category, index)
                                      }
                                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                      title="Remove"
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </CardContent>
                  </Card>
                ),
              )}
            </div>

            {/* Category Descriptions */}
            {!isStreaming && (
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="text-lg">
                    Understanding LSI Categories
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex gap-3">
                      <span className="text-2xl">↑</span>
                      <div>
                        <p className="font-semibold text-blue-700 dark:text-blue-300">
                          Parent LSIs
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Broader terms that encompass your keyword
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-2xl">↓</span>
                      <div>
                        <p className="font-semibold text-green-700 dark:text-green-300">
                          Child LSIs
                        </p>
                        <p className="text-sm text-muted-foreground">
                          More specific variations of your keyword
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-2xl">≈</span>
                      <div>
                        <p className="font-semibold text-purple-700 dark:text-purple-300">
                          Natural LSIs
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Direct synonyms and equivalent terms
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-2xl">→</span>
                      <div>
                        <p className="font-semibold text-orange-700 dark:text-orange-300">
                          Related LSIs
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Associated services, products, and topics
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <TextInputDialog
        open={!!addKeywordCategory}
        onOpenChange={(open) => {
          if (!open) setAddKeywordCategory(null);
        }}
        title={`Add keyword to ${addKeywordCategory}`}
        placeholder="New keyword"
        confirmLabel="Add"
        onConfirm={handleAddKeywordConfirm}
      />
    </div>
  );
}
