"use client";
import React, { useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatJson } from "@/utils/json/json-cleaner-utility";
import {
  getValueByBookmark,
  importBookmarks,
} from "../utils/json-path-navigation-util";

interface PathBookmark {
  path: string;
  segments: Array<{ type: string; value: string }>;
  name: string;
  description?: string;
}

/**
 * A component that displays values from a JSON object using saved bookmarks
 */
const BookmarkViewer = ({ pageData }) => {
  const [bookmarks, setBookmarks] = useState<PathBookmark[]>([]);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState("");
  const [showDebug, setShowDebug] = useState(false);

  // Handle importing bookmarks from JSON
  const handleImport = () => {
    try {
      const imported = importBookmarks(importText);
      if (imported.length === 0) {
        setError("No valid bookmarks found in the imported text");
        return;
      }

      setBookmarks(imported);
      setShowImport(false);
      setError("");
    } catch (e) {
      setError("Failed to import bookmarks. Please check the format.");
    }
  };

  // Extract and display a value using a bookmark
  const renderBookmarkValue = (bookmark) => {
    if (!pageData)
      return <div className="text-muted-foreground">No data available</div>;

    try {
      const value = getValueByBookmark(pageData, bookmark);

      if (value === undefined || value === null) {
        return <div className="text-yellow-600">Path not found in data</div>;
      }

      // Different display for different types of values
      if (typeof value === "object") {
        return (
          <pre className="text-xs bg-gray-50 dark:bg-gray-800 p-2 rounded-md max-h-36 overflow-auto">
            {formatJson(value)}
          </pre>
        );
      } else {
        return (
          <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded-md">
            {String(value)}
          </div>
        );
      }
    } catch (e) {
      return <div className="text-red-500">Error: {extractErrorMessage(e)}</div>;
    }
  };

  // Toggle debug information
  const toggleDebug = () => {
    setShowDebug(!showDebug);
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Saved Path Values</h2>

        <div className="flex gap-2">
          {showImport ? (
            <Button variant="outline" onClick={() => setShowImport(false)}>
              Cancel
            </Button>
          ) : (
            <Button onClick={() => setShowImport(true)}>
              Import Bookmarks
            </Button>
          )}

          {bookmarks.length > 0 && (
            <Button variant="outline" onClick={toggleDebug}>
              {showDebug ? "Hide Debug" : "Show Debug"}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showImport && (
        <Card>
          <CardHeader>
            <CardTitle>Import Bookmarks</CardTitle>
            <CardDescription>
              Paste the exported JSON bookmark configuration below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="min-h-32"
                placeholder="Paste your bookmark JSON here..."
              />
              <Button onClick={handleImport}>Import</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {bookmarks.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No bookmarks imported yet. Click "Import Bookmarks" to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bookmarks.map((bookmark, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle>{bookmark.name}</CardTitle>
                {bookmark.description && (
                  <CardDescription>{bookmark.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <code className="text-xs block bg-gray-100 dark:bg-gray-800 p-1 rounded">
                    {bookmark.path}
                  </code>

                  {showDebug && (
                    <div className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded mt-2 mb-2">
                      <strong>Path Segments:</strong>
                      <ul className="list-disc pl-4 mt-1">
                        {bookmark.segments.map((segment, i) => (
                          <li key={i}>
                            {segment.type}: {segment.value}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-2">
                    <h4 className="text-sm font-medium mb-1">Value:</h4>
                    {renderBookmarkValue(bookmark)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default BookmarkViewer;
