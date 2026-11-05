import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ice Bank", template: "%s | Ice Bank" },
  description: "Ice Bank is a fictional Canadian bank built for practising software testing.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}
