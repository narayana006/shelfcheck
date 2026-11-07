import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ShelfCheck — skincare that knows your skin",
  description:
    "An AI shopping agent that scans your skin, buys only products your skin can use, stays on budget, and checks out with PayPal. You approve every dollar.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#161411" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Runs before first paint: returning visitors (who have a saved scan) skip the landing page,
// so they never see it flash before the app loads.
const PRE_PAINT = `try{if(localStorage.getItem('shelfcheck.scans')&&localStorage.getItem('shelfcheck.scans')!=='[]')document.documentElement.dataset.app='1'}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT }} />
        <link rel="preconnect" href="https://www.paypal.com" />
        <link rel="preconnect" href="https://www.sandbox.paypal.com" />
        <link rel="preconnect" href="https://images.openbeautyfacts.org" />
      </head>
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
