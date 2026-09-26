import { redirect } from "next/navigation";

/** Open mode's new-battle page is the Battle root; only saved Open battles live under /open/<id>. */
export default function OpenBattleIndexRoute(): never {
  redirect("/agents/battle");
}
