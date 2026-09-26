// File: app/(auth-pages)/auth/auth-code-error/page.tsx

import Link from "next/link";
import AuthPageContainer from "@/components/auth/auth-page-container";
import { AuthMessageType } from "@/components/form-message";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface AuthCodeErrorProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AuthCodeError({ searchParams }: AuthCodeErrorProps) {
  const awaitedSearchParams = await searchParams;

  // Extract error parameters
  const error = awaitedSearchParams.error as string;
  const errorCode = awaitedSearchParams.error_code as string;
  const errorDescription = awaitedSearchParams.error_description as string;
  const redirectTo = (awaitedSearchParams.redirectTo as string) || "/dashboard";

  // Construct search params string for link preservation
  const searchParamsString = new URLSearchParams(
    Object.entries(awaitedSearchParams).reduce((acc, [key, value]) => {
      if (value) acc[key] = String(value);
      return acc;
    }, {} as Record<string, string>)
  ).toString();

  // Create error message
  let message: AuthMessageType = {
    type: "error",
    message: errorDescription || error || "An unexpected error occurred during authentication",
  };

  return (
    <AuthPageContainer
      title="Authentication Error"
      subtitle={
        <>
          Something went wrong during the authentication process.{" "}
          <ErrorAlchemyMenu
            className="align-middle"
            input={{
              title: "Authentication Error",
              message: message.message,
              code: errorCode || error || undefined,
              operation: "Sign in (authentication callback)",
              details: { redirect_to: redirectTo },
              source: "route-boundary",
            }}
          />{" "}
          <Link
            className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
            href={`/login${searchParamsString ? `?${searchParamsString}` : ""}`}
          >
            Try again
          </Link>
        </>
      }
      message={message}
    >
      <div className="space-y-4">
        {errorCode && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Error Code: <span className="font-mono">{errorCode}</span>
          </p>
        )}
        <p className="text-sm text-gray-600 dark:text-gray-400">
          If this error persists, please contact support with the details above.
        </p>
        <Link
          href={`/login${searchParamsString ? `?${searchParamsString}` : ""}`}
          className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Return to Login
        </Link>
      </div>
    </AuthPageContainer>
  );
}