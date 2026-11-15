import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '3Nayan',
  description: 'Healers, astrologers and psychics helping you through life’s hurdles.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
