/**
 * Resource Management Thunks
 * 
 * Async operations for resource management including:
 * - File uploads
 * - Resource validation
 * - Batch operations
 * 
 * All thunks automatically update Redux state, eliminating the need
 * for manual state management in components.
 * 
 * @module resourceThunks
 */

import { createAsyncThunk } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '../../store';
import { addResource, removeResource, setResources } from '../slice';
import { validateResource, deduplicateResources } from '../utils/resourceUtils';
import type { Resource } from '@/features/agents/resources/types';

/**
 * Upload file and add to resources
 * 
 * Handles file upload and automatically adds the uploaded file to resources.
 * Shows loading state and error handling.
 * 
 * @example
 * ```typescript
 * await dispatch(uploadAndAddFileResource({
 *   runId: 'abc-123',
 *   file: selectedFile,
 *   bucket: 'userContent',
 *   path: 'attachments',
 *   uploadFn: uploadToSupabase
 * })).unwrap();
 * ```
 */
export const uploadAndAddFileResource = createAsyncThunk<
  Resource,
  {
    runId: string;
    file: File;
    bucket: string;
    path: string;
    uploadFn: (files: File[]) => Promise<any[]>;
  },
  { 
    dispatch: AppDispatch; 
    state: RootState;
    rejectValue: string;
  }
>(
  'promptExecution/uploadAndAddFileResource',
  async ({ runId, file, bucket, path, uploadFn }, { dispatch, rejectWithValue }) => {
    try {
      // Upload file
      const results = await uploadFn([file]);
      
      if (!results || results.length === 0) {
        return rejectWithValue('Upload failed: No results returned');
      }
      
      // Create resource object
      const resource: Resource = {
        type: 'file',
        data: results[0]
      };
      
      // Validate resource
      const validation = validateResource(resource);
      if (!validation.valid) {
        return rejectWithValue(`Invalid resource: ${validation.error}`);
      }
      
      // Add to Redux
      dispatch(addResource({ runId, resource }));
      
      console.log('✅ File uploaded and added to resources:', file.name);
      
      return resource;
      
    } catch (error) {
      console.error('❌ Failed to upload file:', error);
      return rejectWithValue(
        error instanceof Error ? error.message : 'Upload failed'
      );
    }
  }
);

/**
 * Upload image and add to resources
 * 
 * Specifically for image uploads, creates an image_url resource type.
 * 
 * @example
 * ```typescript
 * await dispatch(uploadAndAddImageResource({
 *   runId: 'abc-123',
 *   file: imageFile,
 *   bucket: 'userContent',
 *   path: 'images'
 * })).unwrap();
 * ```
 */
export const uploadAndAddImageResource = createAsyncThunk<
  Resource,
  {
    runId: string;
    file: File;
    bucket: string;
    path: string;
    uploadFn: (files: File[]) => Promise<any[]>;
  },
  { 
    dispatch: AppDispatch; 
    state: RootState;
    rejectValue: string;
  }
>(
  'promptExecution/uploadAndAddImageResource',
  async ({ runId, file, bucket, path, uploadFn }, { dispatch, rejectWithValue }) => {
    try {
      // Upload file
      const results = await uploadFn([file]);
      
      if (!results || results.length === 0) {
        return rejectWithValue('Upload failed: No results returned');
      }
      
      // Create image resource
      const resource: Resource = {
        type: 'image_url',
        data: {
          url: results[0].url,
          filename: file.name,
          size: file.size,
          ...results[0]
        }
      };
      
      // Validate
      const validation = validateResource(resource);
      if (!validation.valid) {
        return rejectWithValue(`Invalid resource: ${validation.error}`);
      }
      
      // Add to Redux
      dispatch(addResource({ runId, resource }));
      
      console.log('✅ Image uploaded and added to resources:', file.name);
      
      return resource;
      
    } catch (error) {
      console.error('❌ Failed to upload image:', error);
      return rejectWithValue(
        error instanceof Error ? error.message : 'Upload failed'
      );
    }
  }
);

/**
 * Upload audio file and add to resources
 * 
 * Specifically for audio file uploads, creates an audio resource type.
 * 
 * @example
 * ```typescript
 * await dispatch(uploadAndAddAudioResource({
 *   runId: 'abc-123',
 *   file: audioFile,
 *   bucket: 'userContent',
 *   path: 'audio'
 * })).unwrap();
 * ```
 */
export const uploadAndAddAudioResource = createAsyncThunk<
  Resource,
  {
    runId: string;
    file: File;
    bucket: string;
    path: string;
    uploadFn: (files: File[]) => Promise<any[]>;
  },
  { 
    dispatch: AppDispatch; 
    state: RootState;
    rejectValue: string;
  }
>(
  'promptExecution/uploadAndAddAudioResource',
  async ({ runId, file, bucket, path, uploadFn }, { dispatch, rejectWithValue }) => {
    try {
      // Upload file
      const results = await uploadFn([file]);
      
      if (!results || results.length === 0) {
        return rejectWithValue('Upload failed: No results returned');
      }
      
      // Create audio resource
      const resource: Resource = {
        type: 'audio',
        data: {
          url: results[0].url,
          filename: file.name,
          ...results[0]
        }
      };
      
      // Validate
      const validation = validateResource(resource);
      if (!validation.valid) {
        return rejectWithValue(`Invalid resource: ${validation.error}`);
      }
      
      // Add to Redux
      dispatch(addResource({ runId, resource }));
      
      console.log('✅ Audio uploaded and added to resources:', file.name);
      
      return resource;
      
    } catch (error) {
      console.error('❌ Failed to upload audio:', error);
      return rejectWithValue(
        error instanceof Error ? error.message : 'Upload failed'
      );
    }
  }
);

/**
 * Upload multiple files
 * 
 * Batch upload operation that adds all files to resources.
 * 
 * @example
 * ```typescript
 * await dispatch(uploadMultipleFiles({
 *   runId: 'abc-123',
 *   files: [file1, file2, file3],
 *   bucket: 'userContent',
 *   path: 'attachments'
 * })).unwrap();
 * ```
 */
export const uploadMultipleFiles = createAsyncThunk<
  Resource[],
  {
    runId: string;
    files: File[];
    bucket: string;
    path: string;
    uploadFn: (files: File[]) => Promise<any[]>;
  },
  { 
    dispatch: AppDispatch; 
    state: RootState;
    rejectValue: string;
  }
>(
  'promptExecution/uploadMultipleFiles',
  async ({ runId, files, bucket, path, uploadFn }, { dispatch, rejectWithValue }) => {
    try {
      // Upload all files
      const results = await uploadFn(files);
      
      if (!results || results.length === 0) {
        return rejectWithValue('Upload failed: No results returned');
      }
      
      // Create resources
      const resources: Resource[] = results.map((result, index) => ({
        type: 'file',
        data: {
          filename: files[index]?.name,
          size: files[index]?.size,
          ...result
        }
      }));
      
      // Validate all resources
      const invalidResources = resources.filter(r => !validateResource(r).valid);
      if (invalidResources.length > 0) {
        return rejectWithValue(`${invalidResources.length} invalid resource(s)`);
      }
      
      // Add all to Redux
      resources.forEach(resource => {
        dispatch(addResource({ runId, resource }));
      });
      
      console.log(`✅ ${resources.length} files uploaded and added to resources`);
      
      return resources;
      
    } catch (error) {
      console.error('❌ Failed to upload files:', error);
      return rejectWithValue(
        error instanceof Error ? error.message : 'Upload failed'
      );
    }
  }
);

/**
 * Add resource with validation
 * 
 * Adds a pre-existing resource (e.g., URL, YouTube) with validation.
 * Use this when the resource doesn't need to be uploaded.
 * 
 * @example
 * ```typescript
 * await dispatch(addValidatedResource({
 *   runId: 'abc-123',
 *   resource: {
 *     type: 'webpage',
 *     data: { url: 'https://example.com', title: 'Example' }
 *   }
 * })).unwrap();
 * ```
 */
export const addValidatedResource = createAsyncThunk<
  Resource,
  {
    runId: string;
    resource: Resource;
  },
  { 
    dispatch: AppDispatch; 
    state: RootState;
    rejectValue: string;
  }
>(
  'promptExecution/addValidatedResource',
  async ({ runId, resource }, { dispatch, rejectWithValue }) => {
    // Validate resource
    const validation = validateResource(resource);
    
    if (!validation.valid) {
      return rejectWithValue(`Invalid resource: ${validation.error}`);
    }
    
    // Add to Redux
    dispatch(addResource({ runId, resource }));
    
    console.log('✅ Resource added:', resource.type);
    
    return resource;
  }
);

/**
 * Add multiple resources
 * 
 * Batch operation for adding multiple pre-existing resources.
 * 
 * @example
 * ```typescript
 * await dispatch(addMultipleResources({
 *   runId: 'abc-123',
 *   resources: [resource1, resource2, resource3]
 * })).unwrap();
 * ```
 */
export const addMultipleResources = createAsyncThunk<
  Resource[],
  {
    runId: string;
    resources: Resource[];
    deduplicate?: boolean;
  },
  { 
    dispatch: AppDispatch; 
    state: RootState;
    rejectValue: string;
  }
>(
  'promptExecution/addMultipleResources',
  async ({ runId, resources, deduplicate = true }, { dispatch, rejectWithValue }) => {
    // Validate all resources
    const invalidResources = resources.filter(r => !validateResource(r).valid);
    
    if (invalidResources.length > 0) {
      return rejectWithValue(`${invalidResources.length} invalid resource(s)`);
    }
    
    // Optionally deduplicate
    const resourcesToAdd = deduplicate 
      ? deduplicateResources(resources) 
      : resources;
    
    // Add all to Redux
    resourcesToAdd.forEach(resource => {
      dispatch(addResource({ runId, resource }));
    });
    
    console.log(`✅ ${resourcesToAdd.length} resources added`);
    
    return resourcesToAdd;
  }
);

/**
 * Replace all resources
 * 
 * Replaces the entire resource array for a run.
 * Useful for bulk operations or loading saved resources.
 * 
 * @example
 * ```typescript
 * await dispatch(replaceAllResources({
 *   runId: 'abc-123',
 *   resources: savedResources
 * })).unwrap();
 * ```
 */
export const replaceAllResources = createAsyncThunk<
  Resource[],
  {
    runId: string;
    resources: Resource[];
  },
  { 
    dispatch: AppDispatch; 
    state: RootState;
    rejectValue: string;
  }
>(
  'promptExecution/replaceAllResources',
  async ({ runId, resources }, { dispatch, rejectWithValue }) => {
    // Validate all resources
    const invalidResources = resources.filter(r => !validateResource(r).valid);
    
    if (invalidResources.length > 0) {
      return rejectWithValue(`${invalidResources.length} invalid resource(s)`);
    }
    
    // Replace in Redux
    dispatch(setResources({ runId, resources }));
    
    console.log(`✅ Replaced resources:`, resources.length);
    
    return resources;
  }
);

/**
 * Remove resource by index with validation
 * 
 * Safely removes a resource after checking bounds.
 * 
 * @example
 * ```typescript
 * await dispatch(removeResourceSafe({
 *   runId: 'abc-123',
 *   index: 2
 * })).unwrap();
 * ```
 */
export const removeResourceSafe = createAsyncThunk<
  number,
  {
    runId: string;
    index: number;
  },
  { 
    dispatch: AppDispatch; 
    state: RootState;
    rejectValue: string;
  }
>(
  'promptExecution/removeResourceSafe',
  async ({ runId, index }, { dispatch, getState, rejectWithValue }) => {
    const state = getState();
    const resources = state.promptExecution?.resources[runId];
    
    if (!resources || index < 0 || index >= resources.length) {
      return rejectWithValue(`Invalid index: ${index}`);
    }
    
    // Remove from Redux
    dispatch(removeResource({ runId, index }));
    
    console.log(`✅ Resource removed at index ${index}`);
    
    return index;
  }
);

