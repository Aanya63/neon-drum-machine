import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEON PADS — Drum Machine",
  description:
    "A client-side drum machine built with Next.js, Tailwind CSS, and the Web Audio API.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
