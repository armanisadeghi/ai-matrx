'use client';

import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import RawJsonExplorer from '@/components/official/json-explorer/RawJsonExplorer';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function JsonExplorerDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // Sample JSON data for the explorer
  const sampleData = {
    user: {
      id: 1,
      name: "John Doe",
      email: "john@example.com",
      preferences: {
        theme: "dark",
        notifications: true
      },
      posts: [
        { id: 101, title: "First Post", likes: 42 },
        { id: 102, title: "Second Post", likes: 17 }
      ]
    },
    stats: {
      views: 1254,
      comments: 18
    }
  };
  
  // Example code with all available props and their default values
  const code = `import RawJsonExplorer from '@/components/official/json-explorer/RawJsonExplorer';

// Your JSON data to explore
const jsonData = {
  user: {
    id: 1,
    name: "John Doe",
    // ... more data
  },
  stats: {
    // ... statistics
  }
};

<RawJsonExplorer pageData={jsonData} />`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="An interactive JSON explorer that allows navigation through complex JSON structures, with bookmarking capabilities and path tracking."
      className="h-[500px]"
    >
      <div className="w-full h-full overflow-auto">
        <RawJsonExplorer pageData={sampleData} />
      </div>
    </ComponentDisplayWrapper>
  );
} 