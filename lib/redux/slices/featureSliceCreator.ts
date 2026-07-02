// @ts-nocheck
// File Location: lib/redux/sliceCreator.ts
import {
  createSlice,
  PayloadAction,
  ActionReducerMapBuilder,
  SliceCaseReducers,
} from "@reduxjs/toolkit";
import type {
  FeatureName,
  SliceState,
  DeleteResponse,
  PaginatedResponse,
} from "@/types/reduxTypes";
import { createApiThunks } from "../middleware/apiThunks";
import * as z from "zod";

export const createFeatureSlice = <T extends z.ZodTypeAny>(
  featureName: FeatureName,
  featureSchema: T,
  staleTime: number = 600000, // 10 minutes
  additionalReducers: SliceCaseReducers<SliceState<z.infer<T>>> = {},
) => {
  type FeatureType = z.infer<T>;

  const initialState: SliceState<FeatureType> = {
    items: {},
    allIdAndNames: [],
    totalCount: 0,
    loading: false,
    error: null,
    lastFetched: {},
    staleTime,
    backups: {},
  };

  const apiThunks = createApiThunks(featureName, featureSchema);

  const slice = createSlice({
    name: featureName,
    initialState,
    reducers: {
      markDataStale: (state, action: PayloadAction<string>) => {
        delete state.lastFetched[action.payload];
      },
      updateOptimistic: (state, action: PayloadAction<FeatureType>) => {
        const id = action.payload.id;
        state.backups[id] = state.items[id];
        state.items[id] = action.payload;
      },
      revertOptimisticUpdate: (state, action: PayloadAction<string>) => {
        const id = action.payload;
        if (state.backups[id]) {
          state.items[id] = state.backups[id];
          delete state.backups[id];
        }
      },
      addOptimistic: (state, action: PayloadAction<FeatureType>) => {
        const id = action.payload.id;
        state.backups[id] = state.items[id];
        state.items[id] = action.payload;
        state.allIdAndNames.push({
          id: action.payload.id,
          name: action.payload.name,
        });
        state.totalCount += 1;
      },
      removeOptimistic: (state, action: PayloadAction<string>) => {
        const id = action.payload;
        state.backups[id] = state.items[id];
        delete state.items[id];
        state.allIdAndNames = state.allIdAndNames.filter(
          (item) => item.id !== id,
        );
        state.totalCount -= 1;
      },
      replaceOptimistic: (
        state,
        action: PayloadAction<{ tempId: string; realEntity: FeatureType }>,
      ) => {
        const { tempId, realEntity } = action.payload;
        state.backups[realEntity.id] = state.items[realEntity.id];
        delete state.items[tempId];
        state.items[realEntity.id] = realEntity;
        const index = state.allIdAndNames.findIndex(
          (item) => item.id === tempId,
        );
        if (index !== -1) {
          state.allIdAndNames[index] = {
            id: realEntity.id,
            name: realEntity.name,
          };
        }
      },
      ...additionalReducers,
    },
    extraReducers: (
      builder: ActionReducerMapBuilder<SliceState<FeatureType>>,
    ) => {
      const handleFetchOneFulfilled = (
        state: SliceState<FeatureType>,
        action: PayloadAction<FeatureType>,
      ) => {
        const validatedItem = action.payload;
        state.loading = false;
        state.items[validatedItem.id] = validatedItem;
        state.lastFetched[validatedItem.id] = Date.now();
      };

      const handleFetchPaginatedFulfilled = (
        state: SliceState<FeatureType>,
        action: PayloadAction<PaginatedResponse<FeatureType>>,
      ) => {
        console.log(
          "handleFetchPaginatedFulfilled called with payload:",
          JSON.stringify(action.payload, null, 2),
        );

        const { paginatedData, allIdAndNames, totalCount } = action.payload;

        console.log(
          "Updating state with paginatedData:",
          JSON.stringify(paginatedData, null, 2),
        );
        paginatedData.forEach((item) => {
          const validatedItem = featureSchema.parse(item);
          state.items[validatedItem.id] = validatedItem;
          state.lastFetched[validatedItem.id] = Date.now();
        });

        console.log(
          "Updating state with allIdAndNames:",
          JSON.stringify(allIdAndNames, null, 2),
        );
        state.allIdAndNames = allIdAndNames;
        console.log("Updating state with totalCount:", totalCount);
        state.totalCount = totalCount;
        state.loading = false;

        console.log("State after update:", JSON.stringify(state, null, 2));
      };

      const handleDeleteOneFulfilled = (
        state: SliceState<FeatureType>,
        action: PayloadAction<DeleteResponse>,
      ) => {
        const deletedId = action.payload.deletedIds[0];
        delete state.items[deletedId];
        state.allIdAndNames = state.allIdAndNames.filter(
          (item) => item.id !== deletedId,
        );
        state.totalCount -= 1;
        delete state.lastFetched[deletedId];
        state.loading = false;
      };

      const handleDeleteManyFulfilled = (
        state: SliceState<FeatureType>,
        action: PayloadAction<DeleteResponse>,
      ) => {
        action.payload.deletedIds.forEach((id) => {
          delete state.items[id];
          delete state.lastFetched[id];
        });
        state.allIdAndNames = state.allIdAndNames.filter(
          (item) => !action.payload.deletedIds.includes(item.id),
        );
        state.totalCount -= action.payload.deletedIds.length;
        state.loading = false;
      };

      const handleUpdateFulfilled = (
        state: SliceState<FeatureType>,
        action: PayloadAction<FeatureType>,
      ) => {
        const updatedEntity = action.payload;
        state.items[updatedEntity.id] = updatedEntity;
        const index = state.allIdAndNames.findIndex(
          (item) => item.id === updatedEntity.id,
        );
        if (index !== -1) {
          state.allIdAndNames[index].name = updatedEntity.name;
        }
        state.lastFetched[updatedEntity.id] = Date.now();
        state.loading = false;
      };

      builder
        .addCase(apiThunks.fetchOne.pending, (state) => {
          state.loading = true;
        })
        .addCase(apiThunks.fetchOne.fulfilled, handleFetchOneFulfilled)
        .addCase(apiThunks.fetchOne.rejected, (state, action) => {
          state.loading = false;
          state.error = action.payload as string;
        })
        .addCase(apiThunks.fetchPaginated.pending, (state) => {
          console.log("fetchPaginated.pending");
          state.loading = true;
        })
        .addCase(
          apiThunks.fetchPaginated.fulfilled,
          handleFetchPaginatedFulfilled,
        )
        .addCase(apiThunks.fetchPaginated.rejected, (state, action) => {
          console.log("fetchPaginated.rejected with payload:", action.payload);
          state.loading = false;
          state.error = action.payload as string;
        })
        .addCase(apiThunks.deleteOne.pending, (state) => {
          state.loading = true;
        })
        .addCase(apiThunks.deleteOne.fulfilled, handleDeleteOneFulfilled)
        .addCase(apiThunks.deleteOne.rejected, (state, action) => {
          state.loading = false;
          state.error = action.payload as string;
        })
        .addCase(apiThunks.deleteMany.pending, (state) => {
          state.loading = true;
        })
        .addCase(apiThunks.deleteMany.fulfilled, handleDeleteManyFulfilled)
        .addCase(apiThunks.deleteMany.rejected, (state, action) => {
          state.loading = false;
          state.error = action.payload as string;
        })
        .addCase(apiThunks.update.pending, (state) => {
          state.loading = true;
        })
        .addCase(apiThunks.update.fulfilled, handleUpdateFulfilled)
        .addCase(apiThunks.update.rejected, (state, action) => {
          state.loading = false;
          state.error = action.payload as string;
        })
        .addCase(apiThunks.create.pending, (state) => {
          state.loading = true;
        })
        .addCase(
          apiThunks.create.fulfilled,
          (state, action: PayloadAction<FeatureType>) => {
            const newEntity = action.payload;
            state.items[newEntity.id] = newEntity;
            state.allIdAndNames.push({
              id: newEntity.id,
              name: newEntity.name,
            });
            state.totalCount += 1;
            state.lastFetched[newEntity.id] = Date.now();
            state.loading = false;
          },
        )
        .addCase(apiThunks.create.rejected, (state, action) => {
          state.loading = false;
          state.error = action.payload as string;
        });
    },
  });

  return {
    reducer: slice.reducer,
    actions: {
      ...slice.actions,
      ...apiThunks,
    },
  };
};
