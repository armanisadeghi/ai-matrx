// lib/googleScopes.ts
//
// Scopes registered on the AI Matrx GCP OAuth consent screen.
// Keep this list in sync with Google Cloud Console → Data Access.

export const REGISTERED_GOOGLE_SCOPE_URLS = [
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/drive.file",
] as const;

export type RegisteredGoogleScopeUrl =
  (typeof REGISTERED_GOOGLE_SCOPE_URLS)[number];

export const googleServices = {
  webmasters: {
    name: "Search Console (read/write)",
    scope: "https://www.googleapis.com/auth/webmasters",
    description: "View and manage Search Console data for your verified sites.",
    color: "#0F9D58",
    icon: "webmasters",
  },
  webmasters_readonly: {
    name: "Search Console (read-only)",
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    description: "Read-only access to Search Console data.",
    color: "#34A853",
    icon: "webmasters",
  },
  analytics_readonly: {
    name: "Google Analytics (read-only)",
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    description: "Read Analytics accounts, properties, and reporting data.",
    color: "#E37400",
    icon: "analytics",
  },
  youtube_readonly: {
    name: "YouTube (read-only)",
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    description:
      "View the connected account's YouTube channels and owner-visible content.",
    color: "#FF0000",
    icon: "youtube",
  },
  calendar_app_created: {
    name: "App-created Calendars",
    scope: "https://www.googleapis.com/auth/calendar.app.created",
    description:
      "Create and manage secondary Google Calendars created by this app.",
    color: "#4285F4",
    icon: "calendar",
  },
  drive_file: {
    name: "Drive (app files only)",
    scope: "https://www.googleapis.com/auth/drive.file",
    description:
      "Access only Google Drive files created or opened by this app.",
    color: "#0F9D58",
    icon: "drive",
  },
} as const;

export type ServiceKey = keyof typeof googleServices;

export const googleBrandColors = {
  blue: "#4285F4",
  red: "#DB4437",
  yellow: "#F4B400",
  green: "#0F9D58",
  lightBlue: "#00ACC1",
  purple: "#673AB7",
};
