"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";

/**
 * 下载 PDF 简历:优先服务端直出(/resume.pdf → pdf 容器渲染 /resume-print 打印模板),
 * 点一下直接下载文件、无打印对话框;服务不可用时兜底新开打印页(浏览器另存为 PDF)。
 */
export function PrintButton() {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      // 不带时间戳:让 ETag 协商缓存生效(版本没变 → 304 零传输)
      const response = await fetch("/resume.pdf");
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = Object.assign(document.createElement("a"), {
        href: url,
        download: "杨胜-AI应用架构师-简历.pdf",
      });
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open("/resume-print?print=1", "_blank", "noopener");
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
      {busy ? "生成中…" : "下载 PDF 简历"}
    </button>
  );
}
