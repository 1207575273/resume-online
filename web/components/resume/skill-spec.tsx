import type { SkillGroup } from "@/lib/resume-types";

/** 技能：规格表形态——分组名在左，条目在右，发丝线分行 */
export function SkillSpec({ groups }: { groups: SkillGroup[] }) {
  return (
    <section
      id="skills"
      className="border-t border-[var(--hairline)] py-24 md:py-32"
      aria-labelledby="skills-heading"
    >
      <div className="mx-auto max-w-[1080px] px-6">
        <h2
          id="skills-heading"
          className="mb-10 text-4xl font-semibold tracking-tight md:text-[2.75rem]"
        >
          技能
        </h2>

        <div>
          {groups.map((group) => (
            <div key={group.name} className="spec-grid border-t border-[var(--hairline)] py-5">
              <h3 className="text-[15px] font-semibold text-[var(--text)]/90">{group.name}</h3>
              <p className="leading-loose text-[15.5px] text-[var(--text-dim)]">
                {group.skills.join("　")}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
