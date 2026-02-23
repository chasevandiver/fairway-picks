import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Fairway Picks · PGA Tour Pick\'em',
  description: 'Golf pick\'em league tracker with live scores',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
