import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { playServer } from "./play-server";

export default defineConfig({
  plugins: [react(), playServer()],
  test: { include: ["test/**/*.test.ts"] },
} as never);
