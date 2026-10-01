import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MangaHub - รวมบันทึกการ์ตูน & เว็บอ่าน",
  description: "บันทึกตอนล่าสุดของการ์ตูนที่คุณอ่าน พร้อมระบบผูกหลายเว็บอ่านสำรอง ซิงค์ข้าม iPhone และ PC",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MangaHub",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#090D16",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="dark">
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased font-sans bg-[#090D16] text-gray-100">
        {children}
      </body>
    </html>
  );
}
