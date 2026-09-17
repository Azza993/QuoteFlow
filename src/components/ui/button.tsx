import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800',
        secondary: 'bg-white text-ink-900 border border-ink-200 shadow-sm hover:bg-ink-50',
        ghost: 'text-ink-700 hover:bg-ink-100',
        danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
        dark: 'bg-ink-900 text-white hover:bg-ink-800',
      },
      size: {
        // Sizes are deliberately large: this is used with work gloves on.
        sm: 'h-9 px-3 text-sm [&_svg]:size-4',
        md: 'h-11 px-4 text-[0.95rem] [&_svg]:size-4',
        lg: 'h-14 px-6 text-base [&_svg]:size-5',
        icon: 'size-10 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  },
)
Button.displayName = 'Button'

export { buttonVariants }
