import { AiToolIcon, hasAiToolIcon } from "@/components/resume/ai-tool-icon";
import { Reveal } from "@/components/resume/reveal";
import type { SkillGroup, SkillItem } from "@/lib/resume-types";

/**
 * 熟练度分层：不自评精确分数（97/95 这类两位数精度既不可验证又不谦逊），
 * 只按三档文字分层，进度条长度仍由 level 驱动呈现相对差异。
 */
const TIER_MAX: Record<string, number> = { 核心: 92, 熟练: 76, 了解: 58 };
function tierOf(level: number): keyof typeof TIER_MAX {
  return level >= 85 ? "核心" : level >= 70 ? "熟练" : "了解";
}

/** 熟练度三档标签（SkillBar / SkillBadge 共用；level 缺失不渲染） */
function SkillLevelTag({ level }: { level: number | undefined }) {
  if (level === undefined) return null;
  return <span className="skill-level">{tierOf(level)}</span>;
}

/** 熟练度细进度条（轨道 3px，进入视口一次性生长；level 缺失不渲染） */
function SkillTrack({ level }: { level: number | undefined }) {
  if (level === undefined) return null;
  return (
    <div className="skill-track">
      <div
        className="skill-fill"
        style={{ "--level": `${TIER_MAX[tierOf(level)]}%` } as React.CSSProperties}
      />
    </div>
  );
}

/** 单项技能：名称 + 熟练度细进度条 */
function SkillBar({ skill }: { skill: SkillItem }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-[15px] leading-6 text-[var(--text)]/85">
          <AiToolIcon name={skill.name} className="size-4 shrink-0 text-[var(--accent)]" />
          {skill.name}
        </span>
        <SkillLevelTag level={skill.level} />
      </div>
      <SkillTrack level={skill.level} />
    </li>
  );
}

/** AI 工具徽章：图标打头的卡片形态，配同样的熟练度条 */
function SkillBadge({ skill }: { skill: SkillItem }) {
  return (
    <li className="skill-badge">
      <AiToolIcon name={skill.name} className="size-[22px] shrink-0 text-[var(--accent)]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[14.5px] font-medium text-[var(--text)]/90">
            {skill.name}
          </span>
          <SkillLevelTag level={skill.level} />
        </div>
        <SkillTrack level={skill.level} />
      </div>
    </li>
  );
}

/** 运行时归一化：兼容旧版本内容里 skills 仍是纯字符串的形态（回滚保险） */
function normalizeSkill(skill: SkillItem | string): SkillItem {
  return typeof skill === "string" ? { name: skill } : skill;
}

/**
 * 技能：规格表形态——分组名（+组注释）在左，条目在右。
 * AI 工具为主的组自动切换为徽章网格；其余组为双列细进度条。
 */
export function SkillSpec({ groups }: { groups: SkillGroup[] }) {
  return (
    <section id="skills" className="py-20 md:py-28" aria-labelledby="skills-heading">
      <div className="mx-auto max-w-[1080px] px-5 sm:px-6">
        <h2
          id="skills-heading"
          className="mb-10 text-4xl font-semibold tracking-tight md:mb-14 md:text-[2.6rem]"
        >
          技能
        </h2>

        {groups.map((rawGroup, index) => {
          const group = { ...rawGroup, skills: rawGroup.skills.map(normalizeSkill) };
          const iconCount = group.skills.filter((skill) => hasAiToolIcon(skill.name)).length;
          const badgeMode = iconCount >= Math.max(2, Math.ceil(group.skills.length / 2));
          return (
            <Reveal key={group.name} delay={Math.min(index * 60, 240)}>
              <div className="spec-grid border-t border-[var(--hairline)] py-6 md:py-8">
                <div>
                  <h3 className="text-[15px] font-semibold text-[var(--text)]/90">
                    {group.name}
                  </h3>
                  {group.note && (
                    <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-dim)]">
                      {group.note}
                    </p>
                  )}
                </div>
                <ul
                  className={
                    badgeMode
                      ? "grid gap-3 sm:grid-cols-2"
                      : "grid gap-x-10 gap-y-4 sm:grid-cols-2"
                  }
                >
                  {(badgeMode
                    ? group.skills.map((skill) => (
                        <SkillBadge key={skill.name} skill={skill} />
                      ))
                    : group.skills.map((skill) => <SkillBar key={skill.name} skill={skill} />)
                  )}
                </ul>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
