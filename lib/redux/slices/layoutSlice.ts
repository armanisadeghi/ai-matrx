// File: @/store/slices/layoutSlice.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface LayoutState {
    isInWindow: boolean;
    layoutStyle: 'normal' | 'extendedBottom' | 'window';
    /**
     * The shell's chat dock (features/shell/chat-dock). `null` = nobody has
     * toggled it in this tab yet, so readers use the server-read cookie value
     * they were rendered with — the first paint never disagrees with the server.
     */
    chatDockOpen: boolean | null;
    /** Below 1024px the dock is a bottom sheet instead; never remembered. */
    chatDockSheetOpen: boolean;
}

const initialState: LayoutState = {
    isInWindow: false,
    layoutStyle: 'normal',
    chatDockOpen: null,
    chatDockSheetOpen: false,
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
        setChatDockOpen: (state, action: PayloadAction<boolean>) => {
            state.chatDockOpen = action.payload;
        },
        setChatDockSheetOpen: (state, action: PayloadAction<boolean>) => {
            state.chatDockSheetOpen = action.payload;
        },
    },
});

export const { setIsInWindow, setLayoutStyle, setChatDockOpen, setChatDockSheetOpen } = layoutSlice.actions;

/** The chat dock's open flag, or null before anyone toggled it in this tab. */
export const selectChatDockOpen = (state: { layout: LayoutState }): boolean | null =>
    state.layout.chatDockOpen;

export const selectChatDockSheetOpen = (state: { layout: LayoutState }): boolean =>
    state.layout.chatDockSheetOpen;
export default layoutSlice.reducer;