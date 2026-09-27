"use client";
import { useEffect } from "react";
import { isChunkLoadError } from "@/components/errors/chunk-load-recovery";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkFailure = isChunkLoadError(error);

  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  // Function to handle refreshing the page
  const refreshPage = () => {
    // First try the provided reset function from Next.js
    try {
      reset();
    } catch (e) {
      console.error("Reset function failed:", e);
    }

    // Regardless, force a page refresh after a small delay
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  // Function to go back to the previous page or home
  const goToHome = () => {
    window.location.href = "/";
  };

  // A required chunk failed to load. Render a calm recovery prompt and NEVER
  // infer the cause: chunk failures also happen on fresh document loads. The
  // user refreshes on their terms because another surface may hold draft work.
  if (isChunkFailure) {
    return (
      <html>
        <body className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-dvh flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <h2 className="text-lg font-semibold mb-1">
              This page couldn&apos;t finish loading
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              A required part of the page failed to load. Refresh to retry.
              <ErrorAlchemyMenu />
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
            >
              Refresh
            </button>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html>
      <body className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-dvh flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-textured shadow-lg rounded-lg overflow-hidden">
          <div className="p-6">
            {/* 🚨 THE ROOT CRASH SCREEN SAYS WHAT HAPPENED AND WHAT TO DO — nothing
                else (page-pass shared defects, 2026-09-27). It used to read
                "This feature is still under development … We really need Arman
                to get his act together!" with a "Fire Arman" vote, and a failed
                or slow sign-in landed people on it. A stranger reads this. */}
            <div className="flex items-center justify-center mb-4">
              <svg
                className="w-10 h-10 text-gray-400 dark:text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <h2 className="text-xl font-semibold text-center">
                This page stopped working
              </h2>
              {/* The crash itself, copyable for AI (RC-B12): this screen catches
                  every route with no error.tsx of its own. */}
              <ErrorAlchemyMenu
                size="icon"
                input={{
                  title: "This page stopped working",
                  message: error.message || "An unexpected error stopped this page.",
                  error,
                  operation: "Show this page",
                  details: error.digest ? { digest: error.digest } : undefined,
                  source: "route-boundary",
                }}
              />
            </div>
            <p className="text-gray-600 dark:text-gray-300 text-center">
              An error stopped this page from loading. This is usually
              temporary — refresh to try again. If it keeps happening, go to the
              home page and try once more.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
              <button
                onClick={refreshPage}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh page
              </button>
              <button
                onClick={goToHome}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium rounded-lg transition-colors duration-200 flex items-center justify-center"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                Go home
              </button>
            </div>
            {error.digest && (
              <p className="mt-6 text-xs text-gray-500 dark:text-gray-400 text-center">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
