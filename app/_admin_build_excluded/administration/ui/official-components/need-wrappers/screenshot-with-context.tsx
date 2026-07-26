// components/help/ContextCollectorDemo.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useContextCollection } from '@/hooks/useContextCollection';
import { Loader2 } from 'lucide-react';
import type { AIHelpContext } from '@/types/contextCollection';

// https://claude.ai/chat/327028d1-1df2-4272-816d-83c3e06f72a2

export default function ContextCollectorDemo() {
  const [activeTab, setActiveTab] = useState('preview');

  // Example help docs that would come from your system
  const helpDocs = {
    pageHelp: "This is the dashboard page where users can view their analytics...",
    sectionHelp: "The chart section shows data over time...",
  };

  const { collectContext, isCollecting, lastContext } = useContextCollection(helpDocs);

  const handleCollect = async () => {
    try {
      await collectContext();
      setActiveTab('preview');
    } catch (err) {
      console.error('Failed to collect context:', err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI Help Context Collector</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-center">
            <Button
              onClick={handleCollect}
              disabled={isCollecting}
            >
              {isCollecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Collect Page Context
            </Button>
          </div>

          {lastContext && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="preview">Screenshot</TabsTrigger>
                <TabsTrigger value="context">Context Data</TabsTrigger>
              </TabsList>

              <TabsContent value="preview">
                <div className="border rounded-lg overflow-hidden">
                  <img
                    src={lastContext.screenshot.compressed}
                    alt="Page screenshot"
                    className="max-w-full h-auto"
                  />
                </div>
              </TabsContent>

              <TabsContent value="context">
                <pre className="p-4 rounded-lg bg-muted overflow-auto max-h-[500px]">
                  {JSON.stringify(lastContext, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
