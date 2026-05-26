"use client";

import {
  NestedResizableWithHeaderFooter,
  Section,
} from "@/components/matrx/resizable/NestedResizableWithHeaderFooter";
import {
  Camera,
  LineChart,
  Settings,
  Files,
  Users,
  Mail,
  Calendar,
  Bell,
  MessageCircle,
  Database,
  Layout,
  Code,
  Terminal,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export default function EntityBrowserPage() {
  const chartData = [
    { name: "Jan", value: 400 },
    { name: "Feb", value: 300 },
    { name: "Mar", value: 600 },
    { name: "Apr", value: 800 },
    { name: "May", value: 700 },
    { name: "Jun", value: 900 },
    { name: "Jul", value: 1000 },
    { name: "Aug", value: 1200 },
    { name: "Sep", value: 1100 },
    { name: "Oct", value: 1300 },
    { name: "Nov", value: 1400 },
    { name: "Dec", value: 1600 },
  ];

  const layout: Section = {
    type: "nested",
    direction: "vertical",
    sections: [
      {
        type: "nested",
        direction: "horizontal",
        defaultSize: 5,
        minSize: 3,
        sections: [
          {
            type: "content",
            content: (
              <div className="flex items-center justify-between px-2 bg-background text-foreground">
                <div className="flex items-center gap-1">
                  <Layout className="h-4 w-4" />
                  <span className="font-bold text-sm">Dashboard</span>
                </div>
                <div className="flex gap-2">
                  <Bell className="h-4 w-4" />
                  <Settings className="h-4 w-4" />
                </div>
              </div>
            ),
            defaultSize: 100,
          },
        ],
      },
      {
        type: "nested",
        direction: "horizontal",
        defaultSize: 80,
        sections: [
          {
            type: "nested",
            direction: "vertical",
            defaultSize: 10,
            minSize: 7,
            sections: [
              {
                type: "content",
                content: (
                  <div className="flex flex-col gap-1 p-1">
                    <div className="flex items-center gap-2 bg-background text-foreground rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                      <Files className="h-5 w-5" />
                      <span>Files</span>
                    </div>
                    <div className="flex items-center gap-2 bg-background text-foreground rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                      <Users className="h-5 w-5" />
                      <span>Users</span>
                    </div>
                    <div className="flex items-center gap-2 bg-background text-foreground rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                      <Mail className="h-5 w-5" />
                      <span>Messages</span>
                    </div>
                    <div className="flex items-center gap-2 bg-background text-foreground rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                      <Calendar className="h-5 w-5" />
                      <span>Calendar</span>
                    </div>
                  </div>
                ),
                defaultSize: 100,
              },
            ],
          },
          {
            type: "nested",
            direction: "vertical",
            defaultSize: 50,
            sections: [
              {
                type: "content",
                content: (
                  <div className="h-full">
                    <Alert>
                      <Terminal className="h-4 w-4" />
                      <AlertTitle>System Status</AlertTitle>
                      <AlertDescription>
                        All systems operational. CPU usage at 42%.
                      </AlertDescription>
                    </Alert>
                    <div className="mt-4">
                      <BarChart width={400} height={200} data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" stroke="currentColor" />
                        <YAxis stroke="currentColor" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--bg-color)",
                            color: "var(--text-color)",
                          }}
                        />
                        <Bar
                          dataKey="value"
                          fill="var(--primary-color, #8884d8)"
                        />
                      </BarChart>
                    </div>
                  </div>
                ),
                defaultSize: 60,
              },
              {
                type: "nested",
                direction: "horizontal",
                defaultSize: 40,
                sections: [
                  {
                    type: "content",
                    content: (
                      <div className="bg-background p-4 rounded shadow">
                        <h3 className="font-bold mb-2">Recent Activity</h3>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Camera className="h-4 w-4" />
                            <span>New image uploaded</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <MessageCircle className="h-4 w-4" />
                            <span>3 new comments</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Database className="h-4 w-4" />
                            <span>Database backup complete</span>
                          </div>
                        </div>
                      </div>
                    ),
                    defaultSize: 50,
                  },
                  {
                    type: "content",
                    content: (
                      <div className="bg-background p-4 rounded shadow">
                        <h3 className="font-bold mb-2">System Metrics</h3>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span>CPU Usage</span>
                            <span>42%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Memory</span>
                            <span>2.4GB/8GB</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Disk Space</span>
                            <span>234GB free</span>
                          </div>
                        </div>
                      </div>
                    ),
                    defaultSize: 50,
                  },
                ],
              },
            ],
          },
          {
            type: "nested",
            direction: "vertical",
            defaultSize: 35,
            sections: [
              {
                type: "content",
                content: (
                  <div className="bg-background h-full shadow">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                      <h3 className="font-bold">Code Editor</h3>
                    </div>
                    <div className="p-4 font-mono text-sm bg-slate-900 text-green-400">
                      <Code className="inline-block h-4 w-4 mr-2" />
                      <span>console.log("Hello World!");</span>
                      <br />
                      <span>const data = await fetch('/api');</span>
                      <br />
                      <span>return data.json();</span>
                    </div>
                  </div>
                ),
                defaultSize: 70,
              },
              {
                type: "content",
                content: (
                  <div className="p-4 bg-background">
                    <h3 className="font-bold mb-2">Terminal Output</h3>
                    <div className="bg-slate-900 text-green-400 p-2 rounded font-mono text-sm">
                      <p>$ npm install</p>
                      <p>$ npm run build</p>
                      <p>Build completed successfully</p>
                    </div>
                  </div>
                ),
                defaultSize: 30,
              },
            ],
          },
        ],
      },
      {
        type: "content",
        content: (
          <div className="flex justify-between items-center px-4 bg-background border-t border-border">
            <span className="text-sm text-muted-foreground">
              © 2024 Dashboard Demo
            </span>
            <div className="flex gap-4">
              <span className="text-sm text-muted-foreground">v1.0.0</span>
              <span className="text-sm text-success">● Connected</span>
            </div>
          </div>
        ),
        defaultSize: 5,
        minSize: 3,
        maxSize: 10,
      },
    ],
  };

  return <NestedResizableWithHeaderFooter layout={layout} />;
}
