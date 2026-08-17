import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentiment Analyzer — call intelligence",
  description:
    "Upload a call transcript and read back overall sentiment, sentence-level sentiment, emotions and call-centre KPIs.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <link
          rel="icon"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232a78d6'/%3E%3Cpath d='M7 21l5-7 4 4 4-8 5 6' stroke='white' stroke-width='2.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
        />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
