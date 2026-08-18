import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TimezoneSync } from "@/components/timezone-sync";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// The "calm premium" display voice: serif for headings and hero numbers only.
const fraunces = Fraunces({ variable: "--font-display", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://groceryshopping.coach"),
  title: "Prep Coach",
  description: "Plan the week, bank the calories, shop once.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <TimezoneSync />
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
