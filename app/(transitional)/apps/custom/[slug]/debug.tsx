'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAppDispatch } from '@/lib/redux/hooks';
import { fetchAppWithApplets } from '@/lib/redux/app-runner/thunks/appRunnerThunks';

/**
 * Debug component to help diagnose fetch issues
 */
export default function DebugFetch() {
  const params = useParams();
  const slug = params.slug as string;
  const dispatch = useAppDispatch();
  const [fetchAttempted, setFetchAttempted] = useState(false);
  
  useEffect(() => {
    // Manual fetch attempt
    const runFetch = async () => {
      console.log('DEBUG: Manual fetch attempt with slug:', slug);
      try {
        setFetchAttempted(true);
        await dispatch(fetchAppWithApplets({ 
          idOrSlug: slug, 
          isSlug: true,
          validationOptions: {
            runValidations: false,
            logResults: false
          }
        })).unwrap();
        console.log('DEBUG: Manual fetch succeeded');
      } catch (error) {
        console.error('DEBUG: Manual fetch failed:', error);
      }
    };
    
    // Run the fetch after a short delay
    const timer = setTimeout(() => {
      if (!fetchAttempted && slug) {
        runFetch();
      }
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [dispatch, slug, fetchAttempted]);
  
  // Don't render anything visible
  return null;
} 