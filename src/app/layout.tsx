import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { WhatsAppButton } from "@/components/whatsapp-button";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-saans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-saans-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sentiment Analyzer — call intelligence",
  description:
    "Upload a call transcript and read back overall sentiment, sentence-level sentiment, emotions and call-centre KPIs.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

/**
 * Sets data-theme before first paint so there is no flash, and so the CSS only
 * ever has to look at one attribute.
 */
const THEME_BOOTSTRAP = `(function(){try{var s=localStorage.getItem("sa-theme");var m=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=(s==="light"||s==="dark")?s:(m?"dark":"light")}catch(e){document.documentElement.dataset.theme="light"}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${jetbrains.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-dvh antialiased" suppressHydrationWarning>
        {children}
        <WhatsAppButton />
      </body>
    </html>
  );
}
