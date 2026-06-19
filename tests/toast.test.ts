import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { showToast } from "../src/content/toast";

const TOAST_ID = "chatgpt-math-copier-toast";

describe("showToast", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("首次调用时在 body 中创建 toast 节点", () => {
    showToast("已复制");
    expect(document.getElementById(TOAST_ID)).not.toBeNull();
  });

  it("toast 显示正确的文字内容", () => {
    showToast("已复制", { type: "success" });
    expect(document.getElementById(TOAST_ID)!.textContent).toBe("已复制");
  });

  it("成功类型有 --success class", () => {
    showToast("已复制", { type: "success" });
    expect(document.getElementById(TOAST_ID)!.classList.contains("chatgpt-math-copier-toast--success")).toBe(true);
  });

  it("错误类型有 --error class", () => {
    showToast("未找到可复制的公式", { type: "error" });
    expect(document.getElementById(TOAST_ID)!.classList.contains("chatgpt-math-copier-toast--error")).toBe(true);
  });

  it("默认 type 为 success", () => {
    showToast("已复制");
    expect(document.getElementById(TOAST_ID)!.classList.contains("chatgpt-math-copier-toast--success")).toBe(true);
  });

  it("显示时 opacity 为 1", () => {
    showToast("已复制", { type: "success" });
    expect(document.getElementById(TOAST_ID)!.style.opacity).toBe("1");
  });

  it("1.5 秒后 opacity 变为 0（淡出）", () => {
    showToast("已复制", { type: "success" });
    vi.advanceTimersByTime(1500);
    expect(document.getElementById(TOAST_ID)!.style.opacity).toBe("0");
  });

  it("传入坐标时 left/top 被正确设置", () => {
    showToast("已复制", { type: "success", x: 200, y: 300 });
    const toast = document.getElementById(TOAST_ID)!;
    expect(toast.style.left).toBe("200px");
    expect(toast.style.top).toBe("312px"); // y + 12
  });

  it("不传坐标时退化为右下角定位", () => {
    showToast("已复制");
    const toast = document.getElementById(TOAST_ID)!;
    expect(toast.style.bottom).toBe("24px");
    expect(toast.style.right).toBe("24px");
  });

  it("多次调用复用同一个 DOM 节点，不堆积", () => {
    showToast("第一条");
    showToast("第二条");
    showToast("第三条", { type: "error" });
    expect(document.querySelectorAll(`#${TOAST_ID}`).length).toBe(1);
  });

  it("连续调用时内容更新为最新消息", () => {
    showToast("第一条");
    showToast("第二条", { type: "error" });
    expect(document.getElementById(TOAST_ID)!.textContent).toBe("第二条");
  });

  it("连续调用时计时器重置，不会提前淡出", () => {
    showToast("第一条");
    vi.advanceTimersByTime(1000);
    showToast("第二条"); // 重置计时
    vi.advanceTimersByTime(1000); // 从第二条起只过了 1s，还没到 1.5s
    expect(document.getElementById(TOAST_ID)!.style.opacity).toBe("1");
  });
});
