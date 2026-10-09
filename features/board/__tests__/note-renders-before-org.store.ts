import { configureStore } from "@reduxjs/toolkit";
import notes from "@/features/notes/redux/slice";

/** A real notes slice with a signed-in person and NO active organization yet (boot still loading). */
export const store = configureStore({
  reducer: {
    notes,
    userAuth: () => ({ id: "user-1" }),
    appContext: () => ({ organization_id: null }),
  },
  middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
});
