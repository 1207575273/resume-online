"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "#experience", label: "经历" },
  { href: "#skills", label: "技能" },
  { href: "#projects", label: "项目" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      // 回顶图标:滚过约一屏(hero 之后)才出现——顶部时回顶无意义,不显示
      setShowTop(window.scrollY > window.innerHeight * 0.7);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`site-nav no-print ${scrolled ? "scrolled" : ""}`} aria-label="站内导航">
      <div className="mx-auto flex max-w-[1080px] items-center justify-between px-6">
        <a
          href="#top"
          aria-label="回到顶部"
          title="回到顶部"
          className={`flex size-9 items-center justify-center rounded-full transition-all duration-300 ${
            showTop
              ? "pointer-events-auto text-[var(--text-dim)] opacity-100 hover:bg-[rgba(208,249,59,0.22)] hover:text-[#5a7a00]"
              : "pointer-events-none opacity-0"
          }`}
        >
          <ArrowUp className="size-[18px]" aria-hidden />
        </a>
        <div className="flex items-center gap-5 md:gap-7">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="nav-link">
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("resume:contact"))}
            className="nav-link mr-2 hidden cursor-pointer sm:inline"
          >
            联系
          </button>
        </div>
      </div>
    </nav>
  );
}
