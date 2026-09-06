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
}

export interface SkillGroup {
  name: string;
  skills: string[];
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
