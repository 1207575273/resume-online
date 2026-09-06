"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/** 暗色为默认；切换写入 localStorage，layout 内联脚本会在首帧前恢复 */
export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* 隐私模式下忽略 */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="切换主题"
      className="no-print flex size-11 cursor-pointer items-center justify-center rounded-full text-[var(--text-dim)] transition-colors duration-200 hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
    >
      {dark ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
    </button>
  );
}
