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

  function preSanitizeChatGPTText(text: string): string {
    if (typeof text !== "string" || !text.trim()) return text;
    let s = text;

    // 1. 修复脱落的伪 $$ 头部 (如 $$k\tau\gg1; ] * reheating -> $k\tau\gg1$ * reheating)
    s = s.replace(/(^|\s)\$\$\s*([a-zA-Z0-9_\\\^\-+=\(\)\s<>≤≥±,]{2,40})\s*(?:;\s*\]|;|\])\s*(?=\*|\#|[\u4e00-\u9fa5])/g, (_m, p1, p2) => {
      return `${p1}$${p2.trim()}$ `;
    });

    // 2. 修复孤立脱落的 [ \boxed{ ... } ] 块或 [ $$...$$ ] 块 -> $$\boxed{ ... }$$
    s = s.replace(/(?:^|\n)\s*\[\s*\n+\s*(\$\$)/g, "\n\n$1");
    s = s.replace(/(\$\$)\s*\n+\s*\]\s*(?:\n|$)/g, "$1\n\n");
    s = s.replace(/(?:^|\n)\s*\[\s*(\$\$\s*\\boxed\{[\s\S]*?\}\s*\$\$)\s*(?:\]|\$\$)?/g, "\n\n$1\n\n");

    // 3. 修复脱落的花括号完整 \boxed{...} 块 (支持任意多层 \text{} 嵌套)
    let boxedIdx = 0;
    while ((boxedIdx = s.indexOf("\\boxed{", boxedIdx)) !== -1) {
      if (isEscaped(s, boxedIdx)) { boxedIdx += 7; continue; }
      let depth = 0;
      let end = -1;
      for (let i = boxedIdx + 6; i < s.length; i++) {
        if (isEscaped(s, i)) continue;
        if (s[i] === "{") depth++;
        else if (s[i] === "}" && --depth === 0) { end = i; break; }
      }
      if (end !== -1) {
        const prefix = s.slice(Math.max(0, boxedIdx - 10), boxedIdx);
        const isDetached = /\[\s*$/.test(prefix);
        if (isDetached) {
          const pStart = boxedIdx - (prefix.length - prefix.lastIndexOf("["));
          const fullBoxed = s.slice(boxedIdx, end + 1);
          let replaceEnd = end + 1;
          while (replaceEnd < s.length && (s[replaceEnd] === "]" || s[replaceEnd] === "$" || s[replaceEnd] === "\n" || s[replaceEnd] === " ")) {
            replaceEnd++;
          }
          s = s.slice(0, pStart) + `\n\n$$${fullBoxed}$$\n\n` + s.slice(replaceEnd);
          boxedIdx = pStart + fullBoxed.length + 8;
          continue;
        }
      }
      boxedIdx += 7;
    }

    // 4. 收缩紧贴已闭合公式的多余 $$ 符号 (如 $$\boxed{...}$$$$ -> $$\boxed{...}$$)
    s = s.replace(/(\$\$[\s\S]*?\$\$)\s*\$\$/g, "$1");
    s = s.replace(/\$\$\s*(\$\$[\s\S]*?\$\$)/g, "$1");

    // 5. 收缩 3 个及以上连续的 $$$$ -> $$
    s = s.replace(/\${3,}/g, "$$");

    // 6. 修复脱落的 [ \delta\text{-function} ] -> $\delta\text{-function}$
    s = s.replace(/(?<!\\)\[\s*(\\?[a-zA-Z0-9_\-\{\}]*\\(?:text|mathrm)[^\]]*)\s*\]/g, (match, inner) => {
      if (!inner.includes("\n")) {
        return `$${inner.trim()}$`;
      }
      return match;
    });

    // 7. 修复脱落的 (w\simeq1) 独立条件等式 -> $w\simeq1$
    s = s.replace(/(?<!\\[a-zA-Z]+)\(\s*([a-zA-Z0-9_\\\^\-+=\s<>≤≥±]*\\[a-zA-Z]+[a-zA-Z0-9_\\\^\-+=\s<>≤≥±]*=[a-zA-Z0-9_\\\^\-+=\s<>≤≥±]*)\s*\)/g, (match, inner) => {
      if (!/^\d+(?:[.,]\d+)?$/.test(inner.trim())) {
        return `$${inner.trim()}$`;
      }
      return match;
    });

    // 8. 再次收缩紧贴闭合公式的多余 $$ 符号
    s = s.replace(/(\$\$[\s\S]*?\$\$)\s*\$\$/g, "$1");
    s = s.replace(/\$\$\s*(\$\$[\s\S]*?\$\$)/g, "$1");
    s = s.replace(/\${3,}/g, "$$");

    return s;
  }

  function repairLatexMultiLineEnvironments(latex: string): string {
    if (typeof latex !== "string" || !latex.includes("\\begin{")) return latex;
    const envRegex = /\\begin\{(array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|rcases|dcases|align|aligned|align\*|split|gather|gathered|gather\*|eqnarray|eqnarray\*)\}([\s\S]*?)\\end\{\1\}/g;
    return latex.replace(envRegex, (_match, envName, body) => {
      let repairedBody = body;
      repairedBody = repairedBody.replace(/(?<!\\)\\\s+(\\hline)/g, " \\\\ $1");
      repairedBody = repairedBody.replace(/([0-9a-zA-Z_\}\]\)])(?<!\\)\\\s+([0-9a-zA-Z_\{\[\\])/g, "$1 \\\\ $2");
      repairedBody = repairedBody.replace(/([^\\\s])\s*\\hline/g, "$1 \\\\ \\hline");
      return `\\begin{${envName}}${repairedBody}\\end{${envName}}`;
    });
  }

  function cleanLatexBody(raw: string): string {
    let s = raw.trim();

    // 自动修复多行数学环境 (array, matrix, cases, align) 中脱落的换行 \\
    s = repairLatexMultiLineEnvironments(s);

    // 自动修复破损的 \right$$ 与 \left$$，补全方括号闭合与上标 ^2
    s = s.replace(/\\right\$\$\s*\^2/g, "\\right]^2")
         .replace(/\\right\$\$\s*\.?\s*\n?\]?/g, "\\right].$$")
         .replace(/\\right\$\$\s*,?\s*\n?\]?/g, "\\right],$$")
         .replace(/\\right\$\$/g, "\\right]")
         .replace(/\\left\$\$/g, "\\left[");

    // 自动修复脱落反斜杠的花括号 \left{ -> \left\{ 与 \right} -> \right\}
    s = s.replace(/\\left\s*\{/g, "\\left\\{")
         .replace(/\\right\s*\}/g, "\\right\\}");

    // 剥离外层误包含的 [ 和 ]
    while (s.startsWith("[") && s.endsWith("]") && s.length > 2) {
      s = s.slice(1, -1).trim();
    }

    // 清理 ChatGPT / HTML DOM 误产生的 markdown 标题分隔符线 (=== / ---)
    s = s.replace(/\n\s*={3,}\s*\n/g, " = ")
         .replace(/={3,}/g, "=")
         .replace(/\n\s*-{3,}\s*\n/g, " - ")
         .replace(/-{3,}/g, "-");

    // 将多行硬换行压缩为空格，实现单行紧凑输出
    s = s.replace(/\s*\n\s*/g, " ").trim();
    return s;
  }

  function compactMarkdownSpaces(text: string): string {
    if (typeof text !== "string" || !text.trim()) return text;
    let s = text;
    s = s.replace(/\${3,}/g, "$$");
    s = s.replace(/\n{2,}\s*(\$\$[\s\S]*?\$\$)\s*\n{2,}/g, "\n$1\n");
    s = s.replace(/([^\n])\n{2,}\s*(\$\$[\s\S]*?\$\$)/g, "$1\n$2");
    s = s.replace(/(\$\$[\s\S]*?\$\$)\n{2,}\s*([^\n])/g, "$1\n$2");
    return s.replace(/\n{3,}/g, "\n\n").trim();
  }

  function isInvalidFormulaBody(body: string): boolean {
    // 1. 包含 Markdown 标题 (# 标题)，无论前面是空格还是换行
    if (/(?:^|\s|\n)#+\s/.test(body)) return true;

    // 2. 包含多个无反斜杠的列表符 * 或 -
    if ((body.match(/(?:^|\s|\n)[\*\-]\s/g) || []).length >= 2) return true;

    // 3. 剥离 \text{...} 与 \mathrm{...} 内部中文后，仍含有连续中文字符
    const bodyWithoutText = body.replace(/\\(?:text|mathrm|mb|rm|ka)\{[^}]*\}/g, "");
    if (/[\u4e00-\u9fa5]{3,}/u.test(bodyWithoutText)) return true;

    return false;
  }

  function normalizeText(markdownRaw: string): string {
    if (typeof markdownRaw !== "string" || !markdownRaw.trim()) return markdownRaw;
    const markdown = preSanitizeChatGPTText(markdownRaw);

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

      if (markdown.startsWith("\\boxed{", index)) {
        let depth = 0;
        let end = -1;
        for (let i = index; i < markdown.length; i++) {
          if (isEscaped(markdown, i)) continue;
          if (markdown[i] === "{") depth++;
          if (markdown[i] === "}" && --depth === 0) { end = i; break; }
        }
        if (end !== -1) {
          const body = cleanLatexBody(markdown.slice(index, end + 1));
          result += `$$${body}$$`;
          index = end + 1;
          while (index < markdown.length && (markdown[index] === "]" || markdown[index] === "\n")) {
            if (markdown[index] === "]") { index++; break; }
            index++;
          }
          continue;
        }
      }

      if (markdown.startsWith("$$", index)) {
        const end = findUnescaped(markdown, "$$", index + 2);
        if (end !== -1) {
          const candidateBody = markdown.slice(index + 2, end);
          if (isInvalidFormulaBody(candidateBody)) {
            // 如果误吞了大段正文，尝试仅提取开头的独立 Math 片段 (如 k\tau\gg1)
            const match = candidateBody.match(/^([a-zA-Z0-9_\\\^\-+=\(\)\s<>≤≥±,]{2,30})\s*(?:;|\]|[\*\-])/);
            if (match && /[\\^_{}=+\-*/<>≤≥±]/.test(match[1])) {
              const cleanSub = cleanLatexBody(match[1]);
              result += `$${cleanSub}$ `;
              index = index + 2 + match[0].length;
              continue;
            }
            // 否则仅推掉开头 $$，允许后续独立提取 \boxed{} 和其他公式
            result += "";
            index += 2;
            continue;
          }
          const body = cleanLatexBody(candidateBody);
          result += `$$${body}$$`;
          index = end + 2;
          // 吃掉 $$ 后面脱落留下的孤立右方括号 ]
          while (index < markdown.length && (markdown[index] === "]" || markdown[index] === "\n")) {
            if (markdown[index] === "]") { index++; break; }
            index++;
          }
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

      if (
        markdown[index] === "[" &&
        !markdown.slice(Math.max(0, index - 5), index).endsWith("\\left") &&
        (markdown[index + 1] === "\n" || markdown.slice(index, index + 20).includes("\n"))
      ) {
        // 优先匹配段末的 \n]，避免误匹配公式内部的 \right]
        let end = markdown.indexOf("\n]", index + 1);
        if (end === -1) {
          end = findUnescaped(markdown, "]", index + 1);
        }
        if (end !== -1) {
          const endPos = (markdown[end] === "\n" && markdown[end + 1] === "]") ? end + 2 : end + 1;
          let body = markdown.slice(index + 1, end).trim();
          if (body.startsWith("[")) body = body.slice(1).trim();
          if (body.endsWith("]")) body = body.slice(0, -1).trim();

          if (body.includes("\n") || /[\\^_{}=+\-*/<>]/.test(body)) {
            const cleanBody = cleanLatexBody(body);
            result += `$$${cleanBody}$$`;
            index = endPos;
            continue;
          }
        }
      }

      if (
        markdown[index] === "(" &&
        !isEscaped(markdown, index) &&
        !/[a-zA-Z0-9_\\]$/.test(markdown.slice(Math.max(0, index - 10), index))
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

    return compactMarkdownSpaces(result);
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
