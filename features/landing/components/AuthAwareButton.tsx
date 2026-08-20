"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/utils/supabase/client";
import {
  safeRequestIdleCallback,
  safeCancelIdleCallback,
} from "@/utils/browser-compat";
import type { User } from "@supabase/supabase-js";
import { useLoginHref } from "@/hooks/auth/useLoginHref";

const BUTTON_CLASS =
  "w-full sm:w-auto text-base border border-zinc-300 dark:border-zinc-700 min-w-[140px]";

export function AuthAwareButton() {
  const loginHref = useLoginHref();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const id = safeRequestIdleCallback(() => {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data }) => {
        if (!cancelled) {
          setUser(data.session?.user ?? null);
          setChecked(true);
        }
      });
    });

    return () => {
      cancelled = true;
      safeCancelIdleCallback(id);
    };
  }, []);

  if (!checked || !user) {
    return (
      <Link href={loginHref} className="w-full sm:w-auto">
        <Button
          variant="ghost"
          size="lg"
          className={`${BUTTON_CLASS} hover:bg-zinc-100 dark:hover:bg-zinc-800`}
        >
          <LogIn className="mr-2 h-4 w-4" />
          Sign In
        </Button>
      </Link>
    );
  }

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (user.email ? user.email.split("@")[0] : "User");

  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Button
      variant="ghost"
      size="lg"
      disabled={isPending}
      onClick={() => {
        if (isPending) return;
        startTransition(() => router.push("/dashboard"));
      }}
      className={`${BUTTON_CLASS} hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-2`}
    >
      <Avatar className="h-5 w-5">
        <AvatarImage src={user.user_metadata?.avatar_url} alt={displayName} />
        <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className="truncate max-w-[100px]">{displayName}</span>
      <LayoutDashboard className="ml-1 h-4 w-4 text-muted-foreground" />
    </Button>
  );
}
