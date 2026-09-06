/** 成果列表：短横线标记（规格表语义），项目卡与经历区共用同一套规格；外距由调用方给 */
export function Highlights({ items, className = "mt-4" }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={`space-y-2.5 ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed">
          <span
            aria-hidden
            className="mt-[0.7em] h-px w-3.5 shrink-0 bg-[var(--accent)]/60"
          />
          <span className="text-[var(--text)]/85">{item}</span>
        </li>
      ))}
    </ul>
  );
}
