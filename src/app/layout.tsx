import type { Metadata } from "next";
import { Assistant, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Brand-aligned fonts. Inter is the display family (calm, geometric, premium —
// per brand "clean geometric sans"); Assistant is the body family because it
// covers Hebrew cleanly without changing vertical metrics when switching
// scripts mid-sentence (project names in this app are bilingual).
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});

const assistant = Assistant({
  subsets: ["latin", "hebrew"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Reelio | Premium Video, In Motion",
  description:
    "Turn property photos into cinematic video. AI-assisted motion, intelligently guided.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${inter.variable} ${assistant.variable}`}>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
