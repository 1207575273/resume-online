"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Mail, MapPin, Phone, X } from "lucide-react";
import type { ResumeProfile } from "@/lib/resume-types";

/**
 * 联系方式卡片:Hero「联系方式」按钮与导航「联系」通过自定义事件 resume:contact
 * 触发打开;ESC / 点击遮罩 / 关闭按钮关闭。暖白底 + lime 点缀,与全站色系统一。
 */
export const CONTACT_EVENT = "resume:contact";
const dispatchContact = () => window.dispatchEvent(new CustomEvent(CONTACT_EVENT));

interface ContactRow {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}

export function ContactCard({ profile }: { profile: ResumeProfile }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(CONTACT_EVENT, onOpen);
    return () => window.removeEventListener(CONTACT_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setOpen(false);
      // 焦点圈闭:Tab 循环在卡片内,不跑到背景元素
      if (e.key !== "Tab") return;
      const dialog = document.querySelector('[role="dialog"] > div');
      if (!dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  if (!open) return null;

  const phoneLink = profile.links.find((l) => /^tel:/i.test(l.url ?? ""));
  const phone = phoneLink?.label.replace(/^电话\s*/, "") ?? phoneLink?.url?.replace("tel:", "");
  const otherLinks = profile.links.filter((l) => l !== phoneLink);

  const rows: ContactRow[] = [
    phone && {
      icon: <Phone className="size-[18px]" aria-hidden />,
      label: "电话",
      value: phone,
      href: `tel:${phone}`,
    },
    profile.email && {
      icon: <Mail className="size-[18px]" aria-hidden />,
      label: "邮箱",
      value: profile.email,
      href: `mailto:${profile.email}`,
    },
    ...otherLinks.map((l) => ({
      icon: <ArrowUpRight className="size-[18px]" aria-hidden />,
      label: l.label.split("·")[0]?.trim() ?? "链接",
      value: l.label.includes("·") ? l.label.split("·").slice(1).join("·").trim() : l.url ?? l.label,
      href: l.url ?? undefined,
    })),
  ].filter(Boolean) as ContactRow[];

  return (
    <div
      className="no-print fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="联系方式"
      onClick={close}
      style={{ animation: "contact-fade 0.22s ease both" }}
    >
      <div
        className="contact-card relative w-full max-w-[380px] rounded-3xl border border-[rgba(145,230,0,0.35)] bg-[#ffffff] p-7 shadow-[0_28px_80px_-24px_rgba(37,44,53,0.45)]"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "contact-rise 0.26s cubic-bezier(0.2,0.65,0.25,1) both" }}
      >
        {/* 头部:渐变顶线 + 标题 + 关闭 */}
        <div
          className="absolute inset-x-0 top-0 h-[3px] rounded-t-3xl"
          style={{ background: "linear-gradient(90deg,#91e600,#a8ff1a,#d0f93b)" }}
          aria-hidden
        />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[1.35rem] font-bold tracking-wide text-[#0e0e0e]">联系我</h3>
            <p className="mt-1 text-[12.5px] text-[#6f6f68]">
              {profile.name} · {profile.headline.split("·")[0]?.trim()}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="关闭"
            className="contact-row flex size-9 cursor-pointer items-center justify-center rounded-full text-[#8a8a85] transition-colors duration-200 hover:bg-[rgba(208,249,59,0.25)] hover:text-[#0e0e0e]"
          >
            <X className="size-[18px]" aria-hidden />
          </button>
        </div>

        {/* 条目 */}
        <ul className="mt-5 space-y-1.5">
          {rows.map((row) => {
            const inner = (
              <>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[rgba(208,249,59,0.28)] text-[#5a7a00] shadow-[inset_0_0_0_1px_rgba(145,230,0,0.4)]">
                  {row.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold tracking-wide text-[#8a8a85]">{row.label}</span>
                  <span className="block truncate text-[15px] font-medium text-[#1a1a16]">{row.value}</span>
                </span>
              </>
            );
            return (
              <li key={row.label}>
                {row.href ? (
                  <a
                    href={row.href}
                    target={/^https?:/i.test(row.href) ? "_blank" : undefined}
                    rel="noreferrer noopener"
                    onClick={close}
                    className="contact-row flex items-center gap-3.5 rounded-2xl border border-transparent px-3 py-2.5 transition-all duration-200 hover:border-[rgba(145,230,0,0.45)] hover:bg-[rgba(244,251,232,0.6)]"
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="flex items-center gap-3.5 px-3 py-2.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>

        {/* 底部:位置 + 装饰 */}
        {profile.location && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-[#8a8a85]">
            <MapPin className="size-3.5 text-[#91e600]" aria-hidden />
            {profile.location}
          </p>
        )}
        <p className="mt-3 text-center text-[11px] tracking-[0.2em] text-[#b8b8b0]">期待与您交流</p>
      </div>
    </div>
  );
}

export { dispatchContact };
