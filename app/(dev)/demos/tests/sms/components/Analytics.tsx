'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, RefreshCw, AlertCircle, MessageSquare, Send, TrendingUp, Clock } from 'lucide-react';

interface AnalyticsData {
  totalMessages: number;
  totalConversations: number;
  inboundMessages: number;
  outboundMessages: number;
  deliveredMessages: number;
  failedMessages: number;
  activeConversations: number;
  averageResponseTime: string;
  messagesByType: Record<string, number>;
  recentActivity: Array<{
    date: string;
    count: number;
  }>;
}

export default function Analytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/sms/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analytics' }),
      });

      const data = await response.json();

      if (response.ok) {
        const analyticsData = data.data?.analytics || data.analytics || data.data;
        setAnalytics(analyticsData || null);
      } else {
        setError(data.msg || data.error || 'Failed to fetch analytics');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading && !analytics) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">SMS Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Overview of your SMS activity and performance
          </p>
        </div>
        <Button onClick={fetchAnalytics} variant="outline" size="sm" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {analytics && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.totalMessages}</div>
                <p className="text-xs text-muted-foreground">
                  All time messages sent and received
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conversations</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.totalConversations}</div>
                <p className="text-xs text-muted-foreground">
                  {analytics.activeConversations} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics.totalMessages > 0
                    ? Math.round((analytics.deliveredMessages / analytics.totalMessages) * 100)
                    : 0}
                  %
                </div>
                <p className="text-xs text-muted-foreground">
                  {analytics.deliveredMessages} delivered, {analytics.failedMessages} failed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.averageResponseTime}</div>
                <p className="text-xs text-muted-foreground">
                  Average time to respond
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Message Direction</CardTitle>
                <CardDescription>Inbound vs Outbound</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Inbound</span>
                      <span className="text-sm text-muted-foreground">
                        {analytics.inboundMessages}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{
                          width: `${
                            analytics.totalMessages > 0
                              ? (analytics.inboundMessages / analytics.totalMessages) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Outbound</span>
                      <span className="text-sm text-muted-foreground">
                        {analytics.outboundMessages}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500"
                        style={{
                          width: `${
                            analytics.totalMessages > 0
                              ? (analytics.outboundMessages / analytics.totalMessages) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Messages by Type</CardTitle>
                <CardDescription>Conversation types breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(analytics.messagesByType).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{type.replace('_', ' ')}</span>
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  ))}
                  {Object.keys(analytics.messagesByType).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No data available
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {analytics.recentActivity && analytics.recentActivity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Message volume over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analytics.recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm">{activity.date}</span>
                      <span className="text-sm font-medium">{activity.count} messages</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
