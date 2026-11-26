import type { Metadata } from "next";
import { InfoPage } from "@/features/site/pages";

export const metadata: Metadata = { title: "Términos y condiciones", alternates: { canonical: "/terminos" } };

export default function Page() {
  return <InfoPage settingKey="page.terms" />;
}
