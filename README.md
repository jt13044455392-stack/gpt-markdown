# ChatGPT Math Markdown Copier

一个轻量级浏览器扩展，支持 Microsoft Edge 和 Chrome。

在 ChatGPT 页面点击数学公式，自动复制该公式的 Markdown 格式到剪贴板。

**行内公式** 复制为：

```
$E = mc^2$
```

**块级公式** 复制为：

```
$$
\int_0^1 x^2 dx = \frac{1}{3}
$$
```

---

## 安装开发依赖

需要 Node.js 18 及以上版本。

```bash
cd chatgpt-math-markdown-copier
npm install
```

---

## 本地构建

```bash
npm run build
```

构建产物输出到 `dist/` 目录：

```
dist/
  manifest.json
  content.js
  content.css
```

---

## 运行测试

```bash
npm test
```

---

## 在 Edge / Chrome 中加载

1. 打开 `edge://extensions/`（Chrome 用 `chrome://extensions/`）
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目下的 **`dist/`** 文件夹（不是项目根目录）
5. 扩展加载成功后，打开 `https://chatgpt.com` 即可使用

修改代码后重新运行 `npm run build`，然后在扩展页面点击「刷新」图标即可更新。

---

## 使用方法

1. 在 ChatGPT 中获得包含数学公式的回答
2. 将鼠标悬停在公式上，公式会出现虚线边框提示可点击
3. 点击公式，右下角出现「已复制 Markdown 公式」提示
4. 在任意支持 Markdown 数学语法的编辑器中粘贴即可（如 Obsidian、Typora、VS Code 等）

---

## 隐私说明

本插件只在本地读取页面 DOM 中已有的数学公式源码，并复制到剪贴板。不会上传、保存或分析用户对话内容。

所需权限：
- `clipboardWrite`：写入剪贴板
- `host_permissions`：仅限 `chatgpt.com` 和 `chat.openai.com`，不访问其他网站

---

## 当前限制

- 仅支持 ChatGPT（`chatgpt.com` / `chat.openai.com`），暂不支持其他 AI 平台
- 依赖页面 DOM 中已有的 LaTeX 源码（KaTeX annotation 或 data 属性），无法从纯图片或 MathML 反推 LaTeX
- 不支持批量复制整段回答中的所有公式
- 不支持 Notion、Word、MathML 等其他格式输出

---

## 项目结构

```
src/
  content/
    index.ts          # content script 入口，串联所有模块
    math-detector.ts  # 识别点击目标是否为公式，判断行内/块级
    latex-extractor.ts # 从 DOM 提取 LaTeX 源码
    markdown-wrapper.ts # 包装成 Markdown 数学格式
    toast.ts          # 右下角提示
    styles.css        # 公式 hover 样式 + toast 样式
  types/
    math.ts           # 公共类型定义
tests/                # 单元测试
public/
  manifest.json       # Manifest V3 配置
```
