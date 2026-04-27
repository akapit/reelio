import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

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
  return (
    <html lang="en" dir="ltr" className={heebo.variable}>
      <body className="min-h-screen antialiased font-heebo">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
