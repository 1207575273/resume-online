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

/** 单项技能：level 为 0-100 熟练度（进度条），缺省 = 只展示名称不打分 */
export interface SkillItem {
  name: string;
  level?: number;
}

export interface SkillGroup {
  name: string;
  /** 组级注释一行（如「自费 Claude Code 投入 ¥30,000+」） */
  note?: string;
  skills: SkillItem[];
}

export interface ExperienceItem {
  company: string;
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
