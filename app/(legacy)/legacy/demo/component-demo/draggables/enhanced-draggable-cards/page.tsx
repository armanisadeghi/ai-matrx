'use client'
import React, { useState, useRef, useEffect } from "react";
import {
  EnhancedDraggableCardBody,
  EnhancedDraggableCardContainer,
} from "@/components/ui/enhanced-draggable-card";
import { DraggableCardProvider } from "@/components/ui/draggable-card-context";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Camera, BarChart3, Clock, Calendar, MessageSquare, FileCog, Grid3X3, Grid } from "lucide-react";

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

// Get card dimensions for positioning
const CARD_WIDTH = 320;
const CARD_HEIGHT = 320;

// Main demo component
export default function EnhancedDraggableCardsDemo() {
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [snapPoints, setSnapPoints] = useState<{ x: number; y: number }[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 1000, height: 600 });
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Calculate initial positions based on container size
  const getInitialPositions = (containerWidth: number, containerHeight: number) => {
    const padding = 20;
    const spacing = 40;
    
    return {
      chartCard: { 
        x: padding,
        y: padding
      },
      controlPanel: { 
        x: 2 * padding + CARD_WIDTH + spacing,
        y: padding 
      },
      calendarCard: { 
        x: containerWidth - padding - CARD_WIDTH,
        y: padding
      }
    };
  };
  
  const [initialPositions, setInitialPositions] = useState(getInitialPositions(1000, 600));
  
  // Generate snap points based on container size
  const generateSnapPoints = (width: number, height: number) => {
    // Create a grid of 3x3 snap points
    const cols = 3;
    const rows = 3;
    
    const points: { x: number; y: number }[] = [];
    
    // Account for card size in positioning
    const effectiveWidth = width - CARD_WIDTH;
    const effectiveHeight = height - CARD_HEIGHT;
    
    const colSpacing = effectiveWidth / (cols - 1);
    const rowSpacing = effectiveHeight / (rows - 1);
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Add snap point at grid position
        points.push({
          x: Math.round(col * colSpacing),
          y: Math.round(row * rowSpacing)
        });
      }
    }
    
    return points;
  };
  
  // Initialize container dimensions and snap points
  useEffect(() => {
    if (containerRef.current && !isInitialized) {
      const rect = containerRef.current.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      
      setContainerSize({ width, height });
      setSnapPoints(generateSnapPoints(width, height));
      setInitialPositions(getInitialPositions(width, height));
      setIsInitialized(true);
    }
  }, [isInitialized]);
  
  // Update snap points if container size changes
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        
        if (width !== containerSize.width || height !== containerSize.height) {
          setContainerSize({ width, height });
          setSnapPoints(generateSnapPoints(width, height));
          
          // Only update initial positions if cards haven't been moved yet
          if (Object.keys(positions).length === 0) {
            setInitialPositions(getInitialPositions(width, height));
          }
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [containerSize, positions]);

  const handlePositionChange = (id: string, position: { x: number; y: number }) => {
    setPositions(prev => ({
      ...prev,
      [id]: position
    }));
  };

  return (
    <DraggableCardProvider>
      <div className="w-full min-h-dvh bg-gray-50 dark:bg-gray-900 p-8 overflow-hidden">
        <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">
          Enhanced Draggable Cards Demo
        </h1>
        <p className="mb-2 text-gray-600 dark:text-gray-400">
          These cards report their positions and can snap to a grid
        </p>
        
        <div className="mb-6 flex space-x-4">
          <button 
            onClick={() => setShowGrid(!showGrid)}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md flex items-center"
          >
            <Grid className="w-4 h-4 mr-2" />
            {showGrid ? 'Hide Grid' : 'Show Grid'}
          </button>
          
          <button 
            onClick={() => setSnapEnabled(!snapEnabled)}
            className={`px-4 py-2 rounded-md flex items-center ${
              snapEnabled 
                ? 'bg-green-500 hover:bg-green-600 text-white' 
                : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200'
            }`}
          >
            <Grid3X3 className="w-4 h-4 mr-2" />
            {snapEnabled ? 'Snap Enabled' : 'Enable Snap'}
          </button>
        </div>
        
        <div 
          ref={containerRef} 
          className="relative bg-gray-100 dark:bg-gray-800 rounded-lg border-border p-4 min-h-[600px]"
        >
          {showGrid && snapPoints.length > 0 && (
            <div className="absolute inset-0 pointer-events-none">
              {snapPoints.map((point, index) => (
                <div 
                  key={index}
                  className="absolute w-6 h-6 rounded-full border-2 border-blue-500 dark:border-blue-400 opacity-30"
                  style={{
                    left: point.x,
                    top: point.y,
                    transform: 'translate(-50%, -50%)'
                  }}
                />
              ))}
            </div>
          )}
          
          {isInitialized && (
            <>
              <EnhancedDraggableCardContainer className="h-full">
                <EnhancedDraggableCardBody
                  id="chart-card"
                  initialPosition={initialPositions.chartCard}
                  onPositionChange={(pos) => handlePositionChange("chart-card", pos)}
                  snapPoints={snapEnabled ? snapPoints : []}
                >
                  <ChartCard />
                </EnhancedDraggableCardBody>
              </EnhancedDraggableCardContainer>
              
              <EnhancedDraggableCardContainer className="h-full">
                <EnhancedDraggableCardBody
                  id="control-panel"
                  initialPosition={initialPositions.controlPanel}
                  onPositionChange={(pos) => handlePositionChange("control-panel", pos)}
                  snapPoints={snapEnabled ? snapPoints : []}
                >
                  <ControlPanel />
                </EnhancedDraggableCardBody>
              </EnhancedDraggableCardContainer>
              
              <EnhancedDraggableCardContainer className="h-full">
                <EnhancedDraggableCardBody
                  id="calendar-card"
                  initialPosition={initialPositions.calendarCard}
                  onPositionChange={(pos) => handlePositionChange("calendar-card", pos)}
                  snapPoints={snapEnabled ? snapPoints : []}
                >
                  <CalendarCard />
                </EnhancedDraggableCardBody>
              </EnhancedDraggableCardContainer>
            </>
          )}
        </div>
        
        <div className="mt-8 p-4 bg-textured rounded-lg border-border">
          <h2 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Card Position Data</h2>
          <pre className="overflow-auto p-3 bg-gray-100 dark:bg-gray-900 rounded text-xs text-gray-800 dark:text-gray-300">
            {JSON.stringify(positions, null, 2)}
          </pre>
        </div>
      </div>
    </DraggableCardProvider>
  );
} 