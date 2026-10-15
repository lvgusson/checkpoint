import type * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="card"
    className={cn(
      'flex flex-col gap-4 rounded-lg border border-border bg-card py-5 text-card-foreground shadow-[0_1px_3px_var(--shadow-soft)]',
      className,
    )}
    {...props}
  />
);
export const CardHeader = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div data-slot="card-header" className={cn('grid gap-1.5 px-5', className)} {...props} />
);
export const CardTitle = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div data-slot="card-title" className={cn('leading-none font-semibold', className)} {...props} />
);
export const CardDescription = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="card-description"
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
);
export const CardContent = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div data-slot="card-content" className={cn('px-5', className)} {...props} />
);
export const CardFooter = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div data-slot="card-footer" className={cn('flex items-center px-5', className)} {...props} />
);
