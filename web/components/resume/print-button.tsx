"use client";

import { FileDown } from "lucide-react";

/**
 * 下载 PDF 简历:新标签打开独立打印版(/resume-print,res v4 版式 A4 模板),
 * 页面加载后自动唤起浏览器打印——访客选「另存为 PDF」即得成品。
 * 服务端零渲染依赖(无 pdf 容器/宿主机服务);移动端浏览器不支持打印时,
 * 该页本身就是完整可投递的简历视图。
 */
export function PrintButton() {
  function download() {
    window.open("/resume-print?print=1", "_blank", "noopener");
  }

  return (
    <a
      href="/resume-print"
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        event.preventDefault();
        download();
      }}
      className="no-print inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--hairline)] px-5 py-2.5 text-[15px] text-[var(--text-dim)] transition-colors duration-200 hover:border-[var(--text-dim)] hover:text-[var(--text)]"
    >
      <FileDown className="size-4" aria-hidden />
      下载 PDF 简历
    </a>
  );
}
