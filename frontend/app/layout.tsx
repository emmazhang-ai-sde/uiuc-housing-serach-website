import type { Metadata } from "next";
import { COMPANIES } from "@/lib/companies";
import { FiltersProvider } from "@/contexts/FiltersContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import DataFreshnessBadge from "@/components/DataFreshnessBadge";
import { inter } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "UIUC Housing Assistant",
  description: `Search ${COMPANIES.map(c => c.name).join(" + ")} listings by price, beds, and location.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${inter.className} min-h-full flex flex-col`}>
        <FiltersProvider>
          <AuthModalProvider>
            {children}
            <DataFreshnessBadge />
          </AuthModalProvider>
        </FiltersProvider>
      </body>
    </html>
  );
}
