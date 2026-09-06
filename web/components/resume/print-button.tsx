"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";

/**
 * 下载 PDF：走 nginx → pdf 容器（Playwright 屏幕级渲染，与浏览器效果一致），
 * 携带当前主题（dark/light）；服务不可用时兜底浏览器原生打印。
 */
export function PrintButton() {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
      // t= 时间戳绕开 Cloudflare 对 .pdf 的边缘缓存，保证每次都是新渲染
      const response = await fetch(`/resume.pdf?theme=${theme}&t=${Date.now()}`);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = Object.assign(document.createElement("a"), {
        href: url,
        download: "CodeYang-Resume.pdf",
      });
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      window.print();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="no-print inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--hairline)] px-5 py-2.5 text-[15px] text-[var(--text-dim)] transition-colors duration-200 hover:border-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <FileDown className="size-4" aria-hidden />
      )}
      {busy ? "生成中…" : "下载 PDF"}
    </button>
  );
}
