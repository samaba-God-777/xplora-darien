"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { subscribeLocale } from "@/i18n/locale";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  // Al cambiar de idioma se vuelven a pedir los datos públicos (la API traduce con ?lang=).
  useEffect(() => subscribeLocale(() => void client.resetQueries()), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
