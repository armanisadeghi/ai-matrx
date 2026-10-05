"use client";

import { Button } from "@ai-matrx/design-system";
import { type ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type Props = Omit<ComponentProps<typeof Button>, "type"> & {
    pendingText?: string;
};

export function EmailSignInButton({ children, pendingText = "Signing in...", ...props }: Props) {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" aria-disabled={pending} {...props}>
            {pending ? pendingText : children}
        </Button>
    );
}

export function GoogleSignInButton({ children, pendingText = "Connecting...", ...props }: Props) {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" aria-disabled={pending} {...props}>
            {pending ? pendingText : children}
        </Button>
    );
}

export function GithubSignInButton({ children, pendingText = "Connecting...", ...props }: Props) {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" aria-disabled={pending} {...props}>
            {pending ? pendingText : children}
        </Button>
    );
}

export function AppleSignInButton({ children, pendingText = "Connecting...", ...props }: Props) {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" aria-disabled={pending} {...props}>
            {pending ? pendingText : children}
        </Button>
    );
}
