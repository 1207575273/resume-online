import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隐私政策",
  description: "本站（杨胜在线简历）的数据收集与广告 cookie 说明。",
  robots: { index: true, follow: true },
  alternates: { canonical: "/privacy" },
};

/**
 * 隐私政策（AdSense 审核必需页 + 对访客的基本透明度）。
 * 静态渲染，无第三方依赖；内容变更无需动其他文件。
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[720px] px-5 py-20 sm:px-6 md:py-28">
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">隐私政策</h1>
      <p className="mt-4 text-[13.5px] text-[var(--text-dim)]">最近更新：2026 年 9 月 11 日</p>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-[var(--text)]/85">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--text)]">本站收集什么</h2>
          <p>
            本站是杨胜的个人在线简历。我们不要求注册，不收集个人身份信息。服务器会记录常规访问日志
            （IP、浏览器标识、访问时间），仅用于安全与故障排查，日志定期轮转清理。
            若你使用页面内的 AI 问答功能，对话内容会保存用于改进问答质量，不会与第三方共享。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--text)]">广告与 Cookie</h2>
          <p>
            本站可能展示 Google AdSense 广告。Google 及其合作伙伴可能使用 Cookie
            基于你此前的访问记录展示广告。你可以在
            <a
              href="https://www.google.com/settings/ads"
              target="_blank"
              rel="noreferrer noopener"
              className="mx-1 text-[var(--accent)] underline underline-offset-4 hover:opacity-80"
            >
              Google 广告设置
            </a>
            中个性化或关闭广告，详情见
            <a
              href="https://policies.google.com/technologies/ads"
              target="_blank"
              rel="noreferrer noopener"
              className="mx-1 text-[var(--accent)] underline underline-offset-4 hover:opacity-80"
            >
              Google 广告政策说明
            </a>
            。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--text)]">联系方式</h2>
          <p>
            对本政策或本站内容有疑问，请通过首页页脚的邮箱联系我。
          </p>
        </section>
      </div>

      <p className="mt-14 border-t border-[var(--hairline)] pt-6 text-[13.5px] text-[var(--text-dim)]">
        <a href="/" className="transition-colors duration-200 hover:text-[var(--accent)]">
          ← 返回首页
        </a>
      </p>
    </main>
  );
}
