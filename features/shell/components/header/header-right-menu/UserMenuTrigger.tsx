import Image from "next/image";
import { User } from "lucide-react";
import { UserData } from "@/utils/userDataMapper";

interface UserMenuTriggerProps {
  userData: UserData;
}

export default function UserMenuTrigger({ userData }: UserMenuTriggerProps) {
  return (
    <label
      htmlFor="shell-user-menu"
      aria-label="User menu"
      className="flex h-11 w-11 items-center justify-center bg-transparent transition-transform active:scale-95 cursor-pointer outline-none"
    >
      <div className="relative flex h-8 w-8 items-center justify-center rounded-full matrx-glass-thin-border transition-colors overflow-hidden">
        {userData?.userMetadata?.avatarUrl ? (
          <Image
            src={userData?.userMetadata.avatarUrl}
            alt={userData?.userMetadata.name || "User"}
            fill
            className="object-cover"
            sizes="32px"
            loading="eager"
            priority
          />
        ) : userData?.userMetadata.name ? (
          <span className="text-xs font-semibold text-foreground leading-none">
            {userData?.userMetadata.name.charAt(0).toUpperCase()}
          </span>
        ) : (
          <User
            className="h-4 w-4 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
      </div>
    </label>
  );
}
