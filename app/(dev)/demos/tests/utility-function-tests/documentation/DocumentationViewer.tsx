'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, BookOpen, Map, Rocket } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface DocumentationViewerProps {
  readme: string;
  systemAnalysis: string;
  quickStart: string;
  roadmap: string;
}

export default function DocumentationViewer({
  readme,
  systemAnalysis,
  quickStart,
  roadmap
}: DocumentationViewerProps) {
  const [activeTab, setActiveTab] = useState('readme');
  
  // Dynamically import remarkGfm only on the client side
  const [remarkPlugins, setRemarkPlugins] = useState<any[]>([]);
  
  useEffect(() => {
    // Only load the plugin on the client side
    if (typeof window !== 'undefined') {
      import('remark-gfm').then((mod) => {
        setRemarkPlugins([mod.default]);
      });
    }
  }, []);

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">
          📚 Utility Function Registry Documentation
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Comprehensive analysis, guides, and development roadmap for the Function Registry system
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="readme" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">README</span>
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">System Analysis</span>
          </TabsTrigger>
          <TabsTrigger value="quickstart" className="flex items-center gap-2">
            <Rocket className="h-4 w-4" />
            <span className="hidden sm:inline">Quick Start</span>
          </TabsTrigger>
          <TabsTrigger value="roadmap" className="flex items-center gap-2">
            <Map className="h-4 w-4" />
            <span className="hidden sm:inline">Roadmap</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="readme" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>System Overview</CardTitle>
              <CardDescription>
                Quick reference and executive summary
              </CardDescription>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={remarkPlugins}>
                {readme}
              </ReactMarkdown>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>System Analysis</CardTitle>
              <CardDescription>
                Deep technical analysis of architecture, features, and gaps (~12,000 words)
              </CardDescription>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={remarkPlugins}>
                {systemAnalysis}
              </ReactMarkdown>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quickstart" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Quick Start Guide</CardTitle>
              <CardDescription>
                How to use the system right now (~4,500 words)
              </CardDescription>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={remarkPlugins}>
                {quickStart}
              </ReactMarkdown>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roadmap" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Development Roadmap</CardTitle>
              <CardDescription>
                Complete implementation plan with tasks and estimates (~10,000 words)
              </CardDescription>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={remarkPlugins}>
                {roadmap}
              </ReactMarkdown>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="mt-6 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="text-2xl">✅</div>
            <div>
              <h3 className="font-semibold text-green-900 dark:text-green-200 mb-2">
                Live Documentation
              </h3>
              <p className="text-sm text-green-800 dark:text-green-300">
                You're viewing the actual markdown files from the codebase. Any changes you make
                to the markdown files will be reflected here automatically after a page refresh.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

