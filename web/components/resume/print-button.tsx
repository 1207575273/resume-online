"use client";

import { Printer } from "lucide-react";

/** 保存为 PDF：直接调起浏览器打印（globals.css 内置打印样式） */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--hairline)] px-4 py-1.5 text-sm text-[var(--text-dim)] transition-colors duration-200 hover:border-[var(--text-dim)] hover:text-[var(--text)]"
    >
      <Printer className="size-3.5" aria-hidden />
      下载 PDF
    </button>
  );
}
