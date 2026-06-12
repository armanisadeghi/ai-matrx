'use client'
import React from "react";
import {
  DraggableCardBody,
  DraggableCardContainer,
} from "@/components/ui/draggable-card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Camera, BarChart3, Clock, Calendar, MessageSquare, FileCog } from "lucide-react";

const chartData = [
    { name: 'Jan', value: 400 },
    { name: 'Feb', value: 300 },
    { name: 'Mar', value: 600 },
    { name: 'Apr', value: 800 },
    { name: 'May', value: 500 }
  ];
  
  // Example card contents
  const ChartCard = () => (
    <div className="h-full flex flex-col">
      <h3 className="text-lg font-bold mb-2 text-gray-800 dark:text-gray-200">Sales Performance</h3>
      <div className="flex-1 w-full">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#6b7280" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fill: 'var(--foreground-color, #374151)' }} />
            <YAxis tick={{ fill: 'var(--foreground-color, #374151)' }} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--background-color, white)', color: 'var(--foreground-color, black)', borderColor: 'var(--border-color, #e5e7eb)' }} />
            <Line type="monotone" dataKey="value" stroke="#8884d8" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Drag me around to compare with other metrics
      </div>
    </div>
  );
  
  const ControlPanel = () => (
    <div className="h-full flex flex-col">
      <h3 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-200">Control Panel</h3>
      <div className="space-y-4">
        <div className="flex items-center p-2 bg-blue-100 dark:bg-blue-900/30 rounded-md">
          <Camera className="mr-2 text-blue-600 dark:text-blue-400" />
          <div>
            <div className="font-medium text-gray-800 dark:text-gray-200">Camera Settings</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">6 devices connected</div>
          </div>
        </div>
        
        <div className="flex items-center p-2 bg-green-100 dark:bg-green-900/30 rounded-md">
          <BarChart3 className="mr-2 text-green-600 dark:text-green-400" />
          <div>
            <div className="font-medium text-gray-800 dark:text-gray-200">Analytics</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">View reports</div>
          </div>
        </div>
        
        <div className="flex items-center p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-md">
          <Clock className="mr-2 text-yellow-600 dark:text-yellow-400" />
          <div>
            <div className="font-medium text-gray-800 dark:text-gray-200">Scheduling</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">3 pending tasks</div>
          </div>
        </div>
      </div>
    </div>
  );

  const CalendarCard = () => (
    <div className="h-full flex flex-col">
      <h3 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-200">Upcoming Events</h3>
      <div className="space-y-3">
        <div className="p-3 border-border rounded-md bg-textured">
          <div className="flex justify-between items-center">
            <span className="font-medium text-gray-800 dark:text-gray-200">Team Meeting</span>
            <span className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 px-2 py-1 rounded">Today</span>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center">
            <Calendar className="h-3 w-3" /> 2:00 PM - 3:30 PM
          </div>
        </div>
        <div className="p-3 border-border rounded-md bg-textured">
          <div className="flex justify-between items-center">
            <span className="font-medium text-gray-800 dark:text-gray-200">Client Call</span>
            <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 px-2 py-1 rounded">Tomorrow</span>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center">
            <Calendar className="h-3 w-3" /> 10:00 AM - 11:00 AM
          </div>
        </div>
      </div>
    </div>
  );

  const MessagesCard = () => (
    <div className="h-full flex flex-col">
      <h3 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-200">Recent Messages</h3>
      <div className="space-y-3">
        <div className="flex items-start p-3 border-border rounded-md bg-textured">
          <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center mr-3">
            <span className="text-indigo-600 dark:text-indigo-300 font-medium">JD</span>
          </div>
          <div>
            <div className="font-medium text-gray-800 dark:text-gray-200">John Doe</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Hey, can we discuss the project specs?</div>
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">10 minutes ago</div>
          </div>
        </div>
        <div className="flex items-start p-3 border-border rounded-md bg-textured">
          <div className="h-10 w-10 rounded-full bg-pink-100 dark:bg-pink-800 flex items-center justify-center mr-3">
            <span className="text-pink-600 dark:text-pink-300 font-medium">AS</span>
          </div>
          <div>
            <div className="font-medium text-gray-800 dark:text-gray-200">Alice Smith</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">I've sent you the updated designs.</div>
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">2 hours ago</div>
          </div>
        </div>
      </div>
    </div>
  );

  const ConfigCard = () => (
    <div className="h-full flex flex-col">
      <h3 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-200">System Configuration</h3>
      <div className="space-y-3">
        <div className="p-3 border-border rounded-md bg-textured">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <FileCog className="h-5 w-5 text-gray-500 dark:text-gray-400 mr-2" />
              <span className="text-gray-800 dark:text-gray-200">API Endpoints</span>
            </div>
            <div className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300">
              Online
            </div>
          </div>
          <div className="mt-2">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
              <div className="bg-green-600 dark:bg-green-500 h-2.5 rounded-full w-[85%]"></div>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">85% availability</div>
          </div>
        </div>
        <div className="p-3 border-border rounded-md bg-textured">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <FileCog className="h-5 w-5 text-gray-500 dark:text-gray-400 mr-2" />
              <span className="text-gray-800 dark:text-gray-200">Database</span>
            </div>
            <div className="text-xs font-medium px-2 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300">
              Maintenance
            </div>
          </div>
          <div className="mt-2">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
              <div className="bg-yellow-500 dark:bg-yellow-500 h-2.5 rounded-full w-[60%]"></div>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">60% availability</div>
          </div>
        </div>
      </div>
    </div>
  );
  
  // Main demo component
  export default function DraggableInteractiveCards() {
    return (
      <div className="w-full min-h-dvh bg-gray-50 dark:bg-gray-900 p-8 overflow-hidden">
        <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">Draggable Components Demo</h1>
        <p className="mb-8 text-gray-600 dark:text-gray-400">Drag these cards around the screen</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <DraggableCardContainer>
            <DraggableCardBody>
              <ChartCard />
            </DraggableCardBody>
          </DraggableCardContainer>
          
          <DraggableCardContainer>
            <DraggableCardBody>
              <ControlPanel />
            </DraggableCardBody>
          </DraggableCardContainer>

          <DraggableCardContainer>
            <DraggableCardBody>
              <CalendarCard />
            </DraggableCardBody>
          </DraggableCardContainer>

          <DraggableCardContainer>
            <DraggableCardBody>
              <MessagesCard />
            </DraggableCardBody>
          </DraggableCardContainer>

          <DraggableCardContainer>
            <DraggableCardBody>
              <ConfigCard />
            </DraggableCardBody>
          </DraggableCardContainer>
        </div>
      </div>
    );
  };
  
