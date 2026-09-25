"use client";

// THE ADMIN LANE, UI half (rule: utils/supabase/adminLane.ts). Mirrors "is the
// current page in the admin section" into `userAuth.adminLaneOpen`, which the
// default admin gates (`selectIsSuperAdmin`, `selectIsAdmin`,
// `selectAdminLevel`) require. The per-tab store outlives route-group
// changes, so a client navigation from /administration to /notes must close
// the lane here — the `(admin)` layout's seed only covers the first render.

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setAdminLaneOpen } from "@/lib/redux/slices/userAuthSlice";
import { selectAdminLaneOpen } from "@/lib/redux/selectors/userSelectors";
import { isAdminLanePath } from "@/utils/supabase/adminLane";

export function AdminLaneSync() {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const laneOpen = useAppSelector(selectAdminLaneOpen);
  const shouldBeOpen = isAdminLanePath(pathname);

  useLayoutEffect(() => {
    if (laneOpen !== shouldBeOpen) dispatch(setAdminLaneOpen(shouldBeOpen));
  }, [dispatch, laneOpen, shouldBeOpen]);

  return null;
}
