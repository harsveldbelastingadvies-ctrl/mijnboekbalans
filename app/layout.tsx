import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BoekBalans",
  description: "Online boekhoudprogramma voor ondernemersadministraties.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
