import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-8 w-8 text-[11px] rounded-lg',
  md: 'h-9 w-9 text-xs rounded-xl',
  lg: 'h-10 w-10 text-sm rounded-xl',
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Initials-circle avatar with an optional image — consolidates the pattern hand-rolled in AccountMenu, the marketing sidebar, and StaffAdmin's table rows. */
const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, name, src, size = 'md', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden bg-emmy-primary font-bold text-white',
        SIZES[size],
        className
      )}
      {...props}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initialsFrom(name)}
    </div>
  )
);
Avatar.displayName = 'Avatar';

export { Avatar, initialsFrom };
