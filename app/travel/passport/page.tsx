import type { Metadata } from "next";
import { PassportObject } from "@/components/isaiahbjork/travel/passport-object";

export const metadata: Metadata = {
  title: "Passport Object | Björk UI",
  description: "A travel-passport interaction study for the immersive portfolio route.",
};

export default function PassportObjectPage() {
  return <PassportObject />;
}
