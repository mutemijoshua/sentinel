import './globals.css';

export const metadata = {
  title: 'Sentinel Hub',
  description: 'Uptime and security status of all my websites',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
