// app/(authenticated)/tests/google-apis/simple/page.tsx
"use client";

import { useGoogleLogin } from "@react-oauth/google";

export default function GoogleAccessPage() {
  const login = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/drive",
    onSuccess: (tokenResponse) => {
      console.log("Token Response:", tokenResponse);
    },
    onError: () => {
      console.log("Login Failed");
    },
  });

  return (
    <button onClick={() => login()}>Sign in with Google 🚀</button>
  );
}
