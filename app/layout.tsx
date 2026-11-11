import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Кремнёвый нож из Ботая",
  description: "Трёхмерный фильм о кремнёвом ноже из поселения Ботай для экрана Северо-Казахстанского музея.",
};

export const viewport: Viewport = { themeColor: "#0d0b09" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
