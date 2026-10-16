import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.vercel.reelbag.native",
  appName: "Reelbag",
  webDir: "public",
  server: {
    url: "https://reelbag.vercel.app",
    cleartext: true,
  },
};

export default config;
