// /education/flashcards-2 — the retired action-bar concept. Its ideas landed
// on /education/flashcards (Create deck → one creation page); the route
// forwards there.
import { redirect } from "next/navigation";

export default function FlashcardsConceptRedirect() {
  redirect("/education/flashcards");
}
