import { createClient } from '@/utils/supabase/server';
import { extractErrorMessage } from '@/utils/errors';
import { cache } from 'react';

// Define types for app data
interface AppConfig {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  main_app_icon: string | null;
  main_app_submit_icon: string | null;
  creator: string;
  primary_color: string | null;
  accent_color: string | null;
  [key: string]: any;
}

interface AppletConfig {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  [key: string]: any;
}

interface AppData {
  app_config: AppConfig;
  applets: AppletConfig[];
}

// Cache the fetch results using React's built-in cache
export const getAppData = cache(async (slug: string | null = null, id: string | null = null): Promise<AppData | null> => {
  const cacheId = `${slug || ''}:${id || ''}`;
  const requestId = Math.random().toString(36).substring(2, 10);
  const startTime = Date.now();
  
  
  try {
    if (!slug && !id) {
      console.error(`[CACHE-DEBUG ${requestId}] No slug or ID provided`);
      return null;
    }
    
    
    let supabase;
    try {
      supabase = await createClient();
    } catch (clientError) {
      console.error(`[CACHE-DEBUG ${requestId}] Failed to create Supabase client:`, clientError);
      throw new Error(`Failed to initialize database client: ${extractErrorMessage(clientError)}`);
    }
    
    
    const { data, error, status } = await supabase.rpc("fetch_app_and_applet_config", {
      p_id: id,
      p_slug: slug,
    });
    
    const endTime = Date.now();

    if (error) {
      console.error(`[CACHE-DEBUG ${requestId}] Database error:`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      throw new Error(`Database error: ${error.message} (${error.code})`);
    }

    if (!data) {
      console.error(`[CACHE-DEBUG ${requestId}] No data returned from database`);
      return null;
    }
    
    // Validate the data structure
    if (!data.app_config) {
      console.error(`[CACHE-DEBUG ${requestId}] Invalid data structure - missing app_config:`, data);
      return null;
    }
    
    if (!Array.isArray(data.applets)) {
      console.error(`[CACHE-DEBUG ${requestId}] Invalid data structure - applets is not an array:`, data);
      // Try to fix if possible
      data.applets = data.applets ? [data.applets] : [];
    }

    
    return data as AppData;
  } catch (error) {
    const endTime = Date.now();
    console.error(`[CACHE-DEBUG ${requestId}] Unexpected error in getAppData (${endTime - startTime}ms):`, error);
    
    // In development, rethrow the error for better debugging
    if (process.env.NODE_ENV === 'development') {
      throw error;
    }
    
    // In production, return null to prevent app crashes
    return null;
  }
});

// Helper to get applet by slug
export const getAppletBySlug = async (appSlug: string, appletSlug: string): Promise<AppletConfig | null> => {
  const requestId = Math.random().toString(36).substring(2, 10);
  
  try {
    const appData = await getAppData(appSlug);
    if (!appData) {
      console.error(`[CACHE-DEBUG ${requestId}] App not found for appSlug:`, appSlug);
      return null;
    }
    
    const applet = appData.applets.find(applet => applet.slug === appletSlug);
    
    if (!applet) {
      console.error(`[CACHE-DEBUG ${requestId}] Applet not found with slug "${appletSlug}" in app "${appSlug}"`);
      return null;
    }
    
    
    return applet;
  } catch (error) {
    console.error(`[CACHE-DEBUG ${requestId}] Error in getAppletBySlug:`, error);
    return null;
  }
}; 