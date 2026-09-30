import { ReactNode } from 'react'

interface FieldProps {
  label: string
  required?: boolean
  children: ReactNode
  className?: string
}
export function Field({ label, required, children, className = '' }: FieldProps) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 mr-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

interface SummaryBoxProps {
  label: string
  value: string | number
  color?: 'default' | 'green' | 'orange' | 'purple'
}
export function SummaryBox({ label, value, color = 'default' }: SummaryBoxProps) {
  const colors = {
    default: 'bg-slate-50 border-slate-200 text-slate-800',
    green:   'bg-green-50 border-green-200 text-green-800',
    orange:  'bg-orange-50 border-orange-200 text-orange-800',
    purple:  'bg-purple-50 border-purple-200 text-purple-800',
  }
  return (
    <div className={`rounded-lg border p-3 text-center ${colors[color]}`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  )
}

interface BlockHeaderProps {
  title: string
  color: string
  icon?: ReactNode
  action?: ReactNode
}
export function BlockHeader({ title, color, icon, action }: BlockHeaderProps) {
  return (
    <div className={`${color} text-white px-4 py-3 flex items-center justify-between gap-3`}>
      <span className="inline-flex min-w-0 items-center gap-2 text-sm font-bold">
        {icon && <span className="shrink-0" aria-hidden="true">{icon}</span>}
        <span>{title}</span>
      </span>
      {action}
    </div>
  )
}
