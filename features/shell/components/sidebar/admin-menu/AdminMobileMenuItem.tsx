"use client";

// AdminMobileMenuItem — the single "Administration" entry in the mobile sheet.
//
// Same contract as AdminSidebarSection: renders ONLY for admins (any admin tier) via
// `selectIsAdmin`, and lazy-loads the stacked category accordion (AdminMobileMenu)
// only after admin status is confirmed. Sits exactly where the old admin mobile
// items did (after Settings).

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";

const AdminMobileMenu = dynamic(() => import("./AdminMobileMenu"), {
  ssr: false,
  loading: () => null,
});

export default function AdminMobileMenuItem() {
  const isAdmin = useAppSelector(selectIsAdmin) ?? false;

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated || !isAdmin) return null;

  return <AdminMobileMenu />;
}
