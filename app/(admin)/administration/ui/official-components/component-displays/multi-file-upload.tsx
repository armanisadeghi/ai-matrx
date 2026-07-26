'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { MultiFileUpload } from '@/components/ui/file-upload/file-upload';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function MultiFileUploadDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleFilesChange = (files: File[]) => {
    console.log('Files uploaded:', files);
    setSelectedFiles(files);
  };

  // Example code with all available props and their default values
  const code = `import { MultiFileUpload } from '@/components/ui/file-upload/file-upload';

function MyComponent() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleFilesChange = (files: File[]) => {
    console.log('Files uploaded:', files);
    setSelectedFiles(files);
  };

  return (
    <MultiFileUpload
      onChange={handleFilesChange}           // Callback when files are selected
      multiple={true}                        // Allow multiple file selection (default: false)
      maxHeight="400px"                      // Maximum height for file list (default: "400px")
      initialFiles={[]}                      // Pre-populate with uploaded files (default: [])
    />
  );
}`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Beautiful animated file upload component with drag-and-drop support, animated grid background, and file preview list. Perfect for multiple file uploads with a modern UI."
    >
      <div className="w-full max-w-2xl">
        <MultiFileUpload
          onChange={handleFilesChange}
          multiple={true}
          maxHeight="400px"
        />
        
        {selectedFiles.length > 0 && (
          <div className="mt-4 p-4 bg-white dark:bg-neutral-800 rounded-lg">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Selected {selectedFiles.length} file(s)
            </p>
            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              {selectedFiles.map((file, idx) => (
                <li key={idx}>
                  {file.name} - {(file.size / (1024 * 1024)).toFixed(2)} MB
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ComponentDisplayWrapper>
  );
}

