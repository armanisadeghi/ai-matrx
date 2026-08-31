import Image from "next/image";

interface ShellUserAvatarImageProps {
  src: string;
  alt: string;
  sizes: string;
}

/**
 * The single image path for user avatars mounted in the always-present shell.
 *
 * The trigger and its mounted profile panel can point at the same resource.
 * If either copy is lazy, Next can attribute an above-the-fold LCP to that lazy
 * instance and emit a warning even when the trigger copy is eager.
 */
export function ShellUserAvatarImage({
  src,
  alt,
  sizes,
}: ShellUserAvatarImageProps) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover"
      sizes={sizes}
      unoptimized
      preload
      loading="eager"
      fetchPriority="high"
    />
  );
}
