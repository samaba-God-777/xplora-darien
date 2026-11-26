import type { Metadata } from "next";
import { InfoPage } from "@/features/site/pages";

export const metadata: Metadata = { title: "Quiénes somos", alternates: { canonical: "/nosotros" } };

export default function Page() {
  return <InfoPage settingKey="page.about" />;
}
