// features/scheduling/redux/runs/thunks.ts

import type { ThunkAction } from "redux-thunk";
import type { Action } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { listRunsForTask } from "../../service/queries";
import {
  fetchRunsError,
  fetchRunsPending,
  fetchRunsSuccess,
} from "./slice";

type AppThunk<T = void> = ThunkAction<Promise<T>, RootState, unknown, Action>;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const fetchRunsForTaskThunk =
  (taskId: string, limit = 20): AppThunk =>
  async (dispatch) => {
    dispatch(fetchRunsPending({ taskId }));
    try {
      const runs = await listRunsForTask(taskId, limit);
      dispatch(fetchRunsSuccess({ taskId, runs }));
    } catch (err) {
      dispatch(
        fetchRunsError({ taskId, error: errMessage(err) }),
      );
      throw err;
    }
  };
