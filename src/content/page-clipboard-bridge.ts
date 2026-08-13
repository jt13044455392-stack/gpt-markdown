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
  try {
    const mathEls = root.querySelectorAll(
      ".katex, .katex-display, .math-display, .math-inline, .math-block, [data-math], mjx-container, math, div.math"
    );

    mathEls.forEach((el) => {
      try {
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
      } catch {
        // 忽略单节点提取异常
      }
    });
  } catch {
    // 忽略
  }
}

// 仅在主聊天区内的公式点击或鼠标经过时被动提取，绝不拦截侧边栏与导航事件
function handleMathTargetExtraction(target: EventTarget | null): void {
  try {
    if (!(target instanceof Element)) return;
    if (target.closest("nav, aside, [data-testid*='sidebar'], [id*='sidebar'], header, dialog, form, a, button, input, textarea")) {
      return;
    }

    const mathEl = target.closest(".katex, .katex-display, .math-display, .math-inline, .math-block, [data-math], mjx-container, math");
    if (!mathEl) return;

    const extracted = extractLatexFromReactFiber(mathEl);
    if (extracted) {
      mathEl.setAttribute("data-gpt-md-tex", extracted.latex);
      mathEl.setAttribute("data-gpt-md-display", extracted.isDisplay ? "true" : "false");
    }
  } catch {
    // 绝不抛出异常影响宿主页面
  }
}

document.addEventListener("click", (event) => handleMathTargetExtraction(event.target), true);
document.addEventListener("mouseover", (event) => handleMathTargetExtraction(event.target), true);

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
    if (typeof text !== "string") return false;
    let slashCount = 0;
    for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) slashCount++;
    return slashCount % 2 === 1;
  }

  function findUnescaped(text: string, delimiter: string, from: number): number {
    if (typeof text !== "string") return -1;
    let index = text.indexOf(delimiter, from);
    while (index !== -1 && isEscaped(text, index)) {
      index = text.indexOf(delimiter, index + delimiter.length);
    }
    return index;
  }

  function cleanOuterParens(latex: any): string {
    if (typeof latex !== "string") return "";
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

  function isMathParenthesis(content: any): boolean {
    if (typeof content !== "string") return false;
    const trimmed = content.trim();
    if (!trimmed) return false;
    if (/[\u4e00-\u9fa5]/.test(trimmed)) return false;
    if (/^(?:\d+|[A-Z]\d+|Table\s+\w+|Fig\.\s*\w+|arXiv)$/i.test(trimmed)) return false;
    if (/^[A-Z]{2,6}$/.test(trimmed)) return false;

    if (/\\[a-zA-Z]+/.test(trimmed)) return true;
    if (/[_^\-+*<>=≤≥±~]/.test(trimmed)) return true;
    if (/^[a-zA-Z]$/.test(trimmed)) return true;
    if (/^[a-zA-Z0-9_\*\^\\]+(?:\s*,\s*[a-zA-Z0-9_\*\^\\]+)+$/.test(trimmed)) return true;
    if (/^[a-zA-Z0-9_^\\]+\([a-zA-Z0-9_,\\/\s\*\^\-+]+\)$/.test(trimmed)) return true;

    return false;
  }

  function preSanitizeChatGPTText(text: any): string {
    if (typeof text !== "string" || !text.trim()) return String(text ?? "");
    let s = text
      .replace(/\\right\$\$\s*\^2/g, "\\right]^2")
      .replace(/\\right\$\$\s*\.?\s*\n?\]?/g, "\\right].$$")
      .replace(/\\right\$\$\s*,?\s*\n?\]?/g, "\\right],$$")
      .replace(/\\right\$\$/g, "\\right]")
      .replace(/\\left\$\$/g, "\\left[")
      .replace(/\\left\s*\{/g, "\\left\\{")
      .replace(/\\right\s*\}/g, "\\right\\}");

    // 0. 消除连续 3 个及以上 $ 符号
    s = s.replace(/\${3,}/g, () => "$$");

    // 0.1 消除多行堆叠的重复 $$ 符号 (如 $$ \n $$\boxed{...} -> $$\boxed{...})
    s = s.replace(/(?:\$\$\s*){2,}(\\boxed\{)/g, "$$$$$1");
    s = s.replace(/(?:\$\$\s*){2,}/g, "$$");

    // 0.2 消除孤立的空公式块 ($$$$ 或 $$\n$$)
    s = s.replace(/(?:^|\n)\s*\$\$\s*\$\$\s*(?:\n|$)/g, "\n\n");

    // 0.3 清理正文中纯数字或百分比的多余小括号 如 (12%) -> 12%, (7%) -> 7%
    s = s.replace(/(^|[\u4e00-\u9fa5\s,，。；：:!！*])\(\s*(\d+(?:\.\d+)?%)\s*\)(?=[\u4e00-\u9fa5\s,，。；：:!！*]|$)/g, "$1$2");

    // 1. 修复破损的 Markdown 引用链接 (如 ($$arXiv][1]) -> ([arXiv][1]))
    s = s.replace(/\(\$\$([a-zA-Z0-9_\-]+\]\[\d+\])\)/g, (_m, inner) => `([${inner})`);
    s = s.replace(/\$\$([a-zA-Z0-9_\-]+\]\[\d+\])/g, (_m, inner) => `[${inner}`);
    s = s.replace(/(\(\[[a-zA-Z0-9_\-]+\]\[\d+\]\))\s*([^\n\s])/g, (_m, p1, p2) => `${p1}\n\n${p2}`);

    // 1.1 自动恢复被压成单行的 Markdown 表格结构
    // a. 表格前段普通文本与表头分离
    s = s.replace(/([^\n|])\s+(\|(?:\s*[^|\n]+\s*\|){2,})/g, (_m, p1, p2) => `${p1}\n\n${p2}`);
    // b. 拆分连续粘连的表格行 (如 | 适合我们 | | - | 或 | ★★★★★ | | **singlet...)
    s = s.replace(/\|\s*\|\s*([^|\n])/g, (_m, next) => `|\n| ${next}`);
    // c. 表格末尾与后续 Markdown 标题或正文分离
    s = s.replace(/\|\s+(#{1,6}\s+[^\n]+)/g, (_m, next) => `|\n\n${next}`);

    // 1.2 拆分与 Markdown 标题粘连在同一行的正文段落
    s = s.replace(/(#{1,6}\s+(?:[^\n:：]+[:：])?[^\n]+?)\s+((?:最简单|首先|其次|具体而言|对于|通过|根据|在这一|基于|我们|由此|也就是说|这里)[^#\n]*)/g, (_m, p1, p2) => `${p1}\n\n${p2}`);

    // 1.3 修复规范群嵌套小括号变量如 (U(1)_{B-L}/U(1)_X) 或 (SU(2)_R)
    s = s.replace(/(^|[\u4e00-\u9fa5\s,，。；：:!！*]|\*\s+)\(\s*([A-Z]{1,3}\(\d+\)(?:_[a-zA-Z0-9_\-\{\}]+)*(?:\/[A-Z]{1,3}\(\d+\)(?:_[a-zA-Z0-9_\-\{\}]+)*)*)\s*\)(?=[\u4e00-\u9fa5\s,，。；：:!！*]|$)/g, (_m, prefix, inner) => `${prefix}$${inner}$`);

    // 2. 修复脱落的伪 $$ 头部 (如 $$k\tau\gg1; ] * reheating -> $k\tau\gg1$ * reheating)
    s = s.replace(/(^|\s)\$\$\s*([a-zA-Z0-9_\\\^\-+=\(\)\s<>≤≥±,]{2,40})\s*(?:;\s*\]|;|\])\s*(?=\*|\#|[\u4e00-\u9fa5])/g, (_m, p1, p2) => {
      return `${p1}$${p2.trim()}$ `;
    });

    // 3. 优先修复行内脱落的短 [ \delta\text{-function} ] -> $\delta\text{-function}$
    s = s.replace(/(?<!\\)\[\s*(\\?[a-zA-Z0-9_\-\{\}]*\\(?:text|mathrm)[^\]\n]*)\s*\]/g, (_match, inner) => {
      return `$${inner.trim()}$`;
    });

    // 4. 修复孤立脱落的换行短 [ \n f(M) \n ] -> $f(M)$
    s = s.replace(/(?:^|\n)\s*\[\s*\n+\s*([a-zA-Z0-9_\-\(\)\s\\^_{}=+\-*/,]{1,40}?)\s*\n+\s*\]/g, (_match, inner) => {
      const trimmed = inner.trim();
      if (!trimmed.includes("\n") && !trimmed.includes("\\boxed") && !trimmed.includes("\\int") && !trimmed.includes("=")) {
        return `\n\n$${trimmed}$\n\n`;
      }
      return `\n\n$$${trimmed}$$\n\n`;
    });

    // 5. 修复过渡态括号如 EMD(\to)RD -> EMD($\to$)RD
    s = s.replace(/([a-zA-Z0-9_]+)\s*\(\s*(\\(?:to|rightarrow|leftarrow|leftrightarrow|pm|mp|sim|approx|neq|propto))\s*\)\s*([a-zA-Z0-9_]+)/g, (_m, p1, p2, p3) => `${p1}($${p2}$)${p3}`);

    // 6. 仅在正文普通文本/中文空白语境中转换小括号数学变量 (如：(w), (c_s^2), (g_*,g_{*s}), (f(M)), (N_{{\rm obs},n}), (u,v))
    //    绝不误触公式内部函数调用如 P(d_j|\theta), \Phi_k(\eta), (1/3,0.32), \mathcal P_h(k,\tau)
    s = s.replace(/(^|[\u4e00-\u9fa5\s,，。；：:!！]|\*\s+)\(\s*([^()\n]{1,60}?)\s*\)(?=[\u4e00-\u9fa5\s,，。；：:!！*]|$)/g, (match, prefix, inner) => {
      if (isMathParenthesis(inner)) {
        return `${prefix}$${inner.trim()}$`;
      }
      return match;
    });

    // 7. 修复条件等式小括号如 (w\simeq1) -> $w\simeq1$
    s = s.replace(/(?<!\\[a-zA-Z0-9]+)\(\s*([a-zA-Z0-9_\\\^\-+=\s<>≤≥±]*\\[a-zA-Z]+[a-zA-Z0-9_\\\^\-+=\s<>≤≥±]*=[a-zA-Z0-9_\\\^\-+=\s<>≤≥±]*)\s*\)/g, (match, inner) => {
      if (!/^\d+(?:[.,]\d+)?$/.test(inner.trim())) {
        return `$${inner.trim()}$`;
      }
      return match;
    });

    // 8. 修复行内公式 + 孤立 $$ (如 $m_0,...\lambda_{\rm RPV}$ \rightarrow m_i. $$)
    s = s.replace(/(?<!\$)\$([^$\n]+)\$ *(\\[a-zA-Z][^$\n]*?) *\$\$(?!\$)(?=\s*\n|\s*$)/gm, (_m, inner, rest) =>
      `\n\n$$${inner} ${rest.trim()}$$\n\n`
    );
    s = s.replace(/(?<!\$)\$([^$\n]*\\[a-zA-Z][^$\n]*)\$ *\$\$(?!\$)(?=\s*\n|\s*$)/gm, (_m, inner) =>
      `\n\n$$${inner.trim()}$$\n\n`
    );

    // 9. 修复包含嵌套 \left[ \right] 或多项式的 [ \Phi_k'' ... =0,$$ 块级公式 (不可跨行/跨段吞入无关正文 $)
    s = s.replace(/(^|\n|[\u4e00-\u9fa5：:。；;])\s*\[\s*(\\?[a-zA-Z0-9_\\\^\-+=\s<>≤≥±,./{}|~*'"’\(\)]*?\\[a-zA-Z]+[^\n$#]{1,300}?)\s*([.,，。])?\s*\${1,2}(?=\s*\n|\s*[\u4e00-\u9fa5\w]|$)/g, (_m, prefix, body) => {
      let cleanBody = body.trim();
      if (cleanBody.endsWith(".")) cleanBody = cleanBody.slice(0, -1).trim();
      return `${prefix}\n\n$$${cleanBody}$$\n\n`;
    });

    // 10. 修复链式箭头公式 (如 [ g_*(T),g_{*s}(T) \rightarrow w(T)... )
    s = s.replace(/(^|\n|[\u4e00-\u9fa5：:。；;])\s*\[\s*([a-zA-Z0-9_\\\^\-+=\s<>≤≥±,./{}|~*'"’\(\)]*\\(?:rightarrow|to|leftarrow|leftrightarrow|implies|Rightarrow)[\s\S]*?)(?:(\s*\])|\s*\.(?=\s*$|\s*[\n\u4e00-\u9fa5])|\s*$)/g, (_m, prefix, body, bracket) => {
      let clean = body.trim();
      if (!bracket && clean.endsWith(".")) clean = clean.slice(0, -1).trim();
      return `${prefix}\n\n$$${clean}$$\n\n`;
    });

    // 11. 修复常规带方括号数学公式 [ \mathcal L ... ] 或 [ M_{\rm enh}=... ] (支持内嵌于中文句子)
    s = s.replace(/(^|\n|[\u4e00-\u9fa5：:。；;]|\s)\s*\[\s*([a-zA-Z0-9_\\\^\-+=\s<>≤≥±,./{}|~*'"’\(\)!]+)\s*\]/g, (match, prefix, inner) => {
      const trimmed = inner.trim();
      if (/[\\_^\-+*<>=≤≥±~]/.test(trimmed) && !/^\d+(?:[.,]\d+)?$/.test(trimmed)) {
        return `${prefix}\n\n$$${trimmed}$$\n\n`;
      }
      return match;
    });

    // 12. 修复孤立脱落的 [ \boxed{ ... } ] 块或 [ $$...$$ ] 块 -> $$\boxed{ ... }$$
    s = s.replace(/(?:^|\n)\s*\[\s*\n+\s*(\$\$)/g, "\n\n$1");
    s = s.replace(/(\$\$)\s*\n+\s*\]\s*(?:\n|$)/g, "$1\n\n");
    s = s.replace(/(?:^|\n)\s*\[\s*(\$\$\s*\\boxed\{[\s\S]*?\}\s*\$\$)\s*(?:\]|\$\$)?/g, "\n\n$1\n\n");

    // 12.1 修复 \boxed 内未闭合 } 导致 } 和 ] 脱落到下一行 (如 $$\boxed{ ... }$$\n}\n])
    s = s.replace(/\$\$\s*(\\boxed\{[\s\S]*?)\s*\$\$\s*\n*\s*\}\s*(?:\n*\s*\])?/g, (_m, body) => {
      let clean = body.trim();
      let depth = 0;
      for (let i = 0; i < clean.length; i++) {
        if (clean[i] === "{" && !isEscaped(clean, i)) depth++;
        else if (clean[i] === "}" && !isEscaped(clean, i)) depth--;
      }
      if (depth > 0) {
        clean += " ".repeat(1) + "}".repeat(depth);
      }
      return `\n\n$$${clean}$$\n\n`;
    });

    // 12.2 修复公式后孤立脱落的 } 和 ] (如 $$\boxed{ ... }$$\n}\n])
    s = s.replace(/(\$\$[\s\S]*?\$\$)\s*\n*\s*[}\]]\s*(?:\n*\s*\])?/g, "$1\n\n");

    // 13. 修复脱落的花括号完整 \boxed{...} 块 (支持任意多层 \text{} 嵌套)
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

    // 14. 修复结尾只有一个 $ 的 \boxed 块 (如 $$ \boxed{...} $)
    s = s.replace(/(\$\$\s*\\boxed\{[^\$]*?\})\s*\$(?!\$)/g, (_m, p1) => `${p1}$$`);

    // 15. 收缩紧贴已闭合公式的多余 $$ 符号
    s = s.replace(/\${3,}/g, () => "$$");

    // 16. 列表项前置分行与重复 bullet (* * 或 * * *) 消除，且绝不误伤 **bold** 标记
    s = s.replace(/(?:^|\n)\s*(?:[*•\-]\s+)+/g, "\n* ");
    s = s.replace(/([。：:!！；;\]\)])\s*(?:[*•\-]\s+)+/g, "$1\n\n* ");

    // 17. 统一清除末尾孤立的 ] 与标点粘连
    s = s.replace(/(\$\$[\s\S]*?\$\$)\s*([.,，。])?\s*\n*\s*\]/g, "$1$2");

    // 18. 保证 Markdown 标题 (### 标题) 前后有独立双换行，剥离粘连在标题前的破折号
    s = s.replace(/(?:^|\n)\s*[*•\-]\s+(#{1,6}\s+)/g, "\n\n$1");
    s = s.replace(/([^\n#])\s*(?:[*•\-]\s+)?(#{1,6}\s+[^\n]+)/g, "$1\n\n$2");
    s = s.replace(/(#{1,6}\s+[^\n？?！!。]+[？?！!。])\s+([\u4e00-\u9fa5\w\*])/g, "$1\n\n$2");

    // 19. 保证有序列表项 (1. 2. 3.) 前后独立分行
    s = s.replace(/([。：:!！；;])\s*(\d+\.\s+[\u4e00-\u9fa5\w\*])/g, "$1\n\n$2");

    return s;
  }

  function repairLatexMultiLineEnvironments(latex: any): string {
    if (typeof latex !== "string" || !latex.includes("\\begin{")) return String(latex ?? "");
    const envRegex = /\\begin\{(array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|rcases|dcases|align|aligned|align\*|split|gather|gathered|gather\*|eqnarray|eqnarray\*)\}([\s\S]*?)\\end\{\1\}/g;
    return latex.replace(envRegex, (_match, envName, body) => {
      let repairedBody = body;
      repairedBody = repairedBody.replace(/(?<!\\)\\\s+(\\hline)/g, " \\\\ $1");
      repairedBody = repairedBody.replace(/([0-9a-zA-Z_\}\]\)])(?<!\\)\\\s+([0-9a-zA-Z_\{\[\\])/g, "$1 \\\\ $2");
      repairedBody = repairedBody.replace(/([^\\\s])\s*\\hline/g, "$1 \\\\ \\hline");
      return `\\begin{${envName}}${repairedBody}\\end{${envName}}`;
    });
  }

  function cleanLatexBody(raw: any): string {
    if (typeof raw !== "string") return "";
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
    s = s.replace(/(?<![:：\*\-\#\>])([\u4e00-\u9fa5a-zA-Z0-9])\s*\n\s*(\$[^$\n]+\$)/g, "$1 $2");
    s = s.replace(/(\$[^$\n]+\$)([\u4e00-\u9fa5])/g, "$1 $2");
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

  function shouldBeDisplayMath(markdown: string, startIndex: number, endIndex: number, latex: string): boolean {
    if (
      latex.includes("\\boxed") ||
      latex.includes("\\begin{") ||
      latex.includes("\\int") ||
      latex.includes("\\sum") ||
      latex.includes("\\prod") ||
      latex.includes("\\iint") ||
      latex.includes("\\oint") ||
      latex.includes("\n") ||
      latex.includes("\\\\")
    ) {
      return true;
    }

    const lineStart = Math.max(0, markdown.lastIndexOf("\n", startIndex - 1) + 1);
    const lineEndIdx = markdown.indexOf("\n", endIndex);
    const lineEnd = lineEndIdx === -1 ? markdown.length : lineEndIdx;

    const sameLinePrefix = markdown.slice(lineStart, startIndex).trim();
    const sameLineSuffix = markdown.slice(endIndex, lineEnd).trim();

    const hasSameLineChinesePrefix = /[\u4e00-\u9fa5]$/.test(sameLinePrefix);
    const hasSameLineChineseSuffix = /^[,，.。；;]?\s*[\u4e00-\u9fa5]/.test(sameLineSuffix);

    if (hasSameLineChinesePrefix || hasSameLineChineseSuffix) {
      if (latex.length <= 120) {
        return false;
      }
    }

    return true;
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
          // 只消化紧跟的孤立 ] 或 \n] 组合，绝不吃掉普通换行
          if (index < markdown.length && markdown[index] === "]") {
            index++;
          } else if (index + 1 < markdown.length && markdown[index] === "\n" && markdown[index + 1] === "]") {
            index += 2;
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
          let body = cleanLatexBody(candidateBody);
          const isDisplay = shouldBeDisplayMath(markdown, index, end + 2, candidateBody.trim());
          if (!isDisplay) {
            const trailPuncMatch = body.match(/([,，.。；;])$/);
            if (trailPuncMatch) {
              body = body.slice(0, -1).trim();
              const punc = trailPuncMatch[1];
              const cnPunc = punc === "," || punc === "，" ? "，" : punc === "." || punc === "。" ? "。" : punc;
              result += `$${body}$${cnPunc}`;
            } else {
              result += `$${body}$`;
            }
          } else {
            result += `$$${body}$$`;
          }
          index = end + 2;
          // 只消化紧跟的孤立 ] 或 \n] 组合，绝不吃掉普通换行
          if (index < markdown.length && markdown[index] === "]") {
            index++;
          } else if (index + 1 < markdown.length && markdown[index] === "\n" && markdown[index + 1] === "]") {
            index += 2;
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

      function findClosingBracketForDisplay(start: number): { endBrace: number; endPos: number } {
        const dollarEnd = markdown.indexOf("$$", start);
        const nlEnd = markdown.indexOf("\n]", start);

        let closeBracket = -1;
        let depth = 0;
        for (let i = start; i < markdown.length; i++) {
          if (isEscaped(markdown, i)) continue;
          if (markdown.startsWith("\\left[", i)) {
            depth++;
            i += 5;
            continue;
          }
          if (markdown.startsWith("\\right]", i)) {
            depth = Math.max(0, depth - 1);
            i += 6;
            continue;
          }
          if (markdown[i] === "[" && !markdown.slice(Math.max(0, i - 5), i).endsWith("\\left")) {
            depth++;
          } else if (markdown[i] === "]" && !markdown.slice(Math.max(0, i - 6), i).endsWith("\\right")) {
            if (depth === 0) {
              closeBracket = i;
              break;
            }
            depth--;
          }
        }

        if (dollarEnd !== -1 && (nlEnd === -1 || dollarEnd < nlEnd) && (closeBracket === -1 || dollarEnd < closeBracket)) {
          return { endBrace: dollarEnd, endPos: dollarEnd + 2 };
        }
        if (nlEnd !== -1 && (closeBracket === -1 || nlEnd < closeBracket)) {
          return { endBrace: nlEnd, endPos: nlEnd + 2 };
        }
        if (closeBracket !== -1) {
          return { endBrace: closeBracket, endPos: closeBracket + 1 };
        }
        return { endBrace: -1, endPos: -1 };
      }

      if (
        markdown[index] === "[" &&
        !markdown.slice(Math.max(0, index - 5), index).endsWith("\\left")
      ) {
        const { endBrace, endPos } = findClosingBracketForDisplay(index + 1);
        if (endBrace !== -1) {
          let body = markdown.slice(index + 1, endBrace).trim();
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
          if (clean && isMathParenthesis(clean)) {
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
