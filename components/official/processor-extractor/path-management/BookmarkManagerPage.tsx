"use client";
import React from 'react';
import UnifiedBookmarkManager from './UnifiedBookmarkManager';
import { useRouter } from 'next/navigation';
import { Bookmark } from '../types';
import { BookmarkIcon } from 'lucide-react';

/**
 * Standalone bookmark manager page component that can be used anywhere in the app
 */
const BookmarkManagerPage: React.FC = () => {
  const router = useRouter();

  // This function would navigate to the appropriate page based on bookmark type and config
  const handleJumpToBookmark = (bookmark: Bookmark) => {
    // For now, we'll just log the bookmark - in a real implementation,
    // this would navigate to the appropriate page
    console.log('Navigating to bookmark:', bookmark);
    
    // Example of how this might work (commented out for now):
    // if (bookmark.configKey) {
    //   router.push(`/config/${bookmark.configKey}?path=${encodeURIComponent(bookmark.path)}`);
    // }
  };

  return (
    <div className="container max-w-[95vw] mx-auto py-6 h-[calc(100dvh-4rem)]">
      <div className="flex flex-col h-full">
        <div className="mb-4 flex items-center gap-3">
          <BookmarkIcon className="h-7 w-7 text-blue-500" />
          <div>
            <h1 title="Manage all your saved paths and bookmarks across the application." className="text-3xl font-bold">Bookmark Manager</h1>
          </div>
        </div>
        
        <div className="flex-1 border rounded-lg overflow-hidden bg-background shadow-sm">
          <UnifiedBookmarkManager 
            isDialog={false}
            onJumpToBookmark={handleJumpToBookmark}
          />
        </div>
      </div>
    </div>
  );
};

export default BookmarkManagerPage; 