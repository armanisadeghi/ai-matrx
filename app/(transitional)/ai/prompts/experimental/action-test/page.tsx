"use client";

import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Play, RefreshCw } from "lucide-react";
import { startPromptAction } from "@/lib/redux/prompt-execution/thunks/startPromptActionThunk";
import { usePromptInstance } from "@/lib/redux/prompt-execution/hooks";
import { Textarea } from "@/components/ui/textarea";

export default function ActionTestPage() {
  const dispatch = useAppDispatch();

  const [actionId, setActionId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [taskId, setTaskId] = useState<string>("");
  const [userVariables, setUserVariables] = useState<string>("{}");
  const [initialMessage, setInitialMessage] = useState<string>("");

  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { displayMessages, instance } = usePromptInstance(instanceId);

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    setExecutionResult(null);
    setInstanceId(null);

    try {
      // Parse user variables
      let parsedVariables = {};
      if (userVariables.trim()) {
        try {
          parsedVariables = JSON.parse(userVariables);
        } catch (err) {
          throw new Error("Invalid JSON for user variables");
        }
      }

      // Execute action
      const result = await dispatch(
        startPromptAction({
          actionId,
          context: {
            userId: userId || undefined,
            projectId: projectId || undefined,
            taskId: taskId || undefined,
          },
          userProvidedVariables: parsedVariables,
          initialMessage: initialMessage || undefined,
        }),
      ).unwrap();

      setExecutionResult(result);
      setInstanceId(result.runId);

      console.log("✅ Action executed:", result);
    } catch (err: any) {
      setError(err.message || "Unknown error occurred");
      console.error("❌ Execution failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setExecutionResult(null);
    setInstanceId(null);
    setError(null);
  };

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold">Prompt Action Test</h1>
            <p className="text-muted-foreground mt-2">
              Test context-aware prompt execution with broker integration
            </p>
          </div>

          {/* Configuration Form */}
          <Card>
            <CardHeader>
              <CardTitle>Action Configuration</CardTitle>
              <CardDescription>
                Enter action ID and context information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="actionId">Action ID (required)</Label>
                <Input
                  id="actionId"
                  value={actionId}
                  onChange={(e) => setActionId(e.target.value)}
                  placeholder="action-uuid"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="userId">User ID (optional)</Label>
                  <Input
                    id="userId"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="user-uuid"
                  />
                </div>

                <div>
                  <Label htmlFor="projectId">Project ID (optional)</Label>
                  <Input
                    id="projectId"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    placeholder="project-uuid"
                  />
                </div>

                <div>
                  <Label htmlFor="taskId">Task ID (optional)</Label>
                  <Input
                    id="taskId"
                    value={taskId}
                    onChange={(e) => setTaskId(e.target.value)}
                    placeholder="task-uuid"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="userVariables">
                  User Variables (JSON, optional)
                </Label>
                <Textarea
                  id="userVariables"
                  value={userVariables}
                  onChange={(e) => setUserVariables(e.target.value)}
                  placeholder='{"variable_name": "value"}'
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="initialMessage">
                  Initial Message (optional)
                </Label>
                <Textarea
                  id="initialMessage"
                  value={initialMessage}
                  onChange={(e) => setInitialMessage(e.target.value)}
                  placeholder="Enter a message to start the conversation"
                  rows={2}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleExecute}
                  disabled={loading || !actionId}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Execute Action
                    </>
                  )}
                </Button>

                {executionResult && (
                  <Button
                    onClick={handleReset}
                    variant="outline"
                    disabled={loading}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Execution Result */}
          {executionResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-success" />
                  Action Executed Successfully
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Instance ID</Label>
                    <p className="font-mono text-sm">
                      {executionResult.instanceId}
                    </p>
                  </div>

                  <div>
                    <Label>Run ID</Label>
                    <p className="font-mono text-sm">
                      {executionResult.runId || "N/A"}
                    </p>
                  </div>

                  <div>
                    <Label>Broker Resolved</Label>
                    <p className="text-2xl font-bold">
                      {executionResult.brokerResolvedCount}
                    </p>
                  </div>

                  <div>
                    <Label>User Provided</Label>
                    <p className="text-2xl font-bold">
                      {executionResult.userProvidedCount}
                    </p>
                  </div>

                  <div>
                    <Label>Total Variables</Label>
                    <p className="text-2xl font-bold">
                      {executionResult.totalVariableCount}
                    </p>
                  </div>

                  <div>
                    <Label>Status</Label>
                    <Badge
                      variant={
                        executionResult.fullyResolved ? "default" : "secondary"
                      }
                    >
                      {executionResult.fullyResolved
                        ? "Fully Resolved"
                        : "Partially Resolved"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Instance State */}
          {instance && (
            <Card>
              <CardHeader>
                <CardTitle>Execution Instance</CardTitle>
                <CardDescription>Real-time state from Redux</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Status</Label>
                  <Badge>{instance.status}</Badge>
                </div>

                <div>
                  <Label>Variables</Label>
                  <pre className="mt-2 p-4 bg-muted rounded text-sm overflow-auto">
                    {JSON.stringify(instance.variables, null, 2)}
                  </pre>
                </div>

                {displayMessages.length > 0 && (
                  <div>
                    <Label>Messages</Label>
                    <div className="mt-2 space-y-2">
                      {displayMessages.map((msg, idx) => (
                        <div key={idx} className="p-4 bg-muted rounded">
                          <p className="font-bold capitalize">{msg.role}</p>
                          <p className="mt-2 whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>How to Test</CardTitle>
            </CardHeader>
            <CardContent>
              <ol>
                <li>
                  First, run the database migration to create the prompt_actions
                  table
                </li>
                <li>
                  Create a test action in your database with:
                  <ul>
                    <li>A prompt reference (prompt_id or prompt_builtin_id)</li>
                    <li>Broker mappings (optional)</li>
                    <li>Hardcoded values (optional)</li>
                    <li>Execution config</li>
                  </ul>
                </li>
                <li>Enter the action UUID in the form above</li>
                <li>Optionally provide context IDs for broker resolution</li>
                <li>
                  Optionally provide user variable overrides (JSON format)
                </li>
                <li>Click Execute Action</li>
                <li>Watch the console for detailed logs</li>
                <li>
                  View results showing:
                  <ul>
                    <li>How many variables were auto-filled from brokers</li>
                    <li>How many were provided by user</li>
                    <li>The execution instance state</li>
                    <li>Any messages/responses</li>
                  </ul>
                </li>
              </ol>

              <h4>Variable Precedence Test:</h4>
              <p>To test variable precedence, create an action with:</p>
              <ul>
                <li>
                  Broker mapping for a variable (e.g., client_name →
                  broker_uuid)
                </li>
                <li>
                  Hardcoded value for same variable (e.g., client_name:
                  &quot;Hardcoded Inc.&quot;)
                </li>
                <li>
                  Then provide user variable (e.g., client_name: &quot;User
                  Corp.&quot;)
                </li>
              </ul>
              <p>Expected: User value wins!</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
