const PATHS = {
  flame: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z',
  flag: 'M5 21V4m0 0h12l-2 4 2 4H5',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4v16l13-8z',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  eraser: 'M20 20H9L3.5 14.5a2 2 0 0 1 0-3L12 3l8 8-7 7M8 8l8 8',
  pencil: 'M4 20l1-5L16 4l4 4L9 19zM14 6l4 4',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  check: 'M5 12l5 5L20 7',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 22, fill = false }: { name: IconName; size?: number; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function groupIcon(group: 'streak' | 'milestone' | 'skill' | 'calendar'): IconName {
  return { streak: 'flame', milestone: 'flag', skill: 'bolt', calendar: 'calendar' }[group] as IconName
}
