'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { PageSpecificHeader } from '@/components/layout/new-layout/PageSpecificHeader';

export default function FixedInputPage() {
  const [message, setMessage] = useState('');

  return (
    <>
      <PageSpecificHeader>
        <div className="flex items-center gap-2">
          <Link href="/layout-tests" className="text-gray-700 dark:text-gray-300 flex items-center gap-1 text-xs hover:text-gray-900 dark:hover:text-gray-100">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <span className="text-gray-400 dark:text-gray-600">|</span>
          <span className="text-xs text-gray-700 dark:text-gray-300 font-semibold">Fixed Input Test</span>
        </div>
      </PageSpecificHeader>
      
      <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-zinc-100 dark:bg-zinc-900">

      {/* Scrollable Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Generate many messages to enable scrolling */}
        {Array.from({ length: 30 }, (_, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg max-w-[80%] ${
              i % 3 === 0
                ? 'bg-blue-500 text-white ml-auto'
                : 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white'
            }`}
          >
            Message {i + 1} - Scroll down to see the input
          </div>
        ))}
        
        <div className="h-2" /> {/* Small spacer at bottom */}
      </div>

      {/* Fixed Bottom Input - This should NEVER get covered */}
      <div className="flex-shrink-0 bg-white dark:bg-zinc-800 border-t-4 border-green-500 pb-safe">
        <div className="p-4">
          <div className="bg-green-100 dark:bg-green-950 p-2 rounded-t-lg text-center">
            <span className="text-xs font-bold text-green-900 dark:text-green-100">
              ✅ This input should ALWAYS be visible (pb-safe)
            </span>
          </div>
          <div className="flex gap-2 bg-zinc-100 dark:bg-zinc-900 p-3 rounded-b-lg">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type here and watch - this should never get covered by browser UI..."
              className="flex-1 min-h-[60px] resize-none text-base"
              style={{ fontSize: '16px' }}
            />
            <Button size="icon" className="self-end bg-blue-600 hover:bg-blue-700">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

