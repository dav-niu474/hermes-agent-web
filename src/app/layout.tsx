import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/hermes/theme-provider";
import { AppShell } from "@/components/hermes/app-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hermes Agent Web",
  description:
    "Premium web platform for Hermes AI Agent — manage tools, skills, sessions, and more.",
  keywords: [
    "Hermes",
    "AI Agent",
    "Tools",
    "Skills",
    "Automation",
    "Next.js",
  ],
  authors: [{ name: "Hermes Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Hermes Agent Web",
    description: "Premium web platform for Hermes AI Agent",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hermes Agent Web",
    description: "Premium web platform for Hermes AI Agent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
