import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://reelbag.vercel.app"),
  title: "Reelbag — Your personal vault for video remakes & inspiration",
  description:
    "A quiet home for your Instagram Reels. Save links, organize folders, and keep your favorites close.",
  applicationName: "Reelbag",
  manifest: "/manifest.json",
  // Explicit links complement Next.js file metadata and the conventional paths.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Reelbag",
    statusBarStyle: "black",
  },
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0f17",
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
