import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Signalroom | YouTube analytics",
  description: "Monitor playlist collection runs, video performance, and milestones.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
