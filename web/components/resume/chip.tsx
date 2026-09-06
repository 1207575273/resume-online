/** 技术栈 / 技能芯片：胶囊形态，配色由 globals.css 的 .chip 令牌控制 */
export function Chip({ children }: { children: React.ReactNode }) {
  return <li className="chip">{children}</li>;
}
