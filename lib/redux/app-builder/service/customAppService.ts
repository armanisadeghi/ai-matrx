import { requireUserId } from '@/utils/auth/getUserId';
import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { AppLayoutOptions, CustomAppConfig } from "@/types/customAppTypes";
import { isSlugInUse } from "@/config/applets/apps/constants";

// Define the database type for CustomAppConfig
export type CustomAppConfigDB = {
  id: string;
  created_at?: string;
  updated_at?: string;
  name: string;
  description?: string;
  slug: string;
  organization_id: string;
  main_app_icon?: string;
  main_app_submit_icon?: string;
  creator?: string;
  primary_color?: string;
  accent_color?: string;
  applet_list?: any;
  extra_buttons?: any;
  layout_type?: string;
  user_id?: string;
  is_public?: boolean;
  authenticated_read?: boolean;
  public_read?: boolean;
  image_url?: string;
  image_file_id?: string | null;
}


/**
 * Normalizes a CustomAppConfig object
 */
export const normalizeCustomAppConfig = (config: Partial<CustomAppConfig>): CustomAppConfig => {
  return {
    id: config.id,
    name: config.name || '',
    description: config.description || '',
    slug: config.slug || '',
    mainAppIcon: config.mainAppIcon || null,
    mainAppSubmitIcon: config.mainAppSubmitIcon || null,
    creator: config.creator || null,
    primaryColor: config.primaryColor || 'gray',
    accentColor: config.accentColor || 'blue',
    appletList: config.appletList || [],
    extraButtons: config.extraButtons || [],
    layoutType: config.layoutType || 'tabbedApplets',
    imageUrl: config.imageUrl || null,
    imageFileId: config.imageFileId || null,
    createdAt: config.createdAt || null,
    updatedAt: config.updatedAt || null,
    userId: config.userId || null,
    isPublic: config.isPublic || false,
    authenticatedRead: config.authenticatedRead || false,
    publicRead: config.publicRead || false
  };
};

/**
 * Converts a CustomAppConfig to the database format
 */
export const customAppConfigToDBFormat = async (config: CustomAppConfig): Promise<Omit<CustomAppConfigDB, 'id' | 'created_at' | 'updated_at'>> => {
  // Get the current user ID from the session
  const userId = requireUserId();
  const organizationId = await ensureOrgId(undefined);

  return {
    name: config.name,
    description: config.description || null,
    slug: config.slug,
    organization_id: organizationId,
    main_app_icon: config.mainAppIcon || null,
    main_app_submit_icon: config.mainAppSubmitIcon || null,
    creator: config.creator || null,
    primary_color: config.primaryColor || null,
    accent_color: config.accentColor || null,
    applet_list: config.appletList || null,
    extra_buttons: config.extraButtons || null,
    layout_type: config.layoutType || null,
    user_id: userId,
    is_public: false,
    authenticated_read: true,
    public_read: false,
    image_url: config.imageUrl || null,
    image_file_id: config.imageFileId || null
  };
};

/**
 * Converts a database record to a CustomAppConfig
 */
export const dbToCustomAppConfig = (dbRecord: CustomAppConfigDB): CustomAppConfig => {
  return normalizeCustomAppConfig({
    id: dbRecord.id,
    name: dbRecord.name,
    description: dbRecord.description,
    slug: dbRecord.slug,
    mainAppIcon: dbRecord.main_app_icon,
    mainAppSubmitIcon: dbRecord.main_app_submit_icon,
    creator: dbRecord.creator,
    primaryColor: dbRecord.primary_color,
    accentColor: dbRecord.accent_color,
    appletList: dbRecord.applet_list,
    extraButtons: dbRecord.extra_buttons,
    layoutType: dbRecord.layout_type as AppLayoutOptions,
    imageUrl: dbRecord.image_url,
    imageFileId: dbRecord.image_file_id,
    createdAt: dbRecord.created_at,
    updatedAt: dbRecord.updated_at,
    userId: dbRecord.user_id,
    isPublic: dbRecord.is_public,
    authenticatedRead: dbRecord.authenticated_read,
    publicRead: dbRecord.public_read
  });
};

/**
 * Fetches all custom app configs for the current user
 */
export const getAllCustomAppConfigs = async (): Promise<CustomAppConfig[]> => {
  // Get the current user ID
  const userId = requireUserId();
  
  const { data, error } = await supabase
    .from('custom_app_configs')
    .select('*')
    .eq('user_id', userId);
  if (error) {
    console.error('Error fetching custom app configs:', error);
    throw error;
  }
  return (data || []).map(dbToCustomAppConfig);
};

/**
 * Fetches all custom app configs for the current user along with their associated applets
 * This is an optimized version that gets everything in a single transaction
 */
export const getAllCustomAppConfigsWithApplets = async (): Promise<(CustomAppConfig & { appletIds: string[] })[]> => {
  // Get the current user ID
  const userId = requireUserId();
  
  // First, get all apps for the current user
  const { data: appsData, error: appsError } = await supabase
    .from('custom_app_configs')
    .select('*')
    .eq('user_id', userId);
    
  if (appsError) {
    console.error('Error fetching custom app configs:', appsError);
    throw appsError;
  }
  
  if (!appsData || appsData.length === 0) {
    return [];
  }
  
  // Get all app IDs
  const appIds = appsData.map(app => app.id);
  
  // Get all applets that reference these apps
  const { data: appletsData, error: appletsError } = await supabase
    .from('custom_applet_configs')
    .select('*')
    .in('app_id', appIds);
    
  if (appletsError) {
    console.error('Error fetching applets for apps:', appletsError);
    throw appletsError;
  }
  
  // Convert raw DB records to proper CustomAppConfig objects with applet IDs
  return appsData.map(appData => {
    // Find all applets associated with this app
    const appApplets = appletsData?.filter(applet => applet.app_id === appData.id) || [];
    const appletIds = appApplets.map(applet => applet.id);
    
    // Transform DB record to CustomAppConfig
    const appConfig = dbToCustomAppConfig(appData);
    
    // Create or update appletList with the applet data
    const appletList = appApplets.map(applet => ({
      appletId: applet.id,
      label: applet.name || applet.id,
      slug: applet.slug,
    }));
    
    // Ensure appletIds and appletList are properly set
    return {
      ...appConfig,
      appletIds,
      appletList: appletList.length > 0 ? appletList : appConfig.appletList || [],
    };
  });
};

/**
 * Fetches a specific custom app config by ID
 */
export const getCustomAppConfigById = async (id: string): Promise<CustomAppConfig | null> => {
  const { data, error } = await supabase
    .from('custom_app_configs')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') { // Record not found
      return null;
    }
    console.error('Error fetching custom app config:', error);
    throw error;
  }
  return data ? dbToCustomAppConfig(data) : null;
};

/**
 * Fetches a specific custom app config by slug
 */
export const getCustomAppConfigBySlug = async (slug: string): Promise<CustomAppConfig | null> => {
  const { data, error } = await supabase
    .from('custom_app_configs')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error) {
    if (error.code === 'PGRST116') { // Record not found
      return null;
    }
    console.error('Error fetching custom app config by slug:', error);
    throw error;
  }
  return data ? dbToCustomAppConfig(data) : null;
};

/**
 * Creates a new custom app config
 */
export const createCustomAppConfig = async (config: CustomAppConfig): Promise<CustomAppConfig> => {
  const dbData = await customAppConfigToDBFormat(config);
  
  // Debug: Log the data being sent to the database
  console.log('Creating custom app config with data:', JSON.stringify(dbData, null, 2));
  
  try {
    const { data, error } = await supabase
      .from('custom_app_configs')
      .insert(dbData)
      .select()
      .single();
    if (error) {
      console.error('Error creating custom app config:', error.message, error.details, error.hint);
      throw error;
    }
    if (!data) {
      throw new Error('No data returned from insert operation');
    }
    return dbToCustomAppConfig(data);
  } catch (err) {
    console.error('Exception in createCustomAppConfig:', err);
    throw err;
  }
};

/**
 * Updates an existing custom app config
 */
export const updateCustomAppConfig = async (id: string, config: CustomAppConfig): Promise<CustomAppConfig> => {
  const dbData = await customAppConfigToDBFormat(config);
  
  try {
    const { data, error } = await supabase
      .from('custom_app_configs')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Error updating custom app config:', error.message, error.details, error.hint);
      throw error;
    }
    if (!data) {
      throw new Error('No data returned from update operation');
    }
    return dbToCustomAppConfig(data);
  } catch (err) {
    console.error('Exception in updateCustomAppConfig:', err);
    throw err;
  }
};

/**
 * Deletes a custom app config
 */
export const deleteCustomAppConfig = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('custom_app_configs')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('Error deleting custom app config:', error);
    throw error;
  }
};

/**
 * Duplicates a custom app config
 */
export const duplicateCustomAppConfig = async (id: string): Promise<CustomAppConfig> => {
  // First get the config to duplicate
  const config = await getCustomAppConfigById(id);
  
  if (!config) {
    throw new Error(`Custom app config with id ${id} not found`);
  }
  
  // Create a copy with a new ID (the database will generate a new ID)
  const dbData = await customAppConfigToDBFormat(config);
  dbData.name = `${dbData.name} (Copy)`;
  dbData.slug = `${dbData.slug}-copy-${Date.now()}`;
  
  const { data, error } = await supabase
    .from('custom_app_configs')
    .insert(dbData)
    .select()
    .single();
  if (error) {
    console.error('Error duplicating custom app config:', error);
    throw error;
  }
  return dbToCustomAppConfig(data);
};

/**
 * Fetches public custom app configs
 */
export const getPublicCustomAppConfigs = async (): Promise<CustomAppConfig[]> => {
  const { data, error } = await supabase
    .from('custom_app_configs')
    .select('*')
    .eq('is_public', true);
  if (error) {
    console.error('Error fetching public custom app configs:', error);
    throw error;
  }
  return (data || []).map(dbToCustomAppConfig);
};

/**
 * Make a custom app config public or private
 */
export const setCustomAppConfigPublic = async (id: string, isPublic: boolean): Promise<void> => {
  const { error } = await supabase
    .from('custom_app_configs')
    .update({ is_public: isPublic })
    .eq('id', id);
  if (error) {
    console.error('Error updating custom app config visibility:', error);
    throw error;
  }
};

export const isAppSlugAvailable = async (slug: string, excludeId?: string): Promise<boolean> => {
  // Check if slug is already used in categories, subcategories, or forbidden list
  if (isSlugInUse(slug)) {
      return false;
  }

  let query = supabase
      .from("custom_app_configs")
      .select("id")
      .eq("slug", slug);

  if (excludeId) {
      query = query.neq("id", excludeId);
  }

  const { data, error } = await query;

  if (error) {
      console.error("Error checking app slug availability:", error);
      throw error;
  }

  return data.length === 0;
};