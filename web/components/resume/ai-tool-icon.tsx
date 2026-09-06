/**
 * AI 工具徽标：统一手绘线条风（24 viewBox / stroke currentColor），
 * 形似即可、不追求官方像素复刻。按名称关键字匹配，认不出返回 null。
 */

const ICONS: Array<[RegExp, React.ReactNode]> = [
  // Cursor：闪电箭头
  [
    /cursor/i,
    <path
      key="cursor"
      d="M13.5 2.5 4.5 13.2h5.4l-1.4 8.3 9-10.7h-5.4l1.4-8.3Z"
      strokeLinejoin="round"
    />,
  ],
  // Codex：代码括号
  [
    /codex/i,
    <g key="codex">
      <path d="M8.5 6 4 12l4.5 6M15.5 6 20 12l-4.5 6" />
    </g>,
  ],
  // OpenClaw：三道爪痕
  [
    /openclaw|claw/i,
    <g key="claw">
      <path d="M6 4.5c2 5 2 8.5 0 12M12 3.5c2 5.5 2 9.5 0 13M18 4.5c-2 5-2 8.5 0 12" />
    </g>,
  ],
  // Workbody：智能体机器人
  [
    /workbody/i,
    <g key="workbody">
      <rect x="5" y="8.5" width="14" height="10" rx="3" />
      <path d="M9.5 13h.01M14.5 13h.01" strokeWidth="2.4" />
      <path d="M12 8.5V6" />
      <circle cx="12" cy="4.5" r="1.2" />
    </g>,
  ],
  // Claude / Claude Code：放射星（Anthropic 太阳纹）
  [
    /claude/i,
    <g key="claude">
      <path d="M12 3.2v4.2M12 16.6v4.2M3.2 12h4.2M16.6 12h4.2M5.8 5.8l3 3M15.2 15.2l3 3M18.2 5.8l-3 3M8.8 15.2l-3 3" />
      <circle cx="12" cy="12" r="2.1" />
    </g>,
  ],
  // ChatGPT / OpenAI：交叠三角六芒结
  [
    /gpt|openai/i,
    <g key="gpt">
      <path d="M12 3.6 19 15.8H5L12 3.6Z" strokeLinejoin="round" />
      <path d="M12 20.4 5 8.2h14L12 20.4Z" strokeLinejoin="round" />
    </g>,
  ],
  // GitHub Copilot：护目镜
  [
    /copilot/i,
    <g key="copilot">
      <rect x="3.5" y="8" width="7" height="5.5" rx="2.2" />
      <rect x="13.5" y="8" width="7" height="5.5" rx="2.2" />
      <path d="M10.5 10.2h3" />
      <path d="M6 16.5c1.8 1.6 4 2.4 6 2.4s4.2-.8 6-2.4" />
    </g>,
  ],
  // Windsurf：帆 + 波浪
  [
    /windsurf/i,
    <g key="windsurf">
      <path d="M6 3.5 17.5 13H8.6L6 3.5Z" strokeLinejoin="round" />
      <path d="M5 17.5c1.4 1 2.8 1 4.2 0s2.8-1 4.2 0 2.8 1 4.2 0" />
      <path d="M7 20.5c1.2.8 2.4.8 3.6 0s2.4-.8 3.6 0" />
    </g>,
  ],
  // Gemini：四角闪星
  [
    /gemini/i,
    <path
      key="gemini"
      d="M12 3c.6 3.9 2.5 6.4 6.5 7.5v1c-4 1.1-5.9 3.6-6.5 7.5h-1c-.6-3.9-2.5-6.4-6.5-7.5v-1C8.5 9.4 10.4 6.9 11 3h1Z"
      strokeLinejoin="round"
    />,
  ],
  // Kimi / DeepSeek / 通义等：通用闪星
  [
    /kimi|deepseek|qwen|doubao/i,
    <path
      key="spark"
      d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.2l-1.8-5.6-5.7-1.8L10.2 9 12 3.5Z"
      strokeLinejoin="round"
    />,
  ],
];

/** 是否有匹配的 AI 工具图标（用于技能组切换徽章/进度条形态） */
export function hasAiToolIcon(name: string): boolean {
  return ICONS.some(([pattern]) => pattern.test(name));
}

export function AiToolIcon({ name, className }: { name: string; className?: string }) {
  for (const [pattern, icon] of ICONS) {
    if (pattern.test(name)) {
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          className={className}
        >
          {icon}
        </svg>
      );
    }
  }
  return null;
}
