"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { Typography } from "@/components/ui/typographys";

const selectVariants = cva(
  "flex w-full rounded-2xl border bg-slate-50/50 px-4 py-3 text-sm font-medium text-[#002B5B] transition-all duration-300 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "border-slate-100 focus:border-[#002B5B] focus:ring-4 focus:ring-[#002B5B]/5",
        error:
          "border-red-200 focus:border-red-500 focus:ring-4 focus:ring-red-500/5",
        success:
          "border-emerald-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size">,
    VariantProps<typeof selectVariants> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  leftIcon?: any;
  onValueChange?: (value: string) => void;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      variant,
      label,
      error,
      helperText,
      options,
      placeholder,
      leftIcon,
      onValueChange,
      onChange,
      ...props
    },
    ref
  ) => {
    const selectVariant = error ? "error" : variant;

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange?.(e);
      onValueChange?.(e.target.value);
    };

    const renderIcon = (iconToRender: any) => {
      if (!iconToRender) return null;
      if (typeof iconToRender === 'function' || (typeof iconToRender === 'object' && 'displayName' in (iconToRender as any))) {
        const Icon = iconToRender as LucideIcon;
        return <Icon size={20} />;
      }
      return iconToRender;
    };

    return (
      <div className="w-full space-y-2.5">
        {label && (
          <Typography variant="label" className={error ? "text-red-500" : ""}>
            {label}
          </Typography>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10">
              {renderIcon(leftIcon)}
            </div>
          )}
          <select
            className={cn(
              selectVariants({ variant: selectVariant }),
              leftIcon && "pl-14",
              "pr-12",
              className
            )}
            ref={ref}
            onChange={handleChange}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <ChevronDown className="h-5 w-5" />
          </div>
        </div>
        {error && <Typography variant="small" className="text-red-500 mt-1">{error}</Typography>}
        {helperText && !error && (
          <Typography variant="small" color="secondary" className="mt-1">{helperText}</Typography>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";

export { Select, selectVariants };
