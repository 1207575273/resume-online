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
  /** 定位标签（如「AI 原生人才」），Hero 区展示；旧版本缺省为空 */
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
  /** 规范化为对象数组；校验同时接受旧版纯字符串形态（历史快照兼容） */
  skills: SkillItem[];
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
    tags: strArray(profileRaw, "tags", "content.profile", true),
  };

  const skillGroups: SkillGroup[] = arr(root, "skillGroups", "content").map((item) => {
    const group = asRecord(item, "content.skillGroups[]");
    const skills: SkillItem[] = arr(group, "skills", "skillGroups[]").map((entry) => {
      // 旧版快照是纯字符串数组；新版是 {name, level}
      if (typeof entry === "string") return { name: entry };
      const skill = asRecord(entry, "content.skillGroups[].skills[]");
      const raw = skill.level;
      let level: number | undefined;
      if (raw !== undefined && raw !== null) {
        if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 100) {
          throw new ValidationError("skillGroups[].skills[].level 应为 0-100 的数值");
        }
        level = raw;
      }
      return { name: str(skill, "name", "skills[]")!, level };
    });
    return {
      name: str(group, "name", "skillGroups[]")!,
      note: str(group, "note", "skillGroups[]", true),
      skills,
    };
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
