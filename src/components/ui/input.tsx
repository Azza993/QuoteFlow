import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-ink-900 shadow-sm transition-colors',
        'placeholder:text-ink-400 focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200',
        'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[90px] w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-ink-900 shadow-sm transition-colors',
      'placeholder:text-ink-400 focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  // A native select: on a phone this gets the OS picker, which beats any
  // custom dropdown for one-handed use.
  <select
    ref={ref}
    className={cn(
      'flex h-11 w-full appearance-none rounded-xl border border-ink-200 bg-white px-3 pr-9 text-ink-900 shadow-sm transition-colors',
      'bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\' fill=\'none\' stroke=\'%2367738c\' stroke-width=\'1.6\'%3E%3Cpath d=\'m4 6 4 4 4-4\'/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat',
      'focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200',
      className,
    )}
    {...props}
  />
))
Select.displayName = 'Select'
