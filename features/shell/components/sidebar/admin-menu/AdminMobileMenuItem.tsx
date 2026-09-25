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
import { selectIsAdminPerson } from "@/lib/redux/selectors/userSelectors";

const AdminMobileMenu = dynamic(() => import("./AdminMobileMenu"), {
  ssr: false,
  loading: () => null,
});

export default function AdminMobileMenuItem() {
  // ADMIN IDENTITY: the mobile way INTO the admin section.
  const isAdmin = useAppSelector(selectIsAdminPerson);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated || !isAdmin) return null;

  return <AdminMobileMenu />;
}
