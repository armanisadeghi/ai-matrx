// lib/redux/hooks.ts
'use client';

import { useCallback } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { ThunkAction, UnknownAction } from '@reduxjs/toolkit';
import type { AppDispatch, AppStore, RootState } from './store';

// Use throughout your app instead of plain `useDispatch` and `useSelector`
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();

/**
 * Dispatch a thunk *function* (a hand-written `(dispatch, getState) => R`
 * thunk, or any `ThunkAction`) and get back its real return value `R`.
 *
 * Why this exists: `AppDispatch` is `ThunkDispatch<…> & Dispatch<…>` (see the
 * comment on `AppDispatch` in `store.ts`). Under `strictFunctionTypes`, calling
 * `dispatch(myThunk())` directly makes TS resolve the intersection's overloads
 * ambiguously and fall through to the plain-action `Dispatch` overload, which
 * rejects a function — the classic TS2769
 * ("AsyncThunkAction/function is not assignable to UnknownAction"). Call sites
 * used to paper over this with
 * `dispatch(myThunk() as unknown as Parameters<typeof dispatch>[0])`.
 *
 * By declaring the argument as `ThunkAction<R, …>`, this helper pins the
 * thunk-accepting overload of `ThunkDispatch`, so `dispatch(thunk)` resolves
 * to `R` with no cast. The plain `(dispatch: AppDispatch) => R` thunks these
 * sites use are structurally assignable to `ThunkAction<R, …>`, so they pass
 * through the parameter check honestly (fewer trailing params + a `dispatch`
 * param the store dispatch satisfies).
 */
export function dispatchThunk<R>(
  dispatch: AppDispatch,
  thunk: ThunkAction<R, RootState, unknown, UnknownAction>,
): R {
  return dispatch(thunk);
}

/**
 * Hook form of {@link dispatchThunk}: returns a typed function that dispatches
 * a thunk *function* and returns its result `R` — no `Parameters<typeof
 * dispatch>[0]` cast at the call site.
 *
 * @example
 *   const dispatchThunk = useDispatchThunk();
 *   await dispatchThunk(invalidateAndRefetchFullContext());
 */
export function useDispatchThunk() {
  const dispatch = useAppDispatch();
  return useCallback(
    <R>(thunk: ThunkAction<R, RootState, unknown, UnknownAction>): R =>
      dispatch(thunk),
    [dispatch],
  );
}
