import { CheckIcon } from 'lucide-react';
import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

export const DropdownMenuContent = ({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Content>) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Content
      data-slot="dropdown-menu-content"
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  </MenuPrimitive.Portal>
);

const ITEM =
  'relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0';

export const DropdownMenuItem = ({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item> & { variant?: 'default' | 'destructive' }) => (
  <MenuPrimitive.Item
    data-slot="dropdown-menu-item"
    className={cn(
      ITEM,
      variant === 'destructive' &&
        'text-destructive data-[highlighted]:bg-destructive-soft data-[highlighted]:text-destructive',
      className,
    )}
    {...props}
  />
);

export const DropdownMenuCheckboxItem = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.CheckboxItem>) => (
  <MenuPrimitive.CheckboxItem className={cn(ITEM, 'pl-8', className)} {...props}>
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <MenuPrimitive.ItemIndicator>
        <CheckIcon />
      </MenuPrimitive.ItemIndicator>
    </span>
    {children}
  </MenuPrimitive.CheckboxItem>
);

export const DropdownMenuLabel = ({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Label>) => (
  <MenuPrimitive.Label className={cn('px-2 py-1.5 text-xs font-semibold', className)} {...props} />
);
export const DropdownMenuSeparator = ({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) => (
  <MenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
);
