// components/GoogleAccessCard.tsx
"use client";

import { useState, useEffect } from "react";
import { googleServices, ServiceKey } from "@/lib/googleScopes";
import { FaGoogle, FaGoogleDrive } from "react-icons/fa";
import { SiGooglecalendar } from "react-icons/si";
import { BiSearchAlt } from "react-icons/bi";
import { FcGoogle } from "react-icons/fc";
import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";

interface GoogleAccessCardProps {
  service: ServiceKey | string;
}

// Map service keys to their respective icons
const serviceIcons = {
  webmasters: BiSearchAlt,
  webmasters_readonly: BiSearchAlt,
  calendar_app_created: SiGooglecalendar,
  drive_file: FaGoogleDrive,
  default: FaGoogle,
};

export default function GoogleAccessCard({ service }: GoogleAccessCardProps) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check if the service exists in googleServices
  if (!googleServices[service as keyof typeof googleServices]) {
    console.error(`Service "${service}" not found in googleServices`);
    return (
      <div className="bg-textured shadow-lg rounded-xl p-6 flex flex-col items-center space-y-4 border-border">
        <FaGoogle className="w-8 h-8 text-red-500" />
        <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
          Unknown Service
        </h3>
        <p className="text-gray-600 dark:text-gray-300 text-center text-sm">
          Service "{service}" is not available or configured properly.
        </p>
      </div>
    );
  }

  const {
    name,
    scope,
    description,
    color = "#4285F4",
  } = googleServices[service as keyof typeof googleServices];

  // Get the appropriate icon component for this service
  const IconComponent =
    serviceIcons[service as keyof typeof serviceIcons] || serviceIcons.default;

  // Apply proper color or fallback to the Google blue
  const serviceColor = color || "#4285F4";

  // Get Google API context
  const {
    isGoogleLoaded,
    isAuthenticated,
    isInitializing,
    error,
    token,
    signIn,
    getGrantedScopes,
    requestScopes,
    resetError,
  } = useGoogleAPI();

  // Check if the specific service is authorized
  useEffect(() => {
    if (isAuthenticated) {
      const grantedScopes = getGrantedScopes();
      setIsAuthorized(grantedScopes.includes(scope));
    } else {
      setIsAuthorized(false);
    }
  }, [isAuthenticated, scope, getGrantedScopes]);

  const handleAuthorize = async () => {
    if (!isGoogleLoaded) {
      console.error("Google API not loaded yet");
      return;
    }

    setIsLoading(true);
    resetError(); // Clear any errors before starting

    try {
      if (!isAuthenticated) {
        // First sign in the user if not already signed in
        await signIn([scope]);

        // Wait briefly for auth state to update
        setTimeout(async () => {
          // Check if we need to request this specific scope
          if (!getGrantedScopes().includes(scope)) {
            await requestScopes([scope]);
          }
          setIsLoading(false);
        }, 500);
      } else {
        // If already authenticated, just request the specific scope
        const success = await requestScopes([scope]);
        setIsLoading(false);
      }
    } catch (error) {
      console.error(`Failed to authorize ${name}:`, error);
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-textured shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl p-6 flex flex-col items-center space-y-4 border-border relative overflow-hidden">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-2"
        style={{ backgroundColor: `${serviceColor}20` }} // Using the service color with transparency
      >
        <IconComponent className="w-8 h-8" style={{ color: serviceColor }} />
      </div>

      <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
        {name}
      </h3>

      <p className="text-gray-600 dark:text-gray-300 text-center text-sm">
        {description}
      </p>

      <p className="text-xs text-muted-foreground text-center font-mono break-all px-1">
        {scope}
      </p>

      <div className="w-full pt-2">
        <button
          onClick={handleAuthorize}
          disabled={isAuthorized || isLoading || isInitializing}
          style={{
            backgroundColor: isAuthorized
              ? "#34A853" // Google green for authorized state
              : isLoading || isInitializing
                ? "#4285F4AA" // Google blue with transparency for loading
                : serviceColor, // Service-specific color for default state
          }}
          className={`w-full px-4 py-2 rounded-lg text-white font-medium transition-colors duration-300 flex items-center justify-center space-x-2 ${
            isAuthorized
              ? "cursor-not-allowed"
              : isLoading || isInitializing
                ? "cursor-wait opacity-90"
                : "hover:brightness-90"
          }`}
        >
          {isLoading ? (
            <svg
              className="animate-spin h-5 w-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          ) : isInitializing ? (
            <>
              <span>Loading...</span>
            </>
          ) : (
            <>
              {isAuthorized ? (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    ></path>
                  </svg>
                  <span>Authorized</span>
                </>
              ) : (
                <>
                  <FcGoogle className="w-5 h-5" />
                  <span>Authorize</span>
                </>
              )}
            </>
          )}
        </button>
      </div>

      {isAuthorized && (
        <div
          className="text-xs mt-2 flex items-center"
          style={{ color: "#34A853" }} // Google green
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            ></path>
          </svg>
          Secure access granted
        </div>
      )}

      {/* Light/dark mode adaptive background overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent to-white dark:to-gray-900 opacity-5 rounded-xl pointer-events-none"></div>
    </div>
  );
}
