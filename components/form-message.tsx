// Updated components/form-message.tsx
import { cva } from "class-variance-authority";
import { CheckCircle, AlertTriangle, Info } from "lucide-react";

const messageVariants = cva(
  "flex items-center gap-3 p-4 rounded-lg text-sm font-medium",
  {
    variants: {
      variant: {
        success:
          "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
        error: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        info: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

export type AuthMessageType = {
  type: "success" | "error" | "info";
  message: string;
};

const DEFAULT_ERROR_MESSAGE =
  "An error occurred. Please try again or contact support.";
const DEFAULT_SUCCESS_MESSAGE = "Operation completed successfully.";

export function FormMessage({
  message,
}: {
  message: AuthMessageType | null | undefined;
}) {
  // Safety check - if no message or not a proper object, return null
  if (!message || typeof message !== "object") return null;

  // Check if message has the required properties using optional chaining
  const messageType = message?.type;
  let messageText = message?.message;

  // If type exists but message is empty, undefined, or just contains "{}" or is just whitespace
  // use a default message based on the type
  if (
    messageType &&
    (!messageText || messageText.trim() === "" || messageText === "{}")
  ) {
    if (messageType === "error") {
      messageText = DEFAULT_ERROR_MESSAGE;
    } else if (messageType === "success") {
      messageText = DEFAULT_SUCCESS_MESSAGE;
    } else {
      messageText = "Information notification";
    }
  }

  // If either property is missing or the message is still empty, return null
  if (!messageType || !messageText) return null;

  const getIcon = () => {
    switch (messageType) {
      case "success":
        return <CheckCircle className="h-5 w-5" />;
      case "error":
        return <AlertTriangle className="h-5 w-5" />;
      case "info":
        return <Info className="h-5 w-5" />;
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  return (
    <div
      role={messageType === "error" ? "alert" : "status"}
      aria-live={messageType === "error" ? "assertive" : "polite"}
      className={messageVariants({
        variant: messageType,
      })}
    >
      {getIcon()}
      <span>{messageText}</span>
    </div>
  );
}
