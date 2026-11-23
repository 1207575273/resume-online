"use client";

import { useEffect, useRef } from "react";

/**
 * Google AdSense 展示位（克制接入：默认只在页脚上方一个位，配置驱动，未配即隐身）。
 * - 环境变量 NEXT_PUBLIC_ADSENSE_CLIENT（ca-pub-…）与 NEXT_PUBLIC_ADSENCE_SLOT（广告单元 id）
 *   都配置后才渲染；任一为空返回 null，站点与现在完全一致。
 * - 广告加载后由 Google 注入 iframe；容器预留最小高度避免布局抖动（CLS）。
 * - 打印（resume.pdf）时随 .no-print 隐藏；暗色主题交给 AdSense 自动匹配（data-ad-format=auto）。
 */
declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdSlot({ className = "" }: { className?: string }) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const slot = process.env.NEXT_PUBLIC_ADSENSE_SLOT;
  const pushed = useRef(false);

  useEffect(() => {
    // 严格模式双执行防重复 push（重复 push 会报 "All ins on page are already shown"）
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* 脚本未就绪/拦截器：静默，广告位保持空白占位 */
    }
  }, []);

  if (!client || !slot) return null;

  return (
    <div
      aria-label="advertisement"
      className={`no-print mx-auto w-full max-w-[1080px] px-5 sm:px-6 ${className}`}
    >
      <ins
        className="adsbygoogle ad-ins"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
