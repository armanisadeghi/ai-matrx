// @ts-nocheck
import { createAsyncThunk } from "@reduxjs/toolkit";

export const loadSchemaForContext = createAsyncThunk<
  UISchema,
  string,
>("ui/loadSchemaForContext", async (context, { getState }) => {
  const schemaSlice = getState().globalCache;
  return schemaSlice.entities[context];
});

// Async thunk to load data based on schema
export const loadDataForSchema = createAsyncThunk<
  Record<string, unknown>[],
  string,
>("ui/loadDataForSchema", async (context, { getState }) => {
  const schemaSlice = getState().globalCache;
  const dataSlice = getState().entities;

  const schema = schemaSlice.entities[context]; // Get schema for context
  const data = dataSlice[context]; // Fetch data for the same context

  // Optionally, handle mismatches or data normalization here
  return data;
});
