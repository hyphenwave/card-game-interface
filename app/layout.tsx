import '@/lib/polyfills'
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import '@rainbow-me/rainbowkit/styles.css'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Whot',
  description: 'A fully on-chain implementation of the classic Whot card game, powered by Zama FHE.',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body className={`font-sans antialiased`}>
        <Providers>
          {children}
          <Analytics />
        </Providers>
      </body>
    </html>
  )
}
