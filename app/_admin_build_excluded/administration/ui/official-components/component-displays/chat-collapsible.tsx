'use client';

import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import ChatCollapsibleWrapper from '@/components/mardown-display/blocks/ChatCollapsibleWrapper';
import { MessageSquare } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function ChatCollapsibleDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // Example code with all available props and their default values
  const code = `import ChatCollapsibleWrapper from '@/components/mardown-display/blocks/ChatCollapsibleWrapper';
import { MessageSquare } from 'lucide-react';

<ChatCollapsibleWrapper
  icon={<MessageSquare className="h-5 w-5 text-blue-500 dark:text-blue-400" />}
  title="Chat Messages"
  initialOpen={true}         // Whether the collapsible is open by default (true by default)
  onStateChange={(open) => {
    console.log('Collapsible state changed:', open);
  }}
  className=""               // Additional classes for the collapsible
>
  <div className="p-3">
    <p>Chat message content goes here.</p>
  </div>
</ChatCollapsibleWrapper>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="A styled collapsible wrapper designed specifically for chat interfaces. Includes a title with icon and a smooth animation effect."
    >
      <div className="w-full max-w-md">
        <ChatCollapsibleWrapper
          icon={<MessageSquare className="h-5 w-5 text-blue-500 dark:text-blue-400" />}
          title="Chat Messages"
          initialOpen={true}
        >
          <div className="p-3 text-gray-700 dark:text-gray-300">
            <p>This collapsible component is designed for chat interfaces.</p>
            <p className="mt-2">It has a more rounded styling and a divider between header and content.</p>
          </div>
        </ChatCollapsibleWrapper>
      </div>
    </ComponentDisplayWrapper>
  );
} 