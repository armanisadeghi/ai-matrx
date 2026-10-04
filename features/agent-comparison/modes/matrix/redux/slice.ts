import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { clampRepeats, emptySetup, newVariantId, variantsFromPrompts } from "../model";
import type {
  MatrixAxisKey,
  MatrixBattleState,
  MatrixCell,
  MatrixPatch,
  MatrixSetup,
} from "../types";

const initialState: MatrixBattleState = {
  setup: emptySetup(),
  activeSetId: null,
  activeSetName: null,
  dirty: false,
  cells: [],
  runInFlight: false,
  runError: null,
  readError: null,
};

const slice = createSlice({
  name: "agentComparisonMatrix",
  initialState,
  reducers: {
    setBasePatch(state, action: PayloadAction<MatrixPatch>) {
      state.setup.base = action.payload;
      state.dirty = true;
    },
    setAxisLabel(state, action: PayloadAction<{ axis: MatrixAxisKey; label: string }>) {
      state.setup[action.payload.axis].label = action.payload.label;
      state.dirty = true;
    },
    addVariant(state, action: PayloadAction<{ axis: MatrixAxisKey; label?: string }>) {
      const axis = state.setup[action.payload.axis];
      axis.variants.push({
        id: newVariantId(),
        label: action.payload.label ?? `${axis.variants.length + 1}`,
        patch: {},
      });
      state.dirty = true;
    },
    addPromptVariants(state, action: PayloadAction<{ axis: MatrixAxisKey; prompts: string[] }>) {
      const axis = state.setup[action.payload.axis];
      axis.variants.push(...variantsFromPrompts(action.payload.prompts, axis.variants.length));
      state.dirty = true;
    },
    duplicateVariant(state, action: PayloadAction<{ axis: MatrixAxisKey; id: string }>) {
      const axis = state.setup[action.payload.axis];
      const i = axis.variants.findIndex((v) => v.id === action.payload.id);
      if (i < 0) return;
      const src = axis.variants[i];
      axis.variants.splice(i + 1, 0, {
        id: newVariantId(),
        label: `${src.label} copy`,
        patch: JSON.parse(JSON.stringify(src.patch)) as MatrixPatch,
      });
      state.dirty = true;
    },
    moveVariant(
      state,
      action: PayloadAction<{ axis: MatrixAxisKey; id: string; delta: -1 | 1 }>,
    ) {
      const list = state.setup[action.payload.axis].variants;
      const i = list.findIndex((v) => v.id === action.payload.id);
      const j = i + action.payload.delta;
      if (i < 0 || j < 0 || j >= list.length) return;
      const [item] = list.splice(i, 1);
      list.splice(j, 0, item);
      state.dirty = true;
    },
    removeVariant(state, action: PayloadAction<{ axis: MatrixAxisKey; id: string }>) {
      const axis = state.setup[action.payload.axis];
      axis.variants = axis.variants.filter((v) => v.id !== action.payload.id);
      state.dirty = true;
    },
    setVariantLabel(
      state,
      action: PayloadAction<{ axis: MatrixAxisKey; id: string; label: string }>,
    ) {
      const v = state.setup[action.payload.axis].variants.find((x) => x.id === action.payload.id);
      if (!v) return;
      v.label = action.payload.label;
      state.dirty = true;
    },
    setVariantPatch(
      state,
      action: PayloadAction<{ axis: MatrixAxisKey; id: string; patch: MatrixPatch }>,
    ) {
      const v = state.setup[action.payload.axis].variants.find((x) => x.id === action.payload.id);
      if (!v) return;
      v.patch = action.payload.patch;
      state.dirty = true;
    },
    setRepeats(state, action: PayloadAction<number>) {
      state.setup.repeats = clampRepeats(action.payload);
      state.dirty = true;
    },
    loadMatrix(
      state,
      action: PayloadAction<{ id: string; name: string; setup: MatrixSetup; cells: MatrixCell[] }>,
    ) {
      state.setup = action.payload.setup;
      state.activeSetId = action.payload.id;
      state.activeSetName = action.payload.name;
      state.cells = action.payload.cells;
      state.dirty = false;
      state.runError = null;
      state.readError = null;
    },
    setActiveMatrixSet(state, action: PayloadAction<{ id: string; name: string } | null>) {
      state.activeSetId = action.payload?.id ?? null;
      state.activeSetName = action.payload?.name ?? null;
      if (!action.payload) state.cells = [];
    },
    markSaved(state) {
      state.dirty = false;
    },
    setCells(state, action: PayloadAction<MatrixCell[]>) {
      state.cells = action.payload;
      state.readError = null;
    },
    setReadError(state, action: PayloadAction<string | null>) {
      state.readError = action.payload;
    },
    setRunInFlight(state, action: PayloadAction<boolean>) {
      state.runInFlight = action.payload;
    },
    setRunError(state, action: PayloadAction<string | null>) {
      state.runError = action.payload;
    },
    resetMatrix() {
      return { ...initialState, setup: emptySetup() };
    },
  },
});

export const {
  setBasePatch,
  setAxisLabel,
  addVariant,
  addPromptVariants,
  duplicateVariant,
  moveVariant,
  removeVariant,
  setVariantLabel,
  setVariantPatch,
  setRepeats,
  loadMatrix,
  setActiveMatrixSet,
  markSaved,
  setCells,
  setReadError,
  setRunInFlight,
  setRunError,
  resetMatrix,
} = slice.actions;

export default slice.reducer;
