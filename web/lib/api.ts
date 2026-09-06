import type { PublishedResumeResponse } from "./resume-types";

/**
 * 服务端取数：容器内网直连 server（RESUME_API_BASE=http://server:3001/api/v1），
 * 本地开发指向本机 3001。ISR 缓存 5 分钟——DB 短暂不可用时页面仍可服务。
 */
const API_BASE = process.env.RESUME_API_BASE ?? "http://localhost:3001/api/v1";

export const RESUME_CACHE_TAG = "resume";

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
  const response = await fetch(`${API_BASE}/resume/${slug}`, {
    next: { revalidate: 300, tags: [RESUME_CACHE_TAG] },
  });

  if (!response.ok) {
    throw new ResumeApiError(`获取简历失败（${response.status}）`, response.status);
  }
  return (await response.json()) as PublishedResumeResponse;
}

/** 月份区间的人类可读形式："2024-07 — 至今" */
export function formatPeriod(start: string, end?: string): string {
  return `${start} — ${end && end.length > 0 ? end : "至今"}`;
}
