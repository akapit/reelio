import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { CookieConsent } from "@/components/legal/CookieConsent";
import { dirForLocale } from "@/lib/i18n/config";
import { getRequestLocale } from "@/lib/i18n/server";

const heebo = Heebo({
  subsets: ["latin", "hebrew"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: "reelio — Real estate reels, composed.",
  description:
    "Turn property photos into cinematic video. AI-assisted motion, intelligently guided.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <RootLayoutInner>{children}</RootLayoutInner>;
}

async function RootLayoutInner({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const dir = dirForLocale(locale);

  return (
    <html lang={locale} dir={dir} className={heebo.variable}>
      <body className="min-h-screen antialiased font-heebo">
        <Providers initialLocale={locale}>
          {children}
          <CookieConsent />
        </Providers>
      </body>
    </html>
  );
}
