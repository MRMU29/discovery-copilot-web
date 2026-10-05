import type { SVGProps } from 'react'

/**
 * 自绘内联 SVG 图标集（命令 7）：简单几何 path，无外部素材依赖，随主题
 * currentColor 着色。品牌 logo 用 /brand-icon.jpg（位图素材），不在此列。
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

/** 问号圆点——字段级填写引导的展开按钮。 */
export function HelpCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.33c-.75.3-.9.92-.9 1.67" />
      <path d="M12 17h.01" />
    </Svg>
  )
}

/** 靶心——OST outcome 节点（目标结果）。 */
export function TargetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** 对话气泡——OST opportunity 节点（客户机会/痛点）。 */
export function MessageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12Z" />
      <path d="M9 12h.01M13 12h.01M17 12h.01" strokeWidth={2.4} />
    </Svg>
  )
}

/** 方块拼图——OST solution 节点（解决方案）。 */
export function BlocksIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <path d="M16.5 13v7M13 16.5h7" />
    </Svg>
  )
}

/** 烧瓶——OST experiment 节点（验证实验）。 */
export function FlaskIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3h4" />
      <path d="M10 3v6l-4.8 8.2A2 2 0 0 0 6.9 20h10.2a2 2 0 0 0 1.7-2.8L14 9V3" />
      <path d="M8 15h8" />
    </Svg>
  )
}

/** 复制——Relay 三步引导第 1 步。 */
export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </Svg>
  )
}

/** 机器人——Relay 三步引导第 2 步（外部 AI 助手）。 */
export function BotIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="8" width="14" height="11" rx="3" />
      <path d="M12 8V5M9 5h6" strokeWidth={2} />
      <circle cx="9.5" cy="13" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13" r="0.8" fill="currentColor" stroke="none" />
      <path d="M9.5 16.5h5" />
    </Svg>
  )
}

/** 粘贴板——Relay 三步引导第 3 步。 */
export function ClipboardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5V3.8A1.8 1.8 0 0 1 10.8 2h2.4A1.8 1.8 0 0 1 15 3.8v.7" />
      <path d="M9 11h6M9 15h4" />
    </Svg>
  )
}

/** 指南针——欢迎引导（工具定位）。 */
export function CompassIcon(props: IconProps) {
  return (
    <Svg size={props.size ?? 28} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" fill="currentColor" stroke="none" opacity={0.85} />
    </Svg>
  )
}

/** 空状态：假设矩阵散点。 */
export function MatrixGlyphIcon(props: IconProps) {
  return (
    <Svg size={props.size ?? 32} {...props}>
      <path d="M5 4v15h15" />
      <circle cx="10" cy="14" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="14" cy="9" r="2.4" fill="currentColor" stroke="none" opacity={0.7} />
      <circle cx="17" cy="13" r="1.2" fill="currentColor" stroke="none" opacity={0.5} />
    </Svg>
  )
}

/** 空状态：OST 树枝。 */
export function TreeGlyphIcon(props: IconProps) {
  return (
    <Svg size={props.size ?? 32} {...props}>
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M12 7.5v4M12 11.5 7 15.8M12 11.5l5 4.3" />
    </Svg>
  )
}

/** 空状态：报告文档。 */
export function ReportGlyphIcon(props: IconProps) {
  return (
    <Svg size={props.size ?? 32} {...props}>
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h4" />
    </Svg>
  )
}
