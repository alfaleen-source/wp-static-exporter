import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title:"WP Static Exporter", description:"Internal WordPress landing-page static export utility.", robots:{ index:false, follow:false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
