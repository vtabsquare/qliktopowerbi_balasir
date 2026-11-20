// Vite configuration for Qlik to Power BI Migration Engine
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: false,
  preview: {
    allowedHosts: ["qlik-to-pbi-bridge.onrender.com"],
  },
  vite: {
    preview: {
      allowedHosts: ["qlik-to-pbi-bridge.onrender.com"],
      host: "0.0.0.0",
      port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    },
  },
});
