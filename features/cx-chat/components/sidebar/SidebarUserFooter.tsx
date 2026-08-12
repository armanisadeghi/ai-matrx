'use client';

import Link from 'next/link';
import { useSelector } from 'react-redux';
import { selectUser, selectDisplayName, selectProfilePhoto } from '@/lib/redux/slices/userSlice';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogIn, UserPlus, ChevronRight } from 'lucide-react';
import { useLoginHref } from "@/hooks/auth/useLoginHref";

// ============================================================================
// SIDEBAR USER FOOTER
// ============================================================================

export function SidebarUserFooter() {
  const loginHref = useLoginHref();
    const user = useSelector(selectUser);
    const displayName = useSelector(selectDisplayName);
    const profilePhoto = useSelector(selectProfilePhoto);
    const isAuthenticated = !!user?.id;

    // Get initials for avatar fallback
    const initials = displayName
        ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
        : '?';

    if (!isAuthenticated) {
        return (
            <div className="flex-shrink-0 border-t border-border px-2.5 py-2.5">
                <div className="flex flex-col gap-1.5">
                    <Link
                        href="/sign-up"
                        className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                    >
                        <UserPlus className="h-3.5 w-3.5" />
                        Sign Up
                    </Link>
                    <Link
                        href={loginHref}
                        className="flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                    >
                        <LogIn className="h-3 w-3" />
                        Sign In
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-shrink-0 border-t border-border">
            <Link
                href="/settings/preferences"
                className="flex items-center gap-2.5 px-2.5 py-2.5 hover:bg-accent/40 transition-colors group"
            >
                <Avatar className="h-6 w-6 flex-shrink-0">
                    <AvatarImage src={profilePhoto || undefined} alt={displayName || 'User'} />
                    <AvatarFallback className="text-[9px] font-medium bg-gradient-to-br from-blue-600 to-violet-600 text-white">
                        {initials}
                    </AvatarFallback>
                </Avatar>
                <span className="text-xs text-foreground/80 group-hover:text-foreground truncate flex-1 transition-colors">
                    {displayName || 'Account'}
                </span>
                <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            </Link>
        </div>
    );
}

export default SidebarUserFooter;
