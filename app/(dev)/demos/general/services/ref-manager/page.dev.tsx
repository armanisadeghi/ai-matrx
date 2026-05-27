'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { AlertCircle, Edit3, Maximize2, Minimize2, Type } from 'lucide-react';
import { useComponentRef, useRefManager } from '@/lib/refs';

// Example Editor Component
const Editor = ({ id }: { id: string }) => {
  const [content, setContent] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useComponentRef(id, {
    clear: () => setContent(''),
    setText: (text: string) => setContent(text),
    getText: () => content,
    setFontSize: (size: number) => setFontSize(size),
    toggleFullscreen: () => setIsFullscreen(prev => !prev)
  });

  return (
    <Card className={`${isFullscreen ? 'fixed inset-4 z-50' : 'w-full'}`}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Editor {id}</CardTitle>
          <CardDescription>Font size: {fontSize}px</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsFullscreen(prev => !prev)}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ fontSize: `${fontSize}px` }}
          className="w-full h-32 p-2 border rounded-md resize-none bg-elevation1/50"
          placeholder="Start typing..."
        />
      </CardContent>
    </Card>
  );
};

// Control Panel Component
const ControlPanel = () => {
  const refManager = useRefManager();
  const [selectedEditor, setSelectedEditor] = useState('editor1');
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const handleSetText = () => {
    refManager.call(selectedEditor, 'setText', text);
    addLog(`Set text in ${selectedEditor}`);
  };

  const handleGetText = () => {
    const content = refManager.call(selectedEditor, 'getText');
    addLog(`Got text from ${selectedEditor}: ${content}`);
  };

  const handleClear = () => {
    refManager.call(selectedEditor, 'clear');
    addLog(`Cleared ${selectedEditor}`);
  };

  const handleSetFontSize = (size: number) => {
    setFontSize(size);
    refManager.call(selectedEditor, 'setFontSize', size);
    addLog(`Set font size to ${size}px in ${selectedEditor}`);
  };

  const handleToggleFullscreen = () => {
    refManager.call(selectedEditor, 'toggleFullscreen');
    addLog(`Toggled fullscreen for ${selectedEditor}`);
  };

  const handleBroadcastClear = () => {
    refManager.broadcast('clear');
    addLog('Cleared all editors');
  };

  const handleBroadcastFontSize = () => {
    refManager.broadcast('setFontSize', fontSize);
    addLog(`Set font size to ${fontSize}px in all editors`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Control Panel</CardTitle>
        <CardDescription>Manage editors using ref methods</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Editor Selection */}
        <div className="flex gap-2">
          {['editor1', 'editor2', 'editor3'].map(id => (
            <Button
              key={id}
              variant={selectedEditor === id ? 'default' : 'outline'}
              onClick={() => setSelectedEditor(id)}
            >
              {id}
            </Button>
          ))}
        </div>

        {/* Text Controls */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Text Controls</h3>
          <div className="flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter text..."
              className="flex-1"
            />
            <Button onClick={handleSetText}>
              <Edit3 className="h-4 w-4 mr-2" />
              Set Text
            </Button>
            <Button variant="outline" onClick={handleGetText}>
              Get Text
            </Button>
            <Button variant="secondary" onClick={handleClear}>
              Clear
            </Button>
          </div>
        </div>

        {/* Font Size Controls */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Font Size: {fontSize}px</h3>
          <div className="flex gap-4 items-center">
            <Type className="h-4 w-4" />
            <Slider
              value={[fontSize]}
              onValueChange={([value]) => handleSetFontSize(value)}
              min={12}
              max={24}
              step={1}
              className="flex-1"
            />
          </div>
        </div>

        {/* Layout Controls */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Layout Controls</h3>
          <Button onClick={handleToggleFullscreen}>
            Toggle Fullscreen
          </Button>
        </div>

        {/* Broadcast Controls */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Broadcast Controls</h3>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleBroadcastClear}>
              Clear All
            </Button>
            <Button variant="secondary" onClick={handleBroadcastFontSize}>
              Set All Font Sizes
            </Button>
          </div>
        </div>

        {/* Logs */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Action Log</h3>
          <ScrollArea className="h-32 w-full rounded-md border p-4">
            {logs.map((log, index) => (
              <div key={index} className="text-sm">{log}</div>
            ))}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};

// Main Demo Component
const RefManagerDemo = () => {
  return (
    <div className="container mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Ref Manager Demo</CardTitle>
          <CardDescription>
            Interactive example demonstrating ref management across multiple editors
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Editor id="editor1" />
        <Editor id="editor2" />
        <Editor id="editor3" />
      </div>

      <ControlPanel />

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          This demo shows how to manage multiple component instances using refs.
          Try the different controls to see how they affect individual or all editors.
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default RefManagerDemo;