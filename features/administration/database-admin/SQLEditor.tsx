// components/database/SQLEditor.jsx
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { Database, Play, AlertCircle } from "lucide-react";

export const SQLEditor = ({ loading, error, onExecuteQuery }) => {
  const [sqlQuery, setSqlQuery] = useState("");
  const [queryResult, setQueryResult] = useState(null);

  const handleExecuteQuery = async () => {
    try {
      const result = await onExecuteQuery(sqlQuery);
      setQueryResult(result);
    } catch (err) {
      setQueryResult(null);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          SQL Query Editor
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="relative">
            <textarea
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              className="min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
              placeholder="Enter your SQL query here..."
            />
            <Button
              onClick={handleExecuteQuery}
              className="absolute bottom-4 right-4"
              disabled={loading || !sqlQuery.trim()}
            >
              {loading ? "Running..." : "Execute"}
              <Play className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {queryResult && (
            <div className="h-[min(28rem,50vh)] min-h-[16rem] rounded-md border overflow-hidden">
              <JsonInspector data={queryResult} defaultView="json" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
