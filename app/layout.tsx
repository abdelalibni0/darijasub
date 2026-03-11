import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DarijaSub - Subtitle Generator for Darija Content",
  description:
    "AI-powered subtitle generation for Moroccan and Algerian Darija content creators. Transcribe, translate, and export professional subtitles in seconds.",
  keywords: "Darija, subtitles, Morocco, Algeria, content creator, AI, transcription",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
