import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";
import { renameSync, existsSync } from "fs";

/**
 * 构建完成后把 dist/style.css 重命名为 dist/content.css，
 * 与 manifest.json 中的 css 字段保持一致。
 */
function renameCssPlugin(): Plugin {
  return {
    name: "rename-css",
    closeBundle() {
      const from = resolve(__dirname, "dist/style.css");
      const to = resolve(__dirname, "dist/content.css");
      if (existsSync(from)) {
        renameSync(from, to);
      }
    },
  };
}

export default defineConfig({
  plugins: [renameCssPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content/index.ts"),
      },
      output: {
        // 确保输出文件名与 manifest.json 中保持一致
        entryFileNames: "[name].js",
        assetFileNames: "[name][extname]",
        // 不拆分 chunk，content script 必须是单一文件
        manualChunks: undefined,
      },
    },
    sourcemap: false,
    cssCodeSplit: false,
  },
  // 测试配置
  test: {
    environment: "jsdom",
  },
  // public/ 中的文件（包括 manifest.json）直接复制到 dist/
  publicDir: "public",
});
