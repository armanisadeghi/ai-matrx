"use client";
import { useEffect, useState } from "react";
import {
  attemptChunkReload,
  isChunkLoadError,
} from "@/components/errors/chunk-load-recovery";

// Terminal component for the "Fire Arman" option
const TerminalOutput = () => {
  const [messages, setMessages] = useState([]);
  const terminalMessages = [
    "...",
    "User account deleted...",
    "User content wiped clean...",
    "All history removed...",
    "Server security protocol initiated...",
    "IP address blocked...",
    "Clearing cache memory...",
    "Removing file access privileges...",
    "Erasing network credentials...",
    "Accessing User GPS coordinates...",
    "...",
    "Locating close relatives...",
    "...",
    "Initiating background tasks...",
    "█▒▒░ ░▒ █░▒▒▒█▒░▒▒ █░▒▒▒ ░▒▒▒░█▒░ ░▒▒▒░",
    "[ENCRYPTED] 9aF2#f@3x!z9Q1v$--decoding interrupted...",
    "[SYS_LOG] ∆$#@!!*#--Binary mismatch--RETRYING...",
    "0x4A 0x75 0x64 0x67 0x6D 0x65 0x6E 0x74",
    "▓▒░ █▒█▒░▒▒ █░▒▒░▒▒▒ ░▒▒▒░█▒░ ░▒▒▒░",
    "...",
    "But no hard feelings.",
    "Goodbye.",
    "01010111 01100101 00100000 01110011 01100101 01100101 00100000 01111001 01101111 01110101",
    "▒▒░▒█▒▒░ ░▒ █░▒▒▒█▒░▒▒ █░▒▒▒ ░▒▒▒░█▒░ ░▒▒▒░",
  ];

  useEffect(() => {
    let messageIndex = 0;
    const interval = setInterval(() => {
      if (messageIndex < terminalMessages.length) {
        setMessages((prev) => [...prev, terminalMessages[messageIndex]]);
        messageIndex++;
      } else {
        clearInterval(interval);
      }
    }, 600);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-6 p-4 bg-black text-green-500 font-mono text-sm rounded-md overflow-hidden max-h-128 overflow-y-auto">
      {messages.map((msg, index) => (
        <div key={index} className="flex items-start">
          <span className="mr-2">&gt;</span>
          <span>{msg}</span>
        </div>
      ))}
      {messages.length < terminalMessages.length && (
        <div className="animate-pulse">_</div>
      )}
    </div>
  );
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [voteOption, setVoteOption] = useState<string | null>(null);
  const isStaleChunk = isChunkLoadError(error);

  useEffect(() => {
    console.error("[GlobalError]", error);
    // Stale-tab recovery: a Vercel deploy invalidated the chunks this tab
    // is referencing. Try a one-shot hard reload to pick up the new build.
    // attemptChunkReload is no-op'd if it already fired in the last 30s.
    if (isStaleChunk) {
      attemptChunkReload(error);
    }
  }, [error, isStaleChunk]);

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

  // Stale-tab UI: render a calm "Updating…" screen instead of the
  // "Fire Arman" joke while the auto-reload kicks in. The reload is
  // already scheduled in the effect above; this just avoids the flash.
  if (isStaleChunk) {
    return (
      <html>
        <body className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-dvh flex items-center justify-center p-4">
          <div className="text-center">
            <div className="inline-block w-8 h-8 border-2 border-gray-300 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin mb-4" />
            <h2 className="text-lg font-semibold mb-1">Updating to the latest version…</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              A new build was deployed. Reloading this tab.
            </p>
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
            <div className="flex items-center justify-center mb-6">
              <svg
                className="w-16 h-16 text-red-500 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-center mb-2">
              This feature is still under development
            </h2>
            <p className="text-gray-600 dark:text-gray-300 text-center mb-2">
              Sorry, we may have occasional outages during upgrades.
            </p>
            <p className="text-red-500 dark:text-red-400 text-center text-lg font-bold mb-6 italic">
              We really need Arman to get his act together!
            </p>

            {/* Voting Section */}
            {!voteOption && (
              <div className="mb-6">
                <p className="text-center font-medium mb-3">
                  Vote for what we should do:
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setVoteOption("fire")}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors duration-200"
                  >
                    Fire Arman
                  </button>
                  <button
                    onClick={() => setVoteOption("break")}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
                  >
                    Give him a break!
                  </button>
                  <button
                    onClick={() => setVoteOption("dontcare")}
                    className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium rounded-lg transition-colors duration-200"
                  >
                    I don't care
                  </button>
                </div>
              </div>
            )}

            {/* Response based on vote */}
            {voteOption === "break" && (
              <div className="mb-6 p-4 bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100 rounded-lg text-center">
                <p className="font-bold text-lg">You have chosen wisely.</p>
                <p className="text-sm mt-1">Enjoy the app!</p>
              </div>
            )}

            {voteOption === "fire" && <TerminalOutput />}

            {voteOption === "dontcare" && (
              <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-center">
                <p>Fair enough. We'll handle this internally.</p>
              </div>
            )}

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
