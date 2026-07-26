// File: @/store/slices/layoutSlice.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface LayoutState {
    isInWindow: boolean;
    layoutStyle: 'normal' | 'extendedBottom' | 'window';
}

const initialState: LayoutState = {
    isInWindow: false,
    layoutStyle: 'normal',
};

const layoutSlice = createSlice({
    name: 'layout',
    initialState,
    reducers: {
        setIsInWindow: (state, action: PayloadAction<boolean>) => {
            state.isInWindow = action.payload;
        },
        setLayoutStyle: (state, action: PayloadAction<LayoutState['layoutStyle']>) => {
            state.layoutStyle = action.payload;
        },
    },
});

export const { setIsInWindow, setLayoutStyle } = layoutSlice.actions;
export default layoutSlice.reducer;