import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";

const geist = localFont({ src: "../../public/fonts/geist-latin.woff2", variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "EventHub | Event operations, connected",
  description: "Plan events, welcome attendees, and keep every detail in view with EventHub.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("h-full antialiased", "font-sans", geist.variable)}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
