// message-keyboard-nav — moving focus between messages from the keyboard
// (ArrowUp/ArrowDown/Home/End on a focused message), the way Slack and
// Gmail move between items. Pure index math; the DOM half lives in the hook.

export function nextMessageIndex(
  current: number,
  key: string,
  count: number,
): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown":
    case "j":
      return Math.min(count - 1, current + 1);
    case "ArrowUp":
    case "k":
      return Math.max(0, current - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
