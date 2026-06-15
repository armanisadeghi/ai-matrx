import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/free/games/tic-tac-toe", {
  titlePrefix: "Tic Tac Toe",
  title: "Free Games",
  description: "Classic tic-tac-toe — play against a friend or the computer.",
  letter: "Tt",
});

export default function TicTacToeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
