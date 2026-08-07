const CAPTURE_ATTR = "data-gpt-md-capture";
const READY_ATTR = "data-gpt-md-bridge-ready";
const MESSAGE_SOURCE = "gpt-markdown-clipboard-bridge";

type BridgeWindow = Window & {
  __gptMarkdownClipboardBridge?: boolean;
};

function stringifyProp(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) {
    return val.map((item) => stringifyProp(item)).filter(Boolean).join("");
  }
  if (typeof val === "object") {
    try {
      if (typeof val.props?.children === "string") return val.props.children;
      if (Array.isArray(val.props?.children)) return val.props.children.map((item) => stringifyProp(item)).filter(Boolean).join("");
      if (typeof val.math === "string") return val.math;
      if (typeof val.tex === "string") return val.tex;
      if (typeof val.value === "string") return val.value;
    } catch {
      return "";
    }
  }
  return "";
}

function looksLikeLatexText(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const s = text.trim();
  if (s.length === 0) return false;
  return /[\\^_{}=+\-*/<>]/.test(s) || /[a-zA-Z]{2,}/.test(s);
}

function extractLatexFromReactFiber(element: Element | null): { latex: string; isDisplay: boolean } | null {
  if (!element || !(element instanceof Element)) return null;
  let curr: Element | null = element;
  while (curr) {
    const keys = Object.keys(curr).filter((k) => typeof k === "string" && (k.startsWith("__reactFiber$") || k.startsWith("__reactProps$")));
    for (const key of keys) {
      const fiberObj = (curr as any)[key];
      if (!fiberObj || typeof fiberObj !== "object" || "nodeType" in fiberObj) continue;

      let fiber = fiberObj;
      for (let depth = 0; depth < 20 && fiber; depth++) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (props && typeof props === "object" && !("nodeType" in props)) {
          const isDisplay = !!props.displayMode || !!props.isDisplay || !!props.block || props.display === true;
          const candidates = [
            props.math,
            props.tex,
            props.latex,
            props.formula,
            props.value,
            props.children,
            props.code,
            props.content,
          ];

          for (const cand of candidates) {
            const str = stringifyProp(cand);
            if (typeof str === "string" && str.trim().length > 0 && looksLikeLatexText(str)) {
              return { latex: str.trim(), isDisplay };
            }
          }
        }
        fiber = fiber.return;
      }
    }
    curr = curr.parentElement;
  }
  return null;
}

function scanAndAnnotateMathElements(root: ParentNode = document): void {
  const mathEls = root.querySelectorAll(
    ".katex, .katex-display, .math-display, .math-inline, .math-block, [data-math], mjx-container, math, div.math"
  );

  mathEls.forEach((el) => {
    const extracted = extractLatexFromReactFiber(el);
    if (extracted) {
      el.setAttribute("data-gpt-md-tex", extracted.latex);
      el.setAttribute("data-gpt-md-display", extracted.isDisplay ? "true" : "false");

      // 同时将属性传播挂载到它的最外层 KaTeX/Math 块级父容器上
      const wrapper = el.closest(".katex-display, .math-display, .math-block, div.math");
      if (wrapper && wrapper !== el) {
        wrapper.setAttribute("data-gpt-md-tex", extracted.latex);
        wrapper.setAttribute("data-gpt-md-display", "true");
      }
    }
  });
}

// 捕获 MAIN world 中的点击事件与悬浮事件，自动把 React Fiber 里的 TeX 提取到 DOM 属性中
document.addEventListener(
  "click",
  (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const reply = target.closest("section, article, [data-is-streaming]");
    if (reply) scanAndAnnotateMathElements(reply);

    const mathEl = target.closest(".katex, .math-display, .math-inline, .math-block, [data-math], mjx-container, math");
    if (!mathEl) return;

    const extracted = extractLatexFromReactFiber(mathEl);
    if (extracted) {
      mathEl.setAttribute("data-gpt-md-tex", extracted.latex);
      mathEl.setAttribute("data-gpt-md-display", extracted.isDisplay ? "true" : "false");
    }
  },
  true
);

// 定时扫描页面，为新增的回复与公式挂载 data-gpt-md-tex 属性
window.setInterval(() => {
  scanAndAnnotateMathElements(document);
}, 1000);

const pageWindow = window as BridgeWindow;
if (!pageWindow.__gptMarkdownClipboardBridge) {
  pageWindow.__gptMarkdownClipboardBridge = true;
  document.documentElement.setAttribute(READY_ATTR, "true");
  window.postMessage(
    { source: MESSAGE_SOURCE, type: "GPT_MD_BRIDGE_READY" },
    window.location.origin
  );

  // ── 自动格式规范化逻辑 ──────────────────────────────────────────────
  function isEscaped(text: string, index: number): boolean {
    let slashCount = 0;
    for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) slashCount++;
    return slashCount % 2 === 1;
  }

  function findUnescaped(text: string, delimiter: string, from: number): number {
    let index = text.indexOf(delimiter, from);
    while (index !== -1 && isEscaped(text, index)) {
      index = text.indexOf(delimiter, index + delimiter.length);
    }
    return index;
  }

  function cleanOuterParens(latex: string): string {
    let s = latex.trim();
    while (s.startsWith("(") && s.endsWith(")") && s.length > 2) {
      let depth = 0;
      let isOuter = true;
      for (let i = 0; i < s.length - 1; i++) {
        if (s[i] === "(") depth++;
        else if (s[i] === ")") depth--;
        if (depth === 0) { isOuter = false; break; }
      }
      if (isOuter) s = s.slice(1, -1).trim();
      else break;
    }
    return s;
  }

  function cleanLatexBody(raw: string): string {
    let s = raw.trim();
    // 清理 ChatGPT / HTML DOM 误产生的 markdown 标题分隔符线 (=== / ---)
    s = s.replace(/\n\s*={3,}\s*\n/g, " = ")
         .replace(/={3,}/g, "=")
         .replace(/\n\s*-{3,}\s*\n/g, " - ")
         .replace(/-{3,}/g, "-");
    // 将多行硬换行压缩为空格，实现单行紧凑输出
    s = s.replace(/\s*\n\s*/g, " ").trim();
    return s;
  }

  function normalizeText(markdown: string): string {
    if (typeof markdown !== "string" || !markdown.trim()) return markdown;

    let result = "";
    let index = 0;
    while (index < markdown.length) {
      if (markdown.startsWith("```", index)) {
        const lineEnd = markdown.indexOf("\n", index);
        const fenceEnd = markdown.indexOf("```", lineEnd === -1 ? markdown.length : lineEnd + 1);
        const endPos = fenceEnd === -1 ? markdown.length : fenceEnd + 3;
        result += markdown.slice(index, endPos);
        index = endPos;
        continue;
      }

      if (markdown.startsWith("$$", index)) {
        const end = findUnescaped(markdown, "$$", index + 2);
        if (end !== -1) {
          const body = cleanLatexBody(markdown.slice(index + 2, end));
          result += `$$${body}$$`;
          index = end + 2;
          continue;
        }
      }

      if (markdown[index] === "$" && !isEscaped(markdown, index)) {
        const end = findUnescaped(markdown, "$", index + 1);
        if (end !== -1 && markdown[end + 1] !== "$") {
          const body = cleanLatexBody(markdown.slice(index + 1, end));
          result += `$${body}$`;
          index = end + 1;
          continue;
        }
      }

      if (markdown.startsWith("\\[", index)) {
        const end = findUnescaped(markdown, "\\]", index + 2);
        if (end !== -1) {
          const body = cleanLatexBody(markdown.slice(index + 2, end));
          result += `$$${body}$$`;
          index = end + 2;
          continue;
        }
      }

      if (markdown.startsWith("\\(", index)) {
        const end = findUnescaped(markdown, "\\)", index + 2);
        if (end !== -1) {
          const body = cleanLatexBody(cleanOuterParens(markdown.slice(index + 2, end)));
          result += `$${body}$`;
          index = end + 2;
          continue;
        }
      }

      if (markdown[index] === "[" && (markdown[index + 1] === "\n" || markdown.slice(index, index + 20).includes("\n"))) {
        const end = findUnescaped(markdown, "]", index + 1);
        if (end !== -1) {
          const body = markdown.slice(index + 1, end).trim();
          if (body.includes("\n") || /[\\^_{}=+\-*/<>]/.test(body)) {
            const cleanBody = cleanLatexBody(body);
            result += `$$${cleanBody}$$`;
            index = end + 1;
            continue;
          }
        }
      }

      if (
        markdown[index] === "(" &&
        !isEscaped(markdown, index) &&
        !markdown.slice(Math.max(0, index - 5), index).endsWith("\\left")
      ) {
        let depth = 0;
        let end = -1;
        for (let i = index; i < markdown.length; i++) {
          if (isEscaped(markdown, i)) continue;
          if (markdown[i] === "(") depth++;
          if (markdown[i] === ")" && --depth === 0) { end = i; break; }
        }
        if (end !== -1) {
          const body = markdown.slice(index + 1, end).trim();
          const clean = cleanOuterParens(body);
          if (clean && /[\\^_{}=+\-*/<>≤≥±,]/u.test(clean) && !/^\d+(?:[.,]\d+)?$/.test(clean)) {
            const cleanBody = cleanLatexBody(clean);
            result += `$${cleanBody}$`;
            index = end + 1;
            continue;
          }
        }
      }

      result += markdown[index];
      index++;
    }

    return result.replace(/\n{3,}/g, "\n\n").trim();
  }

  function publish(text: string): void {
    const requestId = document.documentElement.getAttribute(CAPTURE_ATTR);
    if (!requestId) return;

    document.documentElement.removeAttribute(CAPTURE_ATTR);
    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: "GPT_MD_NATIVE_COPY_RESULT",
        requestId,
        text: normalizeText(text),
      },
      window.location.origin
    );
  }

  // Intercept DataTransfer.prototype.setData (for document.execCommand("copy"))
  try {
    const dataTransferPrototype = DataTransfer.prototype;
    const originalSetData = dataTransferPrototype.setData;
    if (!(originalSetData as any).__gptMdPatched) {
      const wrappedSetData = function (format: string, data: string): void {
        if (format.toLowerCase() === "text/plain") {
          const normalized = normalizeText(data);
          publish(normalized);
          originalSetData.call(this, format, normalized);
          return;
        }
        originalSetData.call(this, format, data);
      };
      (wrappedSetData as any).__gptMdPatched = true;
      dataTransferPrototype.setData = wrappedSetData;
    }
  } catch {
    // Fallback
  }

  const clipboard = navigator.clipboard;
  if (clipboard) {
    const targets = [clipboard, Object.getPrototypeOf(clipboard)].filter(Boolean);
    for (const target of targets) {
      if (typeof target.writeText === "function" && !(target.writeText as any).__gptMdPatched) {
        const origWT = target.writeText;
        const wrappedWT = function (text: string): Promise<void> {
          const normalized = normalizeText(text);
          publish(normalized);
          return origWT.call(this, normalized);
        };
        (wrappedWT as any).__gptMdPatched = true;
        target.writeText = wrappedWT;
      }

      if (typeof target.write === "function" && !(target.write as any).__gptMdPatched) {
        const origW = target.write;
        const wrappedW = async function (items: ClipboardItem[]): Promise<void> {
          try {
            const newItems: ClipboardItem[] = [];
            let lastNorm = "";
            for (const item of items) {
              if (item.types && item.types.includes("text/plain")) {
                const blob = await item.getType("text/plain");
                const raw = await blob.text();
                const normalized = normalizeText(raw);
                lastNorm = normalized;
                const record: Record<string, Blob> = {
                  "text/plain": new Blob([normalized], { type: "text/plain" }),
                };
                for (const type of item.types) {
                  if (type !== "text/plain") {
                    try { record[type] = await item.getType(type); } catch {}
                  }
                }
                newItems.push(new ClipboardItem(record));
              } else {
                newItems.push(item);
              }
            }
            if (lastNorm) publish(lastNorm);
            return origW.call(this, newItems);
          } catch {
            return origW.call(this, items);
          }
        };
        (wrappedW as any).__gptMdPatched = true;
        target.write = wrappedW;
      }
    }
  }
}
