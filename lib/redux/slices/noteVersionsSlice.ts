/**
 * Note Versions Redux Slice
 * 
 * Manages version history state for notes
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { NoteVersion, VersionHistoryState } from '@/features/text-diff/types';
import { supabase } from '@/utils/supabase/client';

const initialState: VersionHistoryState = {
  versions: {},
  loading: {},
  error: {},
};

// ============================================================================
// Async Thunks
// ============================================================================

/**
 * Fetch version history for a note
 */
export const fetchNoteVersions = createAsyncThunk(
  'noteVersions/fetchNoteVersions',
  async (noteId: string) => {
    const { data, error } = await supabase.rpc('get_note_versions', {
      p_note_id: noteId,
    });

    if (error) throw error;

    // The RPC does not return `note_id`; stamp it back on for the local type.
    const versions: NoteVersion[] = (data ?? []).map((row) => ({
      ...row,
      note_id: noteId,
    }));

    return { noteId, versions };
  }
);

/**
 * Restore a note to a specific version
 */
export const restoreNoteVersion = createAsyncThunk(
  'noteVersions/restoreNoteVersion',
  async ({ noteId, versionNumber }: { noteId: string; versionNumber: number }) => {
    const { data, error } = await supabase.rpc('restore_note_version', {
      p_note_id: noteId,
      p_version_number: versionNumber,
    });

    if (error) throw error;
    if (!data) throw new Error('Failed to restore version');

    return { noteId, versionNumber };
  }
);

/**
 * Delete a specific version
 */
export const deleteNoteVersion = createAsyncThunk(
  'noteVersions/deleteNoteVersion',
  async ({ noteId, versionId }: { noteId: string; versionId: string }) => {
    const { error } = await supabase.rpc('delete_note_version', {
      p_id: versionId,
    });

    if (error) throw error;

    return { noteId, versionId };
  }
);

// ============================================================================
// Slice
// ============================================================================

const noteVersionsSlice = createSlice({
  name: 'noteVersions',
  initialState,
  reducers: {
    // Clear versions for a specific note
    clearNoteVersions: (state, action: PayloadAction<string>) => {
      const noteId = action.payload;
      delete state.versions[noteId];
      delete state.loading[noteId];
      delete state.error[noteId];
    },

    // Clear all versions
    clearAllVersions: (state) => {
      state.versions = {};
      state.loading = {};
      state.error = {};
    },
  },
  extraReducers: (builder) => {
    // Fetch versions
    builder
      .addCase(fetchNoteVersions.pending, (state, action) => {
        const noteId = action.meta.arg;
        state.loading[noteId] = true;
        state.error[noteId] = null;
      })
      .addCase(fetchNoteVersions.fulfilled, (state, action) => {
        const { noteId, versions } = action.payload;
        state.versions[noteId] = versions;
        state.loading[noteId] = false;
        state.error[noteId] = null;
      })
      .addCase(fetchNoteVersions.rejected, (state, action) => {
        const noteId = action.meta.arg;
        state.loading[noteId] = false;
        state.error[noteId] = action.error.message || 'Failed to fetch versions';
      });

    // Restore version
    builder
      .addCase(restoreNoteVersion.pending, (state, action) => {
        const noteId = action.meta.arg.noteId;
        state.loading[noteId] = true;
        state.error[noteId] = null;
      })
      .addCase(restoreNoteVersion.fulfilled, (state, action) => {
        const noteId = action.payload.noteId;
        state.loading[noteId] = false;
        state.error[noteId] = null;
        // Version list will be refetched by the component
      })
      .addCase(restoreNoteVersion.rejected, (state, action) => {
        const noteId = action.meta.arg.noteId;
        state.loading[noteId] = false;
        state.error[noteId] = action.error.message || 'Failed to restore version';
      });

    // Delete version
    builder
      .addCase(deleteNoteVersion.pending, (state, action) => {
        const noteId = action.meta.arg.noteId;
        state.loading[noteId] = true;
        state.error[noteId] = null;
      })
      .addCase(deleteNoteVersion.fulfilled, (state, action) => {
        const { noteId, versionId } = action.payload;
        
        // Remove the deleted version from state
        if (state.versions[noteId]) {
          state.versions[noteId] = state.versions[noteId].filter(
            v => v.id !== versionId
          );
        }
        
        state.loading[noteId] = false;
        state.error[noteId] = null;
      })
      .addCase(deleteNoteVersion.rejected, (state, action) => {
        const noteId = action.meta.arg.noteId;
        state.loading[noteId] = false;
        state.error[noteId] = action.error.message || 'Failed to delete version';
      });
  },
});

export const { clearNoteVersions, clearAllVersions } = noteVersionsSlice.actions;

// ============================================================================
// Selectors
// ============================================================================

type WithNoteVersions = { noteVersions: VersionHistoryState };

export const selectNoteVersions = (noteId: string) => (state: WithNoteVersions) =>
  state.noteVersions.versions[noteId];

export const selectNoteVersionsLoading = (noteId: string) => (state: WithNoteVersions) =>
  state.noteVersions.loading[noteId] ?? false;

export const selectNoteVersionsError = (noteId: string) => (state: WithNoteVersions) =>
  state.noteVersions.error[noteId] ?? null;

export const selectLatestVersion = (noteId: string) => (state: WithNoteVersions) => {
  const versions = state.noteVersions.versions[noteId];
  if (!versions || versions.length === 0) return null;
  return versions[0]; // Already sorted by version_number DESC
};

export default noteVersionsSlice.reducer;

