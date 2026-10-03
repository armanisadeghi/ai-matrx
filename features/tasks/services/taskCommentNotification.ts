// Every cmt_add call crosses the associations host tap. The saved comment ID,
// never browser-supplied text or owner details, is the email route's input.

/** Ask the route to email the owner of a saved task comment. */
export async function sendTaskCommentNotification(commentId: string): Promise<void> {
  try {
    const response = await fetch("/api/notifications/comment-added", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId }),
    });
    if (!response.ok) {
      console.error("Failed to send comment notification:", response.status);
    }
  } catch (error) {
    console.error("Failed to send comment notification:", error);
  }
}
