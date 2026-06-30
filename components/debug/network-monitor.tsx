"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface NetworkMetric {
  timestamp: number;
  latency: number;
  size: number;
  status: number;
  method: string;
  url: string;
}

export function NetworkMonitor() {
  const [metrics, setMetrics] = useState<NetworkMetric[]>([]);
  const [stats, setStats] = useState({
    totalRequests: 0,
    avgLatency: 0,
    failedRequests: 0,
    totalBandwidth: 0,
  });

  useEffect(() => {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.entryType === "resource") {
          const resourceEntry = entry as PerformanceResourceTiming;
          const newMetric: NetworkMetric = {
            timestamp: entry.startTime,
            latency: entry.duration,
            size: resourceEntry.transferSize,
            status: 200, // Would need to intercept fetch/XHR for actual status
            method: "GET", // Would need to intercept fetch/XHR for actual method
            url: entry.name,
          };

          setMetrics((prev) => [...prev, newMetric].slice(-100)); // Keep last 100 requests
        }
      });
    });

    observer.observe({ entryTypes: ["resource"] });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (metrics.length > 0) {
      setStats({
        totalRequests: metrics.length,
        avgLatency:
          metrics.reduce((acc, m) => acc + m.latency, 0) / metrics.length,
        failedRequests: metrics.filter((m) => m.status >= 400).length,
        totalBandwidth: metrics.reduce((acc, m) => acc + m.size, 0),
      });
    }
  }, [metrics]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Network Monitor</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-sm font-medium">Total Requests</p>
            <p className="text-2xl font-bold">{stats.totalRequests}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Avg Latency</p>
            <p className="text-2xl font-bold">
              {Math.round(stats.avgLatency)}ms
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Failed Requests</p>
            <p className="text-2xl font-bold">{stats.failedRequests}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Total Bandwidth</p>
            <p className="text-2xl font-bold">
              {Math.round(stats.totalBandwidth / 1024)}KB
            </p>
          </div>
        </div>

        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metrics}>
              <XAxis
                dataKey="timestamp"
                domain={["auto", "auto"]}
                tickFormatter={(value) => new Date(value).toLocaleTimeString()}
              />
              <YAxis />
              <Tooltip
                labelFormatter={(value) => new Date(value).toLocaleString()}
                formatter={(value) => `${Math.round(value as number)}ms`}
              />
              <Line
                type="monotone"
                dataKey="latency"
                stroke="#8884d8"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <ScrollArea className="h-[200px] mt-4">
          {metrics
            .slice()
            .reverse()
            .map((metric, index) => (
              <div
                key={index}
                className="flex items-center gap-2 py-2 border-b last:border-0"
              >
                <Badge
                  variant={metric.status < 400 ? "default" : "destructive"}
                >
                  {metric.method}
                </Badge>
                <span className="text-sm font-medium">
                  {Math.round(metric.latency)}ms
                </span>
                <span className="text-sm text-muted-foreground truncate flex-1">
                  {new URL(metric.url).pathname}
                </span>
                <span className="text-sm text-muted-foreground">
                  {Math.round(metric.size / 1024)}KB
                </span>
              </div>
            ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
