import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProtocol || (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const socialImage = `${origin}/og.jpg`;

  return {
    title: "Sleep Light Study | 睡眠光照研究",
    description:
      "A bilingual overnight study comparing four pre-sleep light conditions with a normal-sleep control.",
    openGraph: {
      title: "Sleep Light Study | 睡眠光照研究",
      description: "Bilingual overnight pre-sleep light, sleepiness, device, and reaction-time research protocol.",
      type: "website",
      images: [{ url: socialImage, width: 1729, height: 910, alt: "Sleep Light Study — 睡眠光照研究" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Sleep Light Study | 睡眠光照研究",
      description: "Bilingual overnight pre-sleep light, sleepiness, device, and reaction-time research protocol.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
