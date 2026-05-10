import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stipend — Escrow-gated AI research",
  description:
    "Give your AI research agent a budget, not your credit card. Funds lock in escrow; agent works; verifier gates release.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden antialiased">{children}</body>
    </html>
  );
}
