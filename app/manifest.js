export default function manifest() {
  return {
    id: "/",
    name: "Reelbag",
    short_name: "Reelbag",
    description: "Your personal vault for video remakes & inspiration",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0c0d0f",
    theme_color: "#b5f36d",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
