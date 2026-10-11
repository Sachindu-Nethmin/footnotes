import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (see src/fonts/README.md): no font CDN, and the notebook still looks right offline.
const caveat = localFont({ src: "../fonts/Caveat-Variable.woff2", weight: "400 700", variable: "--font-hand", display: "swap" });
const patrick = localFont({ src: "../fonts/PatrickHand-Regular.woff2", weight: "400", variable: "--font-note", display: "swap" });
const typewriter = localFont({ src: "../fonts/SpecialElite-Regular.woff2", weight: "400", variable: "--font-type", display: "swap" });

export const metadata: Metadata = {
  title: "Footnotes — a bucket list notebook",
  description:
    "A paper-notebook bucket list. Finds beautiful places near you from open data, picks where to go next, and turns what you tell it into diary pages. The writing is done by Gemma on your own device.",
  applicationName: "Footnotes",
  icons: [{ rel: "icon", url: "/icon.svg", type: "image/svg+xml" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3b2f27",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${caveat.variable} ${patrick.variable} ${typewriter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
