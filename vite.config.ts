import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";

function generateManifest() {
  const manifestPath =
    process.env.TARGET === "firefox"
      ? path.resolve(__dirname, "src/manifest.firefox.json")
      : path.resolve(__dirname, "src/manifest.chrome.json");

  const manifest = readJsonFile(manifestPath);
  const pkg = readJsonFile("package.json");

  return {
    name: pkg.name,
    description: pkg.description,
    version: pkg.version,
    ...manifest,
  };
}

export default defineConfig({
  plugins: [
    webExtension({
      browser: process.env.TARGET || "chrome",
      manifest: generateManifest,
      watchFilePaths: ["package.json", "src/manifest.chrome.json", "src/manifest.firefox.json"],
    }),
    {
      name: "copy-icons",
      generateBundle() {
        const target = process.env.TARGET || "chrome";
        const outDir = `dist/${target}`;

        try {
          mkdirSync(`${outDir}/icons`, { recursive: true });
          copyFileSync("src/icons/icon-16.png", `${outDir}/icons/icon-16.png`);
          copyFileSync("src/icons/icon-48.png", `${outDir}/icons/icon-48.png`);
          copyFileSync("src/icons/icon-128.png", `${outDir}/icons/icon-128.png`);
        } catch (error) {
          console.warn("Could not copy icons:", error);
        }
      },
    },
  ],
  build: {
    outDir: `dist/${process.env.TARGET || "chrome"}`,
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
});
