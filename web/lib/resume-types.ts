/**
 * 简历内容契约 —— server/src/domain/resume/resume-content.ts 的镜像。
 * 契约真身在 server（创建版本时做结构校验）；此文件仅提供前端类型。
 */

export interface ResumeLink {
  label: string;
  url: string;
}

export interface ResumeProfile {
  name: string;
  headline: string;
  summary: string;
  location?: string;
  email?: string;
  links: ResumeLink[];
  /** 定位标签（如「AI 原生人才」），Hero 区展示 */
  tags?: string[];
}

/** 单项技能：level 为 0-100 熟练度（分组排序/核心档判定），缺省 = 不打分；
 *  proof = 一句话生产证据，有 proof 的项以「技能—证据」行展示 */
export interface SkillItem {
  name: string;
  level?: number;
  proof?: string;
}

export interface SkillGroup {
  name: string;
  /** 组级注释一行（如「自费 Claude Code 投入 ¥30,000+」） */
  note?: string;
  skills: SkillItem[];
}

export interface ExperienceItem {
  company: string;
  /** 公司名旁的小标签（如「百得思维 · 讯飞子公司 · 内包」），说明用工主体 */
  companyTag?: string;
  role: string;
  start: string;
  end?: string;
  summary?: string;
  highlights: string[];
  tech: string[];
}

export interface ProjectItem {
  name: string;
  description: string;
  highlights?: string[];
  tech?: string[];
  link?: string;
  /** 项目归属:personal 个人项目 / company 公司项目(缺省 = 不显示归属标签) */
  kind?: "personal" | "company";
}

export interface EducationItem {
  school: string;
  major: string;
  degree?: string;
  start: string;
  end?: string;
}

export interface ResumeContent {
  profile: ResumeProfile;
  skillGroups: SkillGroup[];
  experiences: ExperienceItem[];
  projects: ProjectItem[];
  education: EducationItem[];
}

/** GET /api/v1/resume/:slug 响应 */
export interface PublishedResumeResponse {
  resume: { slug: string; title: string; updatedAt: string };
  version: {
    id: string;
    number: number;
    label: string | null;
    status: "published";
    publishedAt: string | null;
  };
  content: ResumeContent;
}
