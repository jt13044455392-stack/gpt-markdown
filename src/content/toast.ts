const TOAST_ID = "chatgpt-math-copier-toast";
const TOAST_DURATION_MS = 1500;

interface ToastOptions {
  type?: "success" | "error";
  /** 鼠标点击时的 clientX，toast 水平居中于此坐标 */
  x?: number;
  /** 鼠标点击时的 clientY，toast 显示在此坐标下方 12px */
  y?: number;
}

type ToastEl = HTMLElement & { _hideTimer?: ReturnType<typeof setTimeout> };

/**
 * 在鼠标点击位置下方显示一条半透明提示，约 1.5 秒后自动消失。
 * 复用同一个 DOM 节点，不会堆积。
 *
 * 如果没有传入坐标，退化为右下角固定定位（兜底）。
 */
export function showToast(message: string, options: ToastOptions = {}): void {
  const { type = "success", x, y } = options;

  let toast = document.getElementById(TOAST_ID) as ToastEl | null;

  if (!toast) {
    toast = document.createElement("div") as ToastEl;
    toast.id = TOAST_ID;
    document.body.appendChild(toast);
  }

  // 取消已有计时器（连续触发时重置）
  if (toast._hideTimer !== undefined) {
    clearTimeout(toast._hideTimer);
  }

  // 更新内容和样式类
  toast.textContent = message;
  toast.className = `chatgpt-math-copier-toast chatgpt-math-copier-toast--${type}`;

  // 定位：跟随鼠标 or 右下角兜底
  if (x !== undefined && y !== undefined) {
    toast.style.left = `${x}px`;
    toast.style.top = `${y + 12}px`;
    toast.style.bottom = "auto";
    toast.style.right = "auto";
    // 水平方向用 transform 让 toast 中心对齐点击点
    toast.style.transform = "translateX(-50%) translateY(0)";
  } else {
    toast.style.left = "auto";
    toast.style.top = "auto";
    toast.style.bottom = "24px";
    toast.style.right = "24px";
    toast.style.transform = "translateY(0)";
  }

  toast.style.opacity = "1";

  // 1.5 秒后淡出
  toast._hideTimer = setTimeout(() => {
    if (toast) {
      toast.style.opacity = "0";
    }
  }, TOAST_DURATION_MS);
}
