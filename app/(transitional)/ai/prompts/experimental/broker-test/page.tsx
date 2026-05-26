'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import {
  resolveBrokersForContext,
  getMissingBrokerIds,
  areBrokersFullyResolved,
} from '@/features/brokers/services/resolution-service';
import type { BrokerResolutionResult } from '@/features/brokers/types/resolution';

export default function BrokerTestPage() {
  const [brokerIds, setBrokerIds] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [taskId, setTaskId] = useState<string>('');

  const [result, setResult] = useState<BrokerResolutionResult | null>(null);
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [isFullyResolved, setIsFullyResolved] = useState<boolean | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResolve = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setMissingIds([]);
    setIsFullyResolved(null);

    try {
      // Parse broker IDs
      const ids = brokerIds
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      if (ids.length === 0) {
        throw new Error('Please enter at least one broker ID');
      }

      // Build context
      const context = {
        userId: userId || undefined,
        projectId: projectId || undefined,
        taskId: taskId || undefined,
      };

      // Resolve brokers
      const resolution = await resolveBrokersForContext(ids, context, {
        includeDebugInfo: true,
      });

      setResult(resolution);

      // Check for missing
      const missing = await getMissingBrokerIds(ids, context);
      setMissingIds(missing);

      // Check if fully resolved
      const fullyResolved = await areBrokersFullyResolved(ids, context);
      setIsFullyResolved(fullyResolved);
    } catch (err: any) {
      setError(err.message || 'Unknown error occurred');
      console.error('❌ Test failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold">Broker Resolution Test</h1>
            <p className="text-muted-foreground mt-2">
              Test the broker resolution service with different contexts
            </p>
          </div>

          {/* Input Form */}
          <Card>
            <CardHeader>
              <CardTitle>Test Configuration</CardTitle>
              <CardDescription>
                Enter broker IDs and context information to test resolution
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="brokerIds">
                  Broker IDs (comma-separated)
                </Label>
                <Input
                  id="brokerIds"
                  value={brokerIds}
                  onChange={(e) => setBrokerIds(e.target.value)}
                  placeholder="broker-uuid-1, broker-uuid-2"
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

              <Button
                onClick={handleResolve}
                disabled={loading || !brokerIds}
                className="w-full"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Resolve Brokers
              </Button>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Resolution Status */}
          {isFullyResolved !== null && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {isFullyResolved ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-success" />
                      All Brokers Resolved
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-warning" />
                      Some Brokers Missing
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              {!isFullyResolved && missingIds.length > 0 && (
                <CardContent>
                  <Label>Missing Broker IDs:</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {missingIds.map((id) => (
                      <Badge key={id} variant="destructive">
                        {id}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Results */}
          {result && (
            <Card>
              <CardHeader>
                <CardTitle>Resolution Result</CardTitle>
                <CardDescription>
                  Resolved {Object.keys(result.values).length} broker value(s)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Resolved Values */}
                <div>
                  <Label>Resolved Values:</Label>
                  <div className="mt-2 space-y-2">
                    {Object.entries(result.values).map(([brokerId, value]) => (
                      <div
                        key={brokerId}
                        className="p-4 bg-muted rounded space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm text-muted-foreground">
                            {brokerId}
                          </span>
                          <Badge variant="outline">
                            {result.metadata.scopeLevels[brokerId]}
                          </Badge>
                        </div>
                        <div className="font-semibold">
                          {typeof value === 'object'
                            ? JSON.stringify(value, null, 2)
                            : String(value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Metadata */}
                <div>
                  <Label>Metadata:</Label>
                  <pre className="mt-2 p-4 bg-muted rounded text-sm overflow-auto">
                    {JSON.stringify(result.metadata, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>How to Test</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <ol>
                <li>
                  Enter one or more broker UUIDs (comma-separated) from your
                  database
                </li>
                <li>
                  Optionally provide context IDs (user, project, task)
                </li>
                <li>Click &quot;Resolve Brokers&quot; to test resolution</li>
                <li>
                  The service will query the database using the hierarchical
                  resolution function
                </li>
                <li>
                  Results show which values were found and at what scope level
                </li>
              </ol>

              <h4>Hierarchy (Highest to Lowest Priority):</h4>
              <ol>
                <li>AI Task</li>
                <li>AI Run</li>
                <li>Task</li>
                <li>Project</li>
                <li>Organization</li>
                <li>User</li>
                <li>Global</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

