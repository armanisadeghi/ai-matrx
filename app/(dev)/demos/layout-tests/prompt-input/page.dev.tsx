'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PromptInput } from '@/features/prompts/components/PromptInput';
import { PageSpecificHeader } from '@/components/layout/new-layout/PageSpecificHeader';

export default function PromptInputTestPage() {
  const [chatInput, setChatInput] = useState('');
  const [submitOnEnter, setSubmitOnEnter] = useState(true);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'user', content: 'Test message 1' },
    { role: 'assistant', content: 'Response 1' },
  ]);
  const [isTestingPrompt, setIsTestingPrompt] = useState(false);

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    
    setMessages(prev => [...prev, { role: 'user', content: chatInput }]);
    setChatInput('');
    
    // Simulate response
    setIsTestingPrompt(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: `Echo: ${chatInput}` }]);
      setIsTestingPrompt(false);
    }, 1000);
  };

  return (
    <>
      <PageSpecificHeader>
        <div className="flex items-center gap-2">
          <Link href="/layout-tests" className="text-gray-700 dark:text-gray-300 flex items-center gap-1 text-xs hover:text-gray-900 dark:hover:text-gray-100">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <span className="text-gray-400 dark:text-gray-600">|</span>
          <span className="text-xs text-gray-700 dark:text-gray-300 font-semibold">PromptInput Test</span>
        </div>
      </PageSpecificHeader>
      
      <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-gradient-to-br from-purple-500 to-pink-600">

      {/* Scrollable Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Generate many messages to test scrolling */}
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className={`p-4 rounded-lg max-w-[80%] ${
              i % 3 === 0
                ? 'bg-purple-600 text-white ml-auto'
                : 'bg-white text-gray-900 shadow-md'
            }`}
          >
            <div className="font-semibold text-sm mb-1">
              {i % 3 === 0 ? 'You' : 'Assistant'}
            </div>
            <div className="text-sm">
              Test message {i + 1} - Scroll down to see the real PromptInput component
            </div>
          </div>
        ))}
        
        {/* Show actual messages */}
        {messages.map((msg, idx) => (
          <div
            key={`msg-${idx}`}
            className={`p-4 rounded-lg max-w-[80%] ${
              msg.role === 'user'
                ? 'bg-purple-600 text-white ml-auto'
                : 'bg-white text-gray-900 shadow-md'
            }`}
          >
            <div className="font-semibold text-sm mb-1">
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div className="text-sm">{msg.content}</div>
          </div>
        ))}
        
        <div className="h-2" />
      </div>

      {/* Fixed Bottom - Real PromptInput Component */}
      <div className="flex-shrink-0 bg-white dark:bg-zinc-900 border-t-4 border-green-500 shadow-2xl pb-safe">
        <div className="p-4">
          <div className="bg-green-100 dark:bg-green-950 p-2 rounded-t-lg text-center mb-2">
            <span className="text-xs font-bold text-green-900 dark:text-green-100">
              ✅ Real PromptInput Component (with pb-safe)
            </span>
          </div>
          
          <PromptInput
            variableDefaults={[]}
            onVariableValueChange={() => {}}
            expandedVariable={null}
            onExpandedVariableChange={() => {}}
            chatInput={chatInput}
            onChatInputChange={setChatInput}
            onSendMessage={handleSendMessage}
            isTestingPrompt={isTestingPrompt}
            submitOnEnter={submitOnEnter}
            onSubmitOnEnterChange={setSubmitOnEnter}
            messages={messages}
            showVariables={false}
            placeholder="Type here - this is the real PromptInput component!"
            sendButtonVariant="blue"
            showShiftEnterHint={false}
          />
        </div>
      </div>
      </div>
    </>
  );
}

