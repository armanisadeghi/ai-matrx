import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { resendSignupConfirmationAction } from "@/actions/auth.actions";
import AuthPageContainer from "@/components/auth/auth-page-container";
import type { AuthMessageType } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import {
  AUTH_DEST_PARAM,
  preserveAuthDestination,
  readAuthDestination,
} from "@/utils/auth/auth-destination";
import { readPendingSignupEmail } from "@/utils/auth/pending-signup";

export const metadata: Metadata = {
  title: "Check your email | AI Matrx",
};

interface CheckEmailProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CheckEmail({ searchParams }: CheckEmailProps) {
  const params = await searchParams;
  const email = await readPendingSignupEmail();
  const redirectTo = readAuthDestination(params);
  const error = firstParam(params.error);
  const success = firstParam(params.success);
  const message: AuthMessageType | undefined = error
    ? { type: "error", message: error }
    : success
      ? { type: "success", message: success }
      : undefined;

  const destinationSource = { [AUTH_DEST_PARAM]: redirectTo };

  return (
    <AuthPageContainer
      title="Check your email"
      subtitle={
        email
          ? "Confirm your email address to finish creating your AI Matrx account."
          : "Create an account to receive a confirmation email."
      }
      message={message}
    >
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
          <MailCheck className="h-8 w-8" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          {email ? (
            <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">
              We sent a confirmation link to
              <strong className="block break-all font-semibold text-gray-950 dark:text-white">
                {email}
              </strong>
            </p>
          ) : (
            <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">
              There is no pending signup in this browser. Start signup or sign
              in if you already confirmed your account.
            </p>
          )}
          {email ? (
            <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
              Open the email and select <strong>Confirm your email</strong>. The
              link expires after 24 hours. Check spam or junk if it is not in
              your inbox.
            </p>
          ) : null}
        </div>

        {email ? (
          <form action={resendSignupConfirmationAction}>
            <input
              type="hidden"
              name={AUTH_DEST_PARAM}
              value={redirectTo ?? ""}
            />
            <SubmitButton
              pendingText="Sending a new link..."
              className="min-h-11 w-full"
            >
              Resend confirmation email
            </SubmitButton>
          </form>
        ) : (
          <Link
            href={preserveAuthDestination("/sign-up", destinationSource)}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create an account
          </Link>
        )}

        <div className="flex flex-col gap-2 border-t border-gray-200 pt-4 text-sm dark:border-gray-700">
          {email ? (
            <Link
              href={preserveAuthDestination("/sign-up", destinationSource)}
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              Use a different email
            </Link>
          ) : null}
          <Link
            href={preserveAuthDestination("/login", destinationSource)}
            className="font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            Already confirmed? Sign in
          </Link>
        </div>
      </div>
    </AuthPageContainer>
  );
}
