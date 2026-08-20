// Updated components/auth/auth-page-container.tsx
import React from "react";
import MatrixLogo from "@/components/branding/MatrixLogo";
import { FormMessage, AuthMessageType } from "@/components/form-message";

export interface AuthPageContainerProps {
  children: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  message?: AuthMessageType;
}

export default function AuthPageContainer({
  children,
  title,
  subtitle,
  message,
}: AuthPageContainerProps) {
  return (
    <div className="min-h-dvh w-full flex flex-col items-center justify-start overflow-y-auto bg-gradient-to-br from-gray-100 to-gray-200 dark:from-neutral-900 dark:to-neutral-800 px-3 py-6 sm:py-10">
      <div className="w-full max-w-md my-auto bg-white dark:bg-neutral-800 rounded-2xl shadow-[0_20px_50px_rgba(8,_112,_184,_0.7)] dark:shadow-[0_20px_50px_rgba(255,_255,_255,_0.2)] overflow-hidden transform transition-all hover:-translate-y-1 hover:shadow-[0_25px_60px_rgba(8,_112,_184,_0.8)] dark:hover:shadow-[0_25px_60px_rgba(255,_255,_255,_0.3)]">
        <div className="px-5 py-4 sm:py-6 sm:px-8">
          <div className="flex justify-center">
            <div className="transition-transform duration-300 ease-in-out hover:scale-110">
              <MatrixLogo size="md" />
            </div>
          </div>
          <h2 className="mt-3 sm:mt-4 text-2xl font-extrabold text-center text-gray-900 dark:text-white">
            {title}
          </h2>
          {subtitle && (
            <div className="mt-1.5 sm:mt-2 text-sm text-center text-gray-600 dark:text-gray-400">
              {subtitle}
            </div>
          )}
          <div className="mt-4 sm:mt-6">{children}</div>
        </div>

        {message && (
          <div className="px-5 pb-4 sm:pb-6 sm:px-8">
            <FormMessage message={message} />
          </div>
        )}
      </div>
    </div>
  );
}
