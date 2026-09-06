/**
 * 种子数据：写入 CodeYang 的示例简历并发布 v1。
 * 幂等——已有发布版本时跳过。直接走 domain + 仓储（等价于一个小型用例脚本）。
 */
import { PrismaResumeRepository } from "../src/infrastructure/prisma/resume.repository";
import { disconnectPrisma } from "../src/infrastructure/prisma/client";
import { createResumeContent } from "../src/domain/resume/resume-content";

const SAMPLE_CONTENT: unknown = {
  profile: {
    name: "CodeYang",
    headline: "全栈工程师 · Node.js / React / 云原生",
    summary:
      "喜欢把东西做上线的人。熟悉 TypeScript 全栈开发与容器化部署，关注工程质量与交付效率，相信简单直接的架构能活得更久。",
    location: "中国 · 远程友好",
    email: "hello@example.com",
    links: [
      { label: "GitHub", url: "https://github.com/codeyang" },
      { label: "博客", url: "https://blog.codeyang.dev" },
    ],
  },
  skillGroups: [
    { name: "语言与运行时", skills: ["TypeScript", "Node.js 22", "SQL", "Bash"] },
    { name: "前端", skills: ["React 19", "Next.js 16", "Tailwind CSS 4", "shadcn/ui"] },
    { name: "后端与数据", skills: ["REST API 设计", "Prisma 7", "PostgreSQL", "Redis"] },
    { name: "工程与交付", skills: ["pnpm monorepo", "Docker / Compose", "Nginx", "GitHub Actions"] },
  ],
  experiences: [
    {
      company: "某互联网公司",
      role: "全栈工程师",
      start: "2024-07",
      end: "",
      summary: "负责核心业务的前后端研发与稳定性。",
      highlights: [
        "主导单体到 pnpm monorepo 的拆分，构建时间下降 60%",
        "设计并落地灰度发布流程，线上事故率显著下降",
        "推动接口契约类型化，前后端联调成本大幅降低",
      ],
      tech: ["Next.js", "NestJS", "PostgreSQL", "Docker"],
    },
    {
      company: "某创业团队",
      role: "前端工程师",
      start: "2022-03",
      end: "2024-06",
      summary: "从 0 到 1 搭建产品前端与组件体系。",
      highlights: [
        "搭建组件库与设计规范，支撑 5 条业务线复用",
        "首屏加载从 4.2s 优化到 1.3s（LCP）",
      ],
      tech: ["React", "Vite", "Tailwind CSS"],
    },
  ],
  projects: [
    {
      name: "codeyang-resume-online",
      description: "本站：Next.js 全栈 monorepo 在线简历，轻量 DDD 分层 + 简历版本管理，容器化部署。",
      highlights: ["内容版本化，可回滚任意历史版本", "SSR + 结构化数据，SEO 友好", "一键 docker compose 部署"],
      tech: ["Next.js 16", "Prisma 7", "PostgreSQL 18", "Tailwind 4"],
      link: "https://github.com/codeyang/codeyang-resume-online",
    },
    {
      name: "nodetime",
      description: "轻量 Node.js 服务观测工具：进程指标采集与可视化面板。",
      highlights: ["零依赖接入，一行命令启动", "容器与裸机均可采集"],
      tech: ["Node.js", "Fastify", "Docker"],
    },
    {
      name: "cli-toolkit",
      description: "个人日常工程化脚本集合：项目脚手架、发布流程、环境治理。",
      highlights: ["统一团队本地开发体验"],
      tech: ["TypeScript", "Shell"],
    },
  ],
  education: [
    {
      school: "某大学",
      major: "计算机科学与技术",
      degree: "本科",
      start: "2018-09",
      end: "2022-06",
    },
  ],
};

async function main(): Promise<void> {
  const repo = new PrismaResumeRepository();
  const resume = await repo.ensureCreated({ slug: "codeyang", title: "CodeYang 的在线简历" });

  if (resume.getPublished()) {
    console.log(`[seed] 「${resume.meta.slug}」已有发布版本，跳过`);
    return;
  }

  const version = resume.createNextVersion({
    content: createResumeContent(SAMPLE_CONTENT),
    label: "2026 秋",
    note: "seed 初始版本",
  });
  await repo.addVersion(resume, version);

  const { published, previous } = resume.publishVersion(version.id);
  await repo.persistPublish(resume, published, previous);

  console.log(`[seed] 已创建并发布版本 #${published.number}（${published.label}）`);
}

main()
  .catch((error) => {
    console.error("[seed] 失败:", error);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
