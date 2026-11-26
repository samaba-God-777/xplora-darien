import type { Metadata } from "next";
import { InfoPage } from "@/features/site/pages";

export const metadata: Metadata = { title: "Cancelaciones", alternates: { canonical: "/cancelaciones" } };

export default function Page() {
  return <InfoPage settingKey="page.cancellation" />;
}
