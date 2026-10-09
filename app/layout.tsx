import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { GlobalCommandPalette } from "@/components/global-command-palette";
import { shareMetadata } from "@/lib/component-metadata";
import { homeCard, siteName, siteUrl } from "@/lib/og-cards";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  ...shareMetadata(homeCard, siteName),
  // Each page names its own canonical; the root should not hand "/" down.
  alternates: undefined,
  applicationName: siteName,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <main>{children}</main>
          <GlobalCommandPalette />
        </ThemeProvider>
      </body>
    </html>
  );
}
