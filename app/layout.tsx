import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Capella Housekeeper",
  description: "Monitoring dashboard for running Couchbase Capella clusters",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
