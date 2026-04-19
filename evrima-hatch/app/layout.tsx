import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EVRIHATCH • The Isle',
  description: 'Raise your dinosaur',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}