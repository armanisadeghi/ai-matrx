'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { FileUploadWithStorage, UploadedFileResult } from '@/components/ui/file-upload/FileUploadWithStorage';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2 } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function FileUploadWithStorageDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleUploadComplete = (results: UploadedFileResult[]) => {
    console.log('Upload complete:', results);
    setUploadedFiles(prev => [...prev, ...results]);
  };

  const handleUploadStatusChange = (uploading: boolean) => {
    setIsUploading(uploading);
  };

  // Example code with all available props and their default values
  const code = `import { FileUploadWithStorage, UploadedFileResult } from '@/components/ui/file-upload/FileUploadWithStorage';

function MyComponent() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleUploadComplete = (results: UploadedFileResult[]) => {
    console.log('Upload complete:', results);
    setUploadedFiles(prev => [...prev, ...results]);
  };

  const handleUploadStatusChange = (uploading: boolean) => {
    setIsUploading(uploading);
  };

  return (
    <FileUploadWithStorage
      bucket="userContent"                    // Supabase storage bucket (default: "userContent")
      path="uploads"                          // Path within bucket (optional)
      saveTo="public"                         // "public" | "private" | undefined
      onUploadComplete={handleUploadComplete} // Callback with uploaded file results
      onUploadStatusChange={handleUploadStatusChange} // Callback for upload status
      multiple={true}                         // Allow multiple files (default: false)
      useMiniUploader={false}                 // Use compact version (default: false)
      maxHeight="400px"                       // Max height for file list (default: varies)
      initialFiles={[]}                       // Pre-populate with files (default: [])
    />
  );
}

// UploadedFileResult type:
// {
//   url: string;              // Public URL to access the file
//   type: string;             // File type classification
//   details?: {               // Enhanced file details
//     category: FileCategory;
//     filename: string;
//     extension: string;
//     mimetype?: string;
//     size?: number;
//     // ... more details
//   }
// }`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Full-featured file upload component with automatic Supabase storage integration. Includes animated progress indicators, multiple upload support, and returns public URLs for uploaded files. Supports both public and private storage buckets."
    >
      <div className="w-full max-w-2xl space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
            Standard Upload (Multiple Files)
          </h3>
          <FileUploadWithStorage
            bucket="userContent"
            path="demo-uploads"
            saveTo="public"
            onUploadComplete={handleUploadComplete}
            onUploadStatusChange={handleUploadStatusChange}
            multiple={true}
            useMiniUploader={false}
            maxHeight="300px"
          />
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
            Mini Upload (Single File)
          </h3>
          <FileUploadWithStorage
            bucket="userContent"
            path="demo-uploads"
            saveTo="public"
            onUploadComplete={handleUploadComplete}
            onUploadStatusChange={handleUploadStatusChange}
            multiple={false}
            useMiniUploader={true}
            maxHeight="200px"
          />
        </div>

        {uploadedFiles.length > 0 && (
          <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-800 dark:text-green-300">
              <p className="font-semibold mb-2">Successfully uploaded {uploadedFiles.length} file(s):</p>
              <ul className="text-xs space-y-1">
                {uploadedFiles.map((file, idx) => (
                  <li key={idx} className="truncate">
                    <strong>{file.details?.filename || 'Unknown'}</strong> - {file.type}
                    <br />
                    <span className="text-green-700 dark:text-green-400 text-xs break-all">
                      {file.url}
                    </span>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {isUploading && (
          <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <AlertDescription className="text-blue-800 dark:text-blue-300 text-sm">
              Upload in progress...
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ComponentDisplayWrapper>
  );
}

