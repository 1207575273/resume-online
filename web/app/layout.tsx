import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ChatWidget } from "@/components/chat/chat-widget";
import { SideDots } from "@/components/resume/side-dots";
import { SiteNav } from "@/components/resume/site-nav";
import "./globals.css";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "杨胜 · AI 应用架构师",
    template: "%s · 杨胜",
  },
  description:
    "杨胜，AI 应用架构师：5 年+ Java 大规模系统 + AI Agent 全链路实战（日均 2亿+ Token 可观测体系），开源 CCode 作者。",
  keywords: ["杨胜", "AI 应用架构师", "AI Agent", "Java 架构师", "LangChain", "Kubernetes", "开源"],
  authors: [{ name: "杨胜" }],
  openGraph: {
    title: "杨胜 · AI 应用架构师",
    description: "5 年+ 大规模系统 + AI Agent 全线实战，开源作者。",
    type: "profile",
    locale: "zh_CN",
    url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "杨胜 · AI 应用架构师 · 在线简历" }],
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  // 百度移动适配声明（响应式站点标准写法）；百度验证码 meta 验证站点时也加在这里：
  // verification: { other: { "baidu-site-verification": "codeva-XXXXXX" } }
  other: { "applicable-device": "pc,mobile" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fafaf7",
};

const themeInitScript = `(function(){try{document.documentElement.classList.remove("dark");localStorage.removeItem("theme")}catch(e){}})()`;

/** AdSense 发布商 ID（ca-pub-…）：未配置则整条脚本不注入，站点与无广告版完全一致 */
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* 搜索引擎站长平台验证码将来加在这里（verification.other），如：
            baidu-site-verification: codeva-xxxx / google-site-verification: xxx */}
      </head>
      <body>
        {/* 无 JS 时入场动画停在 opacity:0——这里直接展开全部内容兜底 */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <SiteNav />
        <SideDots />
        {children}
        <ChatWidget />
        {ADSENSE_CLIENT && (
          <Script
            id="adsbygoogle-init"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          />
        )}
      </body>
    </html>
  );
}
