import type { Metadata } from "next";
import { InfoPage } from "@/features/site/pages";

export const metadata: Metadata = { title: "Política de privacidad", alternates: { canonical: "/privacidad" } };

export default function Page() {
  return <InfoPage settingKey="page.privacy" />;
}
