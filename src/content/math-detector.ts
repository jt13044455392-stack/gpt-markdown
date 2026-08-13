import type { MathElementMatch } from "../types/math";

export type { MathElementMatch };

/**
 * 候选公式选择器，按优先级排列。
 * 越靠前的选择器越可能是「外层容器」，越靠后的越可能是「内部节点」。
 */
const MATH_SELECTORS = [
  "[data-math]",
  "[data-latex]",
  "[data-tex]",
  ".math-block",
  ".math-display",
  ".katex-display",
  ".math-inline",
  ".katex",
  ".katex-mathml",
  "mjx-container",
  "math",
  ".math",
] as const;

/**
 * 判断一个元素是否为块级（display）公式。
 *
 * 策略（任一满足即视为块级）：
 *  1. 元素自身或祖先含 .katex-display、.math-display、.math-block
 *  2. 元素自身或祖先 display 属性为 true / block
 *  3. mjx-container[display="true"]
 *  4. computed display 为 block 且宽度 ≥ 父容器宽度的 80%
 */
function isDisplayMath(element: Element): boolean {
  // 策略 1：.katex-display / .math-display / .math-block
  if (
    element.classList.contains("katex-display") ||
    element.closest(".katex-display") !== null ||
    element.classList.contains("math-display") ||
    element.closest(".math-display") !== null ||
    element.classList.contains("math-block") ||
    element.closest(".math-block") !== null
  ) {
    return true;
  }

  // 策略 2：mjx-container[display="true"] 或 [data-display="true"]
  if (
    element.tagName.toLowerCase() === "mjx-container" &&
    element.getAttribute("display") === "true"
  ) {
    return true;
  }
  if (element.closest('mjx-container[display="true"], [data-display="true"]') !== null) {
    return true;
  }

  // 策略 3：computed style block + 接近父容器宽度
  try {
    const style = window.getComputedStyle(element);
    if (style.display === "block" || style.display === "flex") {
      const parent = element.parentElement;
      if (parent) {
        const parentWidth = parent.getBoundingClientRect().width;
        const selfWidth = element.getBoundingClientRect().width;
        if (parentWidth > 0 && selfWidth / parentWidth >= 0.8) {
          return true;
        }
      }
    }
  } catch {
    // 忽略样式读取异常
  }

  return false;
}

/**
 * 从点击目标往上找最近的公式元素，并判断是否为块级公式。
 *
 * 返回 null 表示点击的不是公式区域。
 *
 * 注意：
 * - 如果同时命中 .katex 和 .katex-display，优先返回更外层的 .katex-display。
 * - 点击公式内部的 span / svg / annotation 也能找到外层公式容器。
 */
export function findMathElement(
  target: EventTarget | null
): MathElementMatch | null {
  if (!(target instanceof Element)) return null;

  // 从点击节点逐级向上，对每个候选选择器做 closest()
  // 收集所有命中的元素，然后选深度最浅（最外层）的那个
  const candidates: Element[] = [];

  for (const selector of MATH_SELECTORS) {
    const found = target.closest(selector);
    if (found) {
      candidates.push(found);
    }
  }

  if (candidates.length === 0) return null;

  // 选取 DOM 树中层级最浅（最外层）的元素。
  let outermost = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (candidate.contains(outermost)) {
      outermost = candidate;
    }
  }

  return {
    element: outermost as HTMLElement,
    isDisplay: isDisplayMath(outermost),
  };
}
