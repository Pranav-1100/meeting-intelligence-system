import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import { ToastProvider } from '@/components/ui/toast-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Meeting Intelligence | AI-Powered Meeting Analysis',
  description: 'Transform your meetings with AI-powered transcription, speaker diarization, and automated action item extraction.',
  keywords: 'meeting intelligence, AI transcription, meeting analysis, action items, collaboration',
  authors: [{ name: 'Meeting Intelligence Team' }],
  themeColor: '#3b82f6',
  viewport: 'width=device-width, initial-scale=1',
  robots: 'index, follow',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="light">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        
        {/* Favicons */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
        
        {/* Open Graph */}
        <meta property="og:title" content="Meeting Intelligence | AI-Powered Meeting Analysis" />
        <meta property="og:description" content="Transform your meetings with AI-powered transcription, speaker diarization, and automated action item extraction." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/og-image.png" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Meeting Intelligence" />
        <meta name="twitter:description" content="AI-Powered Meeting Analysis Platform" />
        <meta name="twitter:image" content="/twitter-image.png" />
        
        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body className={`${inter.className} bg-gray-50 text-gray-900 antialiased`}>
        <AuthProvider>
          <ToastProvider>
            <div className="min-h-screen flex flex-col">
              {children}
            </div>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}