import type { PublishedResumeResponse } from "./resume-types";

/**
 * 服务端取数：容器内网直连 server（RESUME_API_BASE=http://server:3001/api/v1），
 * 本地开发指向本机 3001。
 * 缓存策略：页面是 force-dynamic（构建期无数据库，不能静态预渲染），
 * 每次请求回源 server——刻意不再给 fetch 配 revalidate：在 dev 下它会落入
 * .next 数据缓存，发布新版本内容后页面会翻旧账（本机踩过）。
 * 将来切 ISR 的做法：去掉 page.tsx 的 force-dynamic，再给这里加回
 * next: { revalidate: 300, tags: ["resume"] }，并在内容发布后重刷 web 容器。
 */
const API_BASE = process.env.RESUME_API_BASE ?? "http://localhost:3001/api/v1";

export class ResumeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ResumeApiError";
  }
}

export async function fetchPublishedResume(slug = "codeyang"): Promise<PublishedResumeResponse> {
  const response = await fetch(`${API_BASE}/resume/${slug}`, { cache: "no-store" });

  if (!response.ok) {
    throw new ResumeApiError(`获取简历失败（${response.status}）`, response.status);
  }
  return (await response.json()) as PublishedResumeResponse;
}

/** 月份区间的人类可读形式："2024-07 — 至今" */
export function formatPeriod(start: string, end?: string): string {
  return `${start} — ${end && end.length > 0 ? end : "至今"}`;
}
