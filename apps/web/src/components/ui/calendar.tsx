import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { ptBR } from 'react-day-picker/locale';
import type * as React from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** shadcn-style calendar over react-day-picker, in Portuguese (pt-BR) and themed with tokens. */
export function Calendar({
  className,
  classNames,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const nav = cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-9');
  return (
    <DayPicker
      locale={ptBR}
      showOutsideDays
      className={cn('p-0', className)}
      classNames={{
        root: 'w-fit',
        months: 'relative flex flex-col gap-4',
        month: 'flex flex-col gap-3',
        month_caption: 'flex h-9 items-center justify-center text-sm font-semibold capitalize',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous: nav,
        button_next: nav,
        month_grid: 'border-collapse',
        weekday: 'size-10 text-[11px] font-medium uppercase text-muted-foreground',
        day: 'p-0 text-center text-sm',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-10 p-0 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ),
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
        today: '[&>button]:border [&>button]:border-primary',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'opacity-40',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: c }) =>
          orientation === 'left' ? (
            <ChevronLeftIcon className={cn('size-4', c)} />
          ) : (
            <ChevronRightIcon className={cn('size-4', c)} />
          ),
      }}
      {...props}
    />
  );
}
