"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SlackManager from "../../components/SlackManager";

export default function OAuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Get code and error from URL search parameters
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const provider = window.location.pathname.split("/").pop(); // Extract provider from URL path

  useEffect(() => {
    // Create the redirect URL based on received parameters
    let redirectUrl = "/";

    if (provider) {
      if (error) {
        redirectUrl = `/?provider=${provider}&error=${error}`;
      } else if (code) {
        redirectUrl = `/?provider=${provider}&code=${code}`;
      } else {
        redirectUrl = `/?provider=${provider}&error=missing_code`;
      }
    }

    // Log token
    console.log(`Received token for ${provider}:`, code);

    // Redirect to the application
    // router.push(redirectUrl);
  }, [searchParams, router, provider, code, error]);

  if (!code && !error) {
    return (
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <h1 className="text-xl font-medium text-gray-700">
            Processing authentication...
          </h1>
          <p className="text-gray-500 mt-2">You will be redirected shortly.</p>
        </div>
    );
  }

  if (error) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-xl font-medium text-red-600">
              Authentication Error
            </h1>
            <p className="text-gray-500 mt-2">{error}</p>
          </div>
        </div>
    );
  }

  return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-xl font-medium text-gray-700">
            Processed {provider} authentication
          </h1>
          <pre className="text-gray-500 mt-2">{code}</pre>
        </div>
        <SlackManager tokenData={{ access_token: code }} />
      </div>
  );
}