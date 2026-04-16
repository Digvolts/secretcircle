import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SecretCircle',
  description: 'Drop your secrets anonymously',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-full">{children}</body>
    </html>
  );
}