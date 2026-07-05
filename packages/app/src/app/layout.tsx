import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono, Libre_Caslon_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const caslon = Libre_Caslon_Display({
  variable: "--font-caslon",
  weight: "400",
  subsets: ["latin"],
});

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Signet — Prove you were paid. Never show how much.",
  description:
    "Confidential distributions with a portable proof-of-receipt: prove facts about your payment — at least $X, from a verified fund — without ever revealing the amount.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${caslon.variable} ${hanken.variable} ${plexMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
