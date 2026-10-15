import './globals.css';

export const metadata = {
  metadataBase: new URL('https://reelbag.vercel.app'),
  title: 'Reelbag — Save the inspiration. Make it happen.',
  description: 'Your personal space for Instagram Reels. Organize ideas into collections, track your progress, and take your inspiration with you.',
  applicationName: 'Reelbag',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b0c10', viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
