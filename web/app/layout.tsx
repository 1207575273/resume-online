import type { Metadata, Viewport } from "next";
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
    "杨胜，AI 应用架构师：6年 Java 大规模系统 + AI Agent 全链路实战（日均 2亿+ Token 可观测体系），开源 CCode 作者。",
  keywords: ["杨胜", "AI 应用架构师", "AI Agent", "Java 架构师", "LangChain", "Kubernetes", "开源"],
  authors: [{ name: "杨胜" }],
  openGraph: {
    title: "杨胜 · AI 应用架构师",
    description: "6年大规模系统 + AI Agent 全线实战，开源作者。",
    type: "profile",
    locale: "zh_CN",
    url: "/",
  },
  twitter: { card: "summary" },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050507" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
  ],
};

const themeInitScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"){document.documentElement.classList.remove("dark")}}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {/* 无 JS 时入场动画停在 opacity:0——这里直接展开全部内容兜底 */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <SiteNav />
        <SideDots />
        {children}
      </body>
    </html>
  );
}
