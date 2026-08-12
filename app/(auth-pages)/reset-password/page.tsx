// File: app/(auth-pages)/reset-password/page.tsx

import { resetPasswordAction } from "@/actions/auth.actions";
import { AuthMessageType } from "@/components/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import AuthPageContainer from "@/components/auth/auth-page-container";
import { readAuthDestination } from "@/utils/auth/auth-destination";

interface ResetPasswordProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ResetPassword({
  searchParams,
}: ResetPasswordProps) {
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
      title="Reset password"
      subtitle="Please enter your new password below."
      message={message}
    >
      <form action={resetPasswordAction} className="space-y-6">
        {/* The destination has ridden all the way here — through the
                    login bounce, the forgot-password form, an email, and
                    /auth/callback. Without this field it dies on the last
                    hop: the page read it and never handed it to the action. */}
        <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />
        <div>
          <Label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            New password
          </Label>
          <div className="mt-1">
            <Input
              id="password"
              type="password"
              name="password"
              placeholder="New password"
              required
              className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-neutral-700 dark:text-white"
            />
          </div>
        </div>
        <div>
          <Label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Confirm password
          </Label>
          <div className="mt-1">
            <Input
              id="confirmPassword"
              type="password"
              name="confirmPassword"
              placeholder="Confirm password"
              required
              className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-neutral-700 dark:text-white"
            />
          </div>
        </div>
        <div>
          <SubmitButton
            pendingText="Resetting..."
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
          >
            Reset password
          </SubmitButton>
        </div>
      </form>
    </AuthPageContainer>
  );
}
