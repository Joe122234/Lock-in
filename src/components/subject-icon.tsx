import {
  BookOpen,
  Compass,
  FlaskConical,
  Globe2,
  Landmark,
  Layers,
  PenTool,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  target: Target,
  landmark: Landmark,
  globe2: Globe2,
  'trending-up': TrendingUp,
  book: BookOpen,
  flask: FlaskConical,
  pen: PenTool,
  layers: Layers,
  compass: Compass,
}

export function SubjectIcon({
  icon,
  size = 16,
  className,
}: {
  icon: string
  size?: number
  className?: string
}) {
  const Component = ICONS[icon] ?? BookOpen
  return <Component size={size} className={className} strokeWidth={1.8} />
}

export const SUBJECT_ICON_OPTIONS = Object.keys(ICONS)
