import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "ShelfCheck — will it work for your skin?",
  description:
    "Scan your skin once with YouCam AI, then snap any product's ingredient list to see if it fits what your skin actually needs.",
};

export const viewport: Viewport = {
  themeColor: "#0f5c4d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${instrument.variable} antialiased`}>{children}</body>
    </html>
  );
}
