/**
 * Hero 极光背景：多层流动渐变绸缎（大 blob + blur，纯 CSS 合成器动画，零 JS）
 * + 径向渐隐的工程网格线（档案质感）。离题的粒子散点已退役。
 * prefers-reduced-motion 时 blob 静止，仅保留静态光晕。
 */
export function AuroraField() {
  return (
    <div aria-hidden className="aurora-field">
      <div className="aurora-blob ab-1" />
      <div className="aurora-blob ab-2" />
      <div className="aurora-blob ab-3" />
      <div className="aurora-grid" />
    </div>
  );
}
