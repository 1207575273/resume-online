import { AiToolIcon, hasAiToolIcon } from "@/components/resume/ai-tool-icon";
import { Reveal } from "@/components/resume/reveal";
import type { SkillGroup, SkillItem } from "@/lib/resume-types";

/**
 * 技能：证据型规格表（skills-as-evidence）。
 * - 图标组（≥2 项带 AI 工具图标，如 AI 工作台）：保留芯片流——图标是辨识度资产，
 *   核心档（level≥85）实底渐变、熟练档描边；note 作为组级证据行
 * - 规格组：有 proof 的核心项渲染「技能 —— 生产证据」行；其余项收进「另有」灰字流
 * - level 仅用于核心档判定与排序，不再渲染任何进度条
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

        <div className="border-t border-[var(--hairline)]">
          {groups.map((rawGroup, index) => {
            const group = { ...rawGroup, skills: rawGroup.skills.map(normalizeSkill) };
            const iconCount = group.skills.filter((skill) => hasAiToolIcon(skill.name)).length;
            const isIconGroup = iconCount >= 2;
            return (
              <Reveal key={group.name} delay={Math.min(index * 60, 240)}>
                <div className="skill-block">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="skill-gname">{group.name}</h3>
                    {group.note && <p className="skill-note">{group.note}</p>}
                  </div>
                  {isIconGroup ? (
                    <ToolChips skills={group.skills} />
                  ) : (
                    <EvidenceRows skills={group.skills} />
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** 图标组芯片：AI 工具图标 + 名称；核心档实底渐变，熟练档描边 */
function ToolChips({ skills }: { skills: SkillItem[] }) {
  return (
    <ul className="tool-chips">
      {skills.map((skill) => (
        <li
          key={skill.name}
          className={`tool-chip${(skill.level ?? 0) >= 85 ? " core" : ""}`}
        >
          <AiToolIcon name={skill.name} className="size-[18px] shrink-0" aria-hidden />
          <span>{skill.name}</span>
        </li>
      ))}
    </ul>
  );
}

/** 规格组：核心项证据行 + 次要项「另有」灰字流 */
function EvidenceRows({ skills }: { skills: SkillItem[] }) {
  const core = skills.filter((skill) => skill.proof);
  const rest = skills.filter((skill) => !skill.proof);

  if (core.length === 0) {
    return (
      <p className="ev-rest">
        {skills.map((skill) => skill.name).join(" · ")}
      </p>
    );
  }

  return (
    <div>
      <ul>
        {core.map((skill) => (
          <li key={skill.name} className="ev-row">
            <span className="ev-skill">{skill.name}</span>
            <span className="ev-dash" aria-hidden />
            <span className="ev-proof">{skill.proof}</span>
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <p className="ev-rest">另有 {rest.map((skill) => skill.name).join(" · ")}</p>
      )}
    </div>
  );
}

/** 运行时归一化：兼容旧版本内容里 skills 仍是纯字符串的形态（回滚保险） */
function normalizeSkill(skill: SkillItem | string): SkillItem {
  return typeof skill === "string" ? { name: skill } : skill;
}
