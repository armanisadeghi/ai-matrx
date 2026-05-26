"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import type { ReactNode } from "react";

export default function GoogleApisSimpleLayoutClient({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <GoogleOAuthProvider clientId="34576215171-sf7s11b5v9i9djdlb6unqllrbe6lahk8.apps.googleusercontent.com">
      {children}
    </GoogleOAuthProvider>
  );
}
