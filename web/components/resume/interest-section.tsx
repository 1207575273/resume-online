import { Clapperboard, Map, Music4 } from "lucide-react";
import type { ResumeProfile } from "@/lib/resume-types";

/**
 * 兴趣与画像:轻量一行式小节(教育区之后)。
 * 爱好 chips(图标+词)+ MBTI 职业人格画像徽章;数据来自简历 API,缺省不渲染。
 */

const INTEREST_ICONS: Array<[RegExp, React.ReactNode]> = [
  [/电影|影/, <Clapperboard key="film" className="size-[15px]" aria-hidden />],
  [/音乐|乐|歌/, <Music4 key="music" className="size-[15px]" aria-hidden />],
  [/旅游|旅行|户外/, <Map key="travel" className="size-[15px]" aria-hidden />],
];

const MBTI_WORDS: Record<string, string> = {
  ESTP: "企业家型 · 务实果断,快节奏中抓住机会",
  ENTJ: "指挥官型 · 目标驱动,天然的组织者",
  ENTP: "辩论家型 · 好奇驱动,擅长破局创新",
  INTJ: "建筑师型 · 深谋远虑,独立而坚定",
};

export function InterestSection({ profile }: { profile: ResumeProfile }) {
  const { interests, mbti } = profile;
  if ((!interests || interests.length === 0) && !mbti) return null;

  return (
    <section aria-label="兴趣与画像" className="pb-16 md:pb-20">
      <div className="mx-auto max-w-[1080px] px-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5 border-t border-[var(--hairline)] pt-8">
          {interests && interests.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[13px] font-semibold tracking-[0.14em] text-[var(--text-dim)] uppercase">
                兴趣
              </span>
              {interests.map((item) => {
                const icon = INTEREST_ICONS.find(([re]) => re.test(item))?.[1];
                return (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] px-3.5 py-1.5 text-[13.5px] text-[var(--text)] transition-colors duration-200 hover:border-[rgba(145,230,0,0.5)] hover:text-[#5a7a00]"
                  >
                    {icon}
                    {item}
                  </span>
                );
              })}
            </div>
          )}
          {mbti && (
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-semibold tracking-[0.14em] text-[var(--text-dim)] uppercase">
                画像
              </span>
              <span className="inline-flex items-baseline gap-2 rounded-full bg-[rgba(208,249,59,0.2)] px-4 py-1.5 shadow-[inset_0_0_0_1px_rgba(145,230,0,0.45)]">
                <span className="text-[14px] font-bold tracking-wide text-[#5a7a00]">{mbti}</span>
                <span className="text-[12px] text-[var(--text-dim)]">
                  {MBTI_WORDS[mbti] ?? "职业人格画像"}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
