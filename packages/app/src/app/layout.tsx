import type { Metadata, Viewport } from "next";
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

const TITLE = "Signet — Prove you were paid. Never show how much.";
const DESCRIPTION =
  "Confidential token distributions on the Zama Protocol with a portable proof-of-receipt: prove facts about your payment — at least $X, from a verified fund — without ever revealing the amount.";

export const metadata: Metadata = {
  metadataBase: new URL("https://signet-app-two.vercel.app"),
  title: { default: TITLE, template: "%s · Signet" },
  description: DESCRIPTION,
  applicationName: "Signet",
  keywords: ["confidential payments", "FHE", "Zama", "ERC-7984", "TokenOps", "proof of income"],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Signet",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#E7E3D6",
  width: "device-width",
  initialScale: 1,
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
