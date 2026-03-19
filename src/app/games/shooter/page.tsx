import { Metadata } from "next";
import ShooterGame from "./ShooterGame";

export const metadata: Metadata = {
  title: "Target Shooter - Minigame App",
  description: "Race to shoot targets before your opponent!",
};

export default function ShooterPage() {
  return <ShooterGame />;
}
