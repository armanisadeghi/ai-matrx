'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, AlertCircle, PlayCircle, XCircle } from 'lucide-react';

// Import the callback manager we created
const { callbackManager } = (() => {
  // Embedding the CallbackManager code here for demo purposes
  type CallbackContext = Record<string, any>;

  interface ProgressInfo {
    progress?: number;
    status?: 'pending' | 'running' | 'completed' | 'error';
    error?: Error;
  }

  type Callback<T = any, C extends CallbackContext = CallbackContext> = 
    (data: T, context?: C) => void;

  interface CallbackEntry<T = any, C extends CallbackContext = CallbackContext> {
    callback: Callback<T, C>;
    context?: C;
    groupId?: string;
  }

  class CallbackManager {
    private callbacks: Map<string, CallbackEntry>;
    private groups: Map<string, Set<string>>;

    constructor() {
      this.callbacks = new Map();
      this.groups = new Map();
    }

    register<T>(callback: Callback<T>): string {
      const callbackId = crypto.randomUUID();
      this.callbacks.set(callbackId, { callback });
      return callbackId;
    }

    registerWithContext<T, C extends CallbackContext = CallbackContext>(
      callback: Callback<T, C>,
      options?: {
        context?: C;
        groupId?: string;
      }
    ): string {
      const callbackId = crypto.randomUUID();
      const { context, groupId } = options || {};
      
      this.callbacks.set(callbackId, { callback, context, groupId });
      
      if (groupId) {
        const group = this.groups.get(groupId) || new Set();
        group.add(callbackId);
        this.groups.set(groupId, group);
      }
      
      return callbackId;
    }

    trigger<T>(callbackId: string, data: T): void {
      const entry = this.callbacks.get(callbackId);
      if (entry) {
        entry.callback(data);
        this.callbacks.delete(callbackId);
        this.removeFromGroups(callbackId);
      }
    }

    triggerWithContext<T, C extends CallbackContext = CallbackContext>(
      callbackId: string,
      data: T,
      options?: {
        context?: C;
        progress?: ProgressInfo;
        removeAfterTrigger?: boolean;
      }
    ): void {
      const entry = this.callbacks.get(callbackId);
      if (entry) {
        const mergedContext = {
          ...entry.context,
          ...options?.context,
          ...(options?.progress && { progress: options.progress })
        } as C;

        entry.callback(data, mergedContext);

        if (options?.removeAfterTrigger !== false) {
          this.callbacks.delete(callbackId);
          this.removeFromGroups(callbackId);
        }
      }
    }

    triggerGroup<T, C extends CallbackContext = CallbackContext>(
      groupId: string,
      data: T,
      options?: {
        context?: C;
        progress?: ProgressInfo;
        removeAfterTrigger?: boolean;
      }
    ): void {
      const group = this.groups.get(groupId);
      if (group) {
        group.forEach(callbackId => {
          this.triggerWithContext(callbackId, data, options);
        });
        
        if (options?.removeAfterTrigger !== false) {
          this.groups.delete(groupId);
        }
      }
    }

    updateProgress(
      id: string,
      progress: number,
      options?: {
        status?: ProgressInfo['status'];
        error?: Error;
        groupId?: boolean;
      }
    ): void {
      const progressInfo: ProgressInfo = {
        progress,
        status: options?.status || 'running',
        error: options?.error
      };

      if (options?.groupId) {
        this.triggerGroup(id, null, { 
          progress: progressInfo,
          removeAfterTrigger: false 
        });
      } else {
        this.triggerWithContext(id, null, { 
          progress: progressInfo,
          removeAfterTrigger: false 
        });
      }
    }

    createGroup(): string {
      const groupId = crypto.randomUUID();
      this.groups.set(groupId, new Set());
      return groupId;
    }

    remove(callbackId: string): void {
      this.callbacks.delete(callbackId);
      this.removeFromGroups(callbackId);
    }

    removeGroup(groupId: string): void {
      const group = this.groups.get(groupId);
      if (group) {
        group.forEach(callbackId => {
          this.callbacks.delete(callbackId);
        });
        this.groups.delete(groupId);
      }
    }

    private removeFromGroups(callbackId: string): void {
      const entry = this.callbacks.get(callbackId);
      if (entry?.groupId) {
        const group = this.groups.get(entry.groupId);
        group?.delete(callbackId);
        if (group?.size === 0) {
          this.groups.delete(entry.groupId);
        }
      }
    }
  }

  return { callbackManager: new CallbackManager() };
})();

const BasicExample = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [callbackId, setCallbackId] = useState<string>('');
  
  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const handleRegister = () => {
    const id = callbackManager.register((data) => {
      addLog(`Callback triggered with data: ${JSON.stringify(data)}`);
    });
    setCallbackId(id);
    addLog(`Registered callback with ID: ${id}`);
  };

  const handleTrigger = () => {
    if (callbackId) {
      callbackManager.trigger(callbackId, { message: 'Hello from basic trigger!' });
      setCallbackId('');
      addLog('Triggered and removed callback');
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Basic Usage</CardTitle>
        <CardDescription>Simple register and trigger example</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleRegister} disabled={!!callbackId}>
              Register Callback
            </Button>
            <Button onClick={handleTrigger} disabled={!callbackId} variant="secondary">
              Trigger Callback
            </Button>
          </div>
          <ScrollArea className="h-48 w-full rounded-md border p-4">
            {logs.map((log, index) => (
              <div key={index} className="text-sm">{log}</div>
            ))}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};

const LongRunningExample = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [callbackId, setCallbackId] = useState<string>();

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const startLongRunningTask = () => {
    setStatus('running');
    setProgress(0);
    
    const id = callbackManager.registerWithContext((data, context) => {
      if (context?.progress) {
        setProgress(context.progress.progress || 0);
        setStatus(context.progress.status as any || 'running');
      }
      if (data) {
        addLog(`Task completed with result: ${JSON.stringify(data)}`);
      }
    });
    
    setCallbackId(id);
    addLog('Started long-running task');

    // Simulate progress updates
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 20;
      if (currentProgress <= 100) {
        callbackManager.updateProgress(id, currentProgress);
        addLog(`Progress update: ${currentProgress}%`);
      }
      if (currentProgress === 100) {
        clearInterval(interval);
        callbackManager.triggerWithContext(id, { result: 'Success!' }, {
          progress: { progress: 100, status: 'completed' }
        });
        setCallbackId(undefined);
      }
    }, 1000);
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Long-Running Task</CardTitle>
        <CardDescription>Example with progress updates</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button 
            onClick={startLongRunningTask} 
            disabled={status === 'running'}
          >
            <PlayCircle className="mr-2 h-4 w-4" />
            Start Task
          </Button>
          
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <div className="flex items-center gap-2">
              <Badge variant={status === 'completed' ? 'default' : 'secondary'}>
                {status === 'running' && 'Running...'}
                {status === 'completed' && 'Completed'}
                {status === 'error' && 'Error'}
                {status === 'idle' && 'Idle'}
              </Badge>
              {progress > 0 && <span className="text-sm">{progress}%</span>}
            </div>
          </div>

          <ScrollArea className="h-48 w-full rounded-md border p-4">
            {logs.map((log, index) => (
              <div key={index} className="text-sm">{log}</div>
            ))}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};

const MultiSubscriberExample = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [groupId, setGroupId] = useState<string>();
  const [subscribers, setSubscribers] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const createGroup = () => {
    const id = callbackManager.createGroup();
    setGroupId(id);
    setSubscribers([]);
    addLog(`Created group with ID: ${id}`);
  };

  const addSubscriber = () => {
    if (groupId) {
      const id = callbackManager.registerWithContext(
        (data, context) => {
          addLog(`Subscriber ${subscribers.length + 1} received: ${JSON.stringify(data)}`);
        },
        { groupId }
      );
      setSubscribers(prev => [...prev, id]);
      addLog(`Added subscriber ${subscribers.length + 1}`);
    }
  };

  const triggerGroup = () => {
    if (groupId) {
      callbackManager.triggerGroup(groupId, { 
        message: 'Hello all subscribers!',
        timestamp: new Date().toISOString()
      });
      setGroupId(undefined);
      setSubscribers([]);
      addLog('Triggered group and cleared subscribers');
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Multiple Subscribers</CardTitle>
        <CardDescription>Example with group notifications</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={createGroup} disabled={!!groupId}>
              Create Group
            </Button>
            <Button 
              onClick={addSubscriber} 
              disabled={!groupId} 
              variant="outline"
            >
              Add Subscriber
            </Button>
            <Button 
              onClick={triggerGroup} 
              disabled={!groupId || subscribers.length === 0}
              variant="secondary"
            >
              Notify All ({subscribers.length})
            </Button>
          </div>

          {groupId && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Group has {subscribers.length} subscriber{subscribers.length !== 1 ? 's' : ''}
              </AlertDescription>
            </Alert>
          )}

          <ScrollArea className="h-48 w-full rounded-md border p-4">
            {logs.map((log, index) => (
              <div key={index} className="text-sm">{log}</div>
            ))}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};

const CallbackManagerDemo = () => {
  return (
    <div className="container mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Callback Manager Demo</CardTitle>
          <CardDescription>
            Interactive examples demonstrating different features of the callback manager
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList>
          <TabsTrigger value="basic">Basic Usage</TabsTrigger>
          <TabsTrigger value="long-running">Long-Running Tasks</TabsTrigger>
          <TabsTrigger value="multi-subscriber">Multiple Subscribers</TabsTrigger>
        </TabsList>
        
        <TabsContent value="basic">
          <BasicExample />
        </TabsContent>
        
        <TabsContent value="long-running">
          <LongRunningExample />
        </TabsContent>
        
        <TabsContent value="multi-subscriber">
          <MultiSubscriberExample />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CallbackManagerDemo;