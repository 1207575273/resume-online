"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { href: "#top", label: "首页" },
  { href: "#skills", label: "技能" },
  { href: "#projects", label: "项目" },
  { href: "#experience", label: "经历" },
  { href: "#education", label: "教育" },
];

/** 侧边骨架导航（scrollspy）：桌面固定右侧圆点，当前章节高亮，点击直达 */
export function SideDots() {
  const [active, setActive] = useState(SECTIONS[0].href);

  useEffect(() => {
    const ids = SECTIONS.map((s) => s.href.slice(1));
    const observer = new IntersectionObserver(
      (entries) => {
        // 取视口内最靠上的命中区段
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(`#${visible[0].target.id}`);
      },
      { rootMargin: "-30% 0px -55% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="章节导航"
      className="no-print fixed top-1/2 right-5 z-40 hidden -translate-y-1/2 flex-col gap-3 lg:flex"
    >
      {SECTIONS.map((section) => {
        const isActive = active === section.href;
        return (
          <a
            key={section.href}
            href={section.href}
            aria-label={section.label}
            aria-current={isActive ? "true" : undefined}
            className="group flex items-center justify-end gap-2.5 py-1"
          >
            <span
              className={`text-[12px] tracking-wide transition-all duration-300 ${
                isActive
                  ? "text-[var(--text)] opacity-100"
                  : "text-[var(--text-dim)] opacity-0 group-hover:opacity-70"
              }`}
            >
              {section.label}
            </span>
            <span
              className={`block rounded-full transition-all duration-300 ${
                isActive
                  ? "size-2.5 bg-[var(--accent)] shadow-[0_0_0_4px_var(--accent)]/15"
                  : "size-1.5 bg-[var(--text-dim)]/50 group-hover:bg-[var(--text-dim)]"
              }`}
            />
          </a>
        );
      })}
    </nav>
  );
}
