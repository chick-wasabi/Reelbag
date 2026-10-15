import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://reelbag.vercel.app"),
  title: "Reelbag — Your reels, simply saved.",
  description:
    "A quiet home for your Instagram Reels. Save links, organize folders, and keep your favorites close.",
  applicationName: "Reelbag",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0c10",
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
