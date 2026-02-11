import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    root: "client",
    base: "/assets",
    build: {
        target: "esnext",
        outDir: "../dist/client",
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {
            output: {
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js",
                assetFileNames: "[name].[ext]",
                sourcemapFileNames: "[name].js.map",
            },
        }
    }
});