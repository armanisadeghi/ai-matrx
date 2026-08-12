// File: app/(auth-pages)/forgot-password/page.tsx

import { forgotPasswordAction } from "@/actions/auth.actions";
import { AuthMessageType } from "@/components/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import AuthPageContainer from "@/components/auth/auth-page-container";
import {
  preserveAuthDestination,
  readAuthDestination,
} from "@/utils/auth/auth-destination";

interface ForgotPasswordProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ForgotPassword({
  searchParams,
}: ForgotPasswordProps) {
  const awaitedSearchParams = await searchParams;

  const redirectTo = readAuthDestination(awaitedSearchParams);
  const error = awaitedSearchParams.error as string;
  const success = awaitedSearchParams.success as string;

  let message: AuthMessageType | undefined;

  if (success) {
    message = {
      type: "success",
      message: success,
    };
  } else if (error) {
    message = {
      type: "error",
      message: error,
    };
  }

  return (
    <AuthPageContainer
      title="Reset Password"
      subtitle={
        <div className="flex flex-col items-center gap-1">
          <span>Enter your email to reset your password.</span>
          <Link
            className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
            href={preserveAuthDestination("/login", { redirectTo })}
            tabIndex={-1}
          >
            Back to Sign in
          </Link>
        </div>
      }
      message={message}
    >
      <form action={forgotPasswordAction} className="space-y-6">
        <div>
          <Label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Email address
          </Label>
          <div className="mt-1">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-neutral-700 dark:text-white"
            />
          </div>
        </div>
        <div>
          <SubmitButton
            pendingText="Sending..."
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
          >
            Reset Password
          </SubmitButton>
        </div>
        {/* Add hidden input for redirectTo if needed */}
        <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />
      </form>
    </AuthPageContainer>
  );
}
