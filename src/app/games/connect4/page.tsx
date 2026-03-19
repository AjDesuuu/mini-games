import { Metadata } from "next";
import Connect4Game from "./Connect4Game";

export const metadata: Metadata = {
  title: "Connect 4 - Minigame App",
  description: "Play Connect 4 with a friend!",
};

export default function Connect4Page() {
  return <Connect4Game />;
}
