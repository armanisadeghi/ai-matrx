import { PostDetailPage } from "@/features/marketing/social/components/PostDetail";

export default async function BrandSocialPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return <PostDetailPage postId={postId} />;
}
