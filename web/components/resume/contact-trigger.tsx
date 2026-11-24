"use client";

import type { ReactNode } from "react";
import { CONTACT_EVENT } from "@/components/resume/contact-card";

/**
 * 联系方式触发器:派发全局事件打开 ContactCard。
 * 独立成 client 组件,使 server 组件(Hero)也能安全引用。
 */
export function ContactTrigger({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(CONTACT_EVENT))}
      className={className}
    >
      {children}
    </button>
  );
}
