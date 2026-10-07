import React from 'react';
import { cn } from '@/lib/utils';

interface CardBaseProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional accent color class e.g., 'bg-primary' */
  accentClass?: string;
  /** Enable hover elevation */
  hover?: boolean;
  /** Children content */
  children: React.ReactNode;
}

export const CardBase: React.FC<CardBaseProps> = ({
  accentClass = 'bg-white',
  hover = true,
  className,
  children,
  ...rest
}) => {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/60 shadow-sm text-slate-800",
        accentClass,
        hover && "transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

export default CardBase;
