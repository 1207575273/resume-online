/**
 * 程序化生成的项目视觉图：每个项目一张专属 SVG。
 * 全部矢量、零外部资源；青紫渐变点睛，其余用 currentColor。
 */

function ArtDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#2997ff" />
        <stop offset="55%" stopColor="#7d5fff" />
        <stop offset="100%" stopColor="#bf5af2" />
      </linearGradient>
    </defs>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1,
  opacity: 0.22,
} as const;

/** 0 渲染引擎：文档矩阵 + 涌出的报表 */
function RenderEngineArt({ id }: { id: string }) {
  const columns = [38, 62, 30, 74, 50, 84, 44, 66, 56, 78, 36, 70];
  return (
    <>
      {columns.map((height, index) => (
        <rect
          key={index}
          x={52 + index * 26}
          y={132 - height * 0.9}
          width="15"
          height={height * 0.9}
          rx="3"
          fill={index === 5 || index === 7 ? `url(#${id}-grad)` : "currentColor"}
          opacity={index === 5 || index === 7 ? 0.85 : 0.16}
        />
      ))}
      <rect x="42" y="140" width="316" height="1.5" {...stroke} />
      <rect x="252" y="26" width="86" height="64" rx="8" fill={`url(#${id}-grad)`} opacity="0.9" />
      <rect x="266" y="40" width="46" height="5" rx="2.5" fill="#050507" opacity="0.55" />
      <rect x="266" y="52" width="58" height="5" rx="2.5" fill="#050507" opacity="0.35" />
      <rect x="266" y="64" width="36" height="5" rx="2.5" fill="#050507" opacity="0.35" />
    </>
  );
}

/** 1 数据平台：分片矩阵 */
function ShardMatrixArt({ id }: { id: string }) {
  const cells = [];
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 9; column++) {
      const isAccent = (row * 9 + column) % 13 === 4;
      cells.push(
        <rect
          key={`${row}-${column}`}
          x={56 + column * 33}
          y={44 + row * 33}
          width="24"
          height="24"
          rx="5"
          fill={isAccent ? `url(#${id}-grad)` : "currentColor"}
          opacity={isAccent ? 0.9 : 0.1 + ((row + column) % 4) * 0.04}
        />,
      );
    }
  }
  return (
    <>
      {cells}
      <path d="M 60 172 L 340 76" {...stroke} strokeDasharray="3 5" />
      <path d="M 60 76 L 340 172" {...stroke} strokeDasharray="3 5" />
    </>
  );
}

/** 2 CCode：终端窗 */
function TerminalArt({ id }: { id: string }) {
  return (
    <>
      <rect x="72" y="36" width="256" height="140" rx="12" {...stroke} />
      <circle cx="92" cy="54" r="3" fill="currentColor" opacity="0.25" />
      <circle cx="104" cy="54" r="3" fill="currentColor" opacity="0.25" />
      <circle cx="116" cy="54" r="3" fill="currentColor" opacity="0.25" />
      <path d="M 90 78 l 10 8 l -10 8" {...stroke} strokeWidth="2" opacity="0.9" style={{ stroke: `url(#${id}-grad)` }} />
      <rect x="108" y="80" width="130" height="4" rx="2" fill="currentColor" opacity="0.16" />
      <rect x="108" y="96" width="180" height="4" rx="2" fill={`url(#${id}-grad)`} opacity="0.65" />
      <path d="M 90 118 l 10 8 l -10 8" {...stroke} style={{ stroke: `url(#${id}-grad)` }} strokeWidth="2" opacity="0.9" />
      <rect x="108" y="120" width="96" height="4" rx="2" fill="currentColor" opacity="0.16" />
      <rect x="108" y="136" width="60" height="4" rx="2" fill="currentColor" opacity="0.16" />
      <rect x="176" y="134" width="10" height="12" fill={`url(#${id}-grad)`} opacity="0.9" />
    </>
  );
}

/** 3 sip-cc：取景框 + 帧条 */
function ViewfinderArt({ id }: { id: string }) {
  const corner = "M 96 60 v -16 h 16 M 304 44 h 16 v 16 M 320 152 v 16 h -16 M 112 168 h -16 v -16";
  return (
    <>
      <path d={corner} {...stroke} strokeWidth="2" opacity="0.5" />
      <rect x="120" y="70" width="176" height="76" rx="6" fill={`url(#${id}-grad)`} opacity="0.28" />
      <rect x="120" y="70" width="176" height="76" rx="6" {...stroke} />
      {[0, 1, 2, 3, 4].map((index) => (
        <rect
          key={index}
          x={96 + index * 44}
          y={158}
          width="32"
          height="20"
          rx="3"
          fill={index === 2 ? `url(#${id}-grad)` : "currentColor"}
          opacity={index === 2 ? 0.9 : 0.14}
        />
      ))}
      <circle cx="272" cy="102" r="14" fill="none" stroke={`url(#${id}-grad)`} strokeWidth="2" opacity="0.9" />
      <circle cx="272" cy="102" r="4" fill={`url(#${id}-grad)`} opacity="0.9" />
    </>
  );
}

/** 4 本站：容器拓扑 */
function TopologyArt({ id }: { id: string }) {
  return (
    <>
      <circle cx="200" cy="52" r="14" fill={`url(#${id}-grad)`} opacity="0.9" />
      <circle cx="96" cy="128" r="11" fill="currentColor" opacity="0.18" />
      <circle cx="200" cy="128" r="11" fill="currentColor" opacity="0.18" />
      <circle cx="304" cy="128" r="11" fill="currentColor" opacity="0.18" />
      <path d="M 192 63 L 102 118 M 200 63 L 200 117 M 208 63 L 298 118" {...stroke} />
      <path d="M 96 139 L 96 168 M 200 139 L 200 168 M 304 139 L 304 168" {...stroke} strokeDasharray="2 4" />
      <rect x="76" y="166" width="40" height="7" rx="3.5" fill="currentColor" opacity="0.14" />
      <rect x="182" y="166" width="36" height="7" rx="3.5" fill={`url(#${id}-grad)`} opacity="0.7" />
      <rect x="286" y="166" width="36" height="7" rx="3.5" fill="currentColor" opacity="0.14" />
    </>
  );
}

const ARTWORKS = [RenderEngineArt, ShardMatrixArt, TerminalArt, ViewfinderArt, TopologyArt];

export function ProjectArt({ index }: { index: number }) {
  const Artwork = ARTWORKS[index % ARTWORKS.length];
  const gradientId = `pa-${index}`;
  return (
    <svg
      viewBox="0 0 400 212"
      className="tile-art"
      role="img"
      aria-label="项目视觉图"
      preserveAspectRatio="xMidYMid slice"
    >
      <ArtDefs id={gradientId} />
      <rect width="400" height="212" fill="var(--surface-2)" />
      <g className="art-accent">
        <Artwork id={gradientId} />
      </g>
    </svg>
  );
}
