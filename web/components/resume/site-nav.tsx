"use client";

import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/resume/theme-toggle";

const LINKS = [
  { href: "#experience", label: "经历" },
  { href: "#skills", label: "技能" },
  { href: "#projects", label: "项目" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`site-nav no-print ${scrolled ? "scrolled" : ""}`} aria-label="站内导航">
      <div className="mx-auto flex h-full max-w-[1080px] items-center justify-between px-6">
        <a href="#top" className="text-[15px] font-semibold tracking-wide">
          杨胜
        </a>
        <div className="flex items-center gap-5 md:gap-7">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="nav-link">
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href="mailto:yang1207575273@163.com"
            className="nav-link mr-2 hidden sm:inline"
          >
            联系
          </a>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
