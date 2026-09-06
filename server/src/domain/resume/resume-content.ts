import { ValidationError } from "../shared/domain-error";

/**
 * 简历内容值对象 —— 整份简历的不可变快照，作为单一 JSON 存入 ResumeVersion.content。
 * 这是前后端共同遵守的数据契约（web 侧镜像定义在 web/src/lib/resume-types.ts）。
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
  start: string; // 如 "2024-07"
  end?: string; // 缺省 = 至今
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

// ---------- 轻量结构校验（刻意不引 zod，规则足够简单） ----------

const asRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError(`${path} 应为对象`);
  }
  return value as Record<string, unknown>;
};

const str = (obj: Record<string, unknown>, key: string, path: string, optional = false): string | undefined => {
  const value = obj[key];
  if (value === undefined || value === null || value === "") {
    if (optional) return undefined;
    throw new ValidationError(`${path}.${key} 缺失`);
  }
  if (typeof value !== "string") throw new ValidationError(`${path}.${key} 应为字符串`);
  return value;
};

const strArray = (obj: Record<string, unknown>, key: string, path: string, optional = false): string[] => {
  const value = obj[key];
  if (value === undefined || value === null) {
    if (optional) return [];
    throw new ValidationError(`${path}.${key} 缺失`);
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ValidationError(`${path}.${key} 应为字符串数组`);
  }
  return value as string[];
};

const arr = (obj: Record<string, unknown>, key: string, path: string): unknown[] => {
  const value = obj[key];
  if (!Array.isArray(value)) throw new ValidationError(`${path}.${key} 应为数组`);
  return value;
};

/** 工厂：外部输入（HTTP 请求 / 数据库行）→ 校验通过的不可变 ResumeContent */
export function createResumeContent(raw: unknown): ResumeContent {
  const root = asRecord(raw, "content");
  const profileRaw = asRecord(root.profile, "content.profile");

  const profile: ResumeProfile = {
    name: str(profileRaw, "name", "content.profile")!,
    headline: str(profileRaw, "headline", "content.profile")!,
    summary: str(profileRaw, "summary", "content.profile")!,
    location: str(profileRaw, "location", "content.profile", true),
    email: str(profileRaw, "email", "content.profile", true),
    links: arr(profileRaw, "links", "content.profile").map((item) => {
      const link = asRecord(item, "content.profile.links[]");
      return { label: str(link, "label", "links[]")!, url: str(link, "url", "links[]")! };
    }),
  };

  const skillGroups: SkillGroup[] = arr(root, "skillGroups", "content").map((item) => {
    const group = asRecord(item, "content.skillGroups[]");
    return { name: str(group, "name", "skillGroups[]")!, skills: strArray(group, "skills", "skillGroups[]") };
  });

  const experiences: ExperienceItem[] = arr(root, "experiences", "content").map((item) => {
    const exp = asRecord(item, "content.experiences[]");
    return {
      company: str(exp, "company", "experiences[]")!,
      role: str(exp, "role", "experiences[]")!,
      start: str(exp, "start", "experiences[]")!,
      end: str(exp, "end", "experiences[]", true),
      summary: str(exp, "summary", "experiences[]", true),
      highlights: strArray(exp, "highlights", "experiences[]"),
      tech: strArray(exp, "tech", "experiences[]"),
    };
  });

  const projects: ProjectItem[] = arr(root, "projects", "content").map((item) => {
    const project = asRecord(item, "content.projects[]");
    return {
      name: str(project, "name", "projects[]")!,
      description: str(project, "description", "projects[]")!,
      highlights: strArray(project, "highlights", "projects[]", true),
      tech: strArray(project, "tech", "projects[]", true),
      link: str(project, "link", "projects[]", true),
    };
  });

  const education: EducationItem[] = arr(root, "education", "content").map((item) => {
    const edu = asRecord(item, "content.education[]");
    return {
      school: str(edu, "school", "education[]")!,
      major: str(edu, "major", "education[]")!,
      degree: str(edu, "degree", "education[]", true),
      start: str(edu, "start", "education[]")!,
      end: str(edu, "end", "education[]", true),
    };
  });

  return deepFreeze({
    profile,
    skillGroups,
    experiences,
    projects,
    education,
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
