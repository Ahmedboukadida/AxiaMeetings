"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { LucideIcon, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const inputVariants = cva(
  "flex w-full rounded-2xl border bg-slate-50/50 px-4 py-3 text-sm font-medium text-[#002B5B] transition-all duration-300 placeholder:text-slate-300 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-slate-100 focus:border-[#002B5B] focus:ring-4 focus:ring-[#002B5B]/5",
        error:
          "border-red-200 focus:border-red-500 focus:ring-4 focus:ring-red-500/10",
        success:
          "border-green-200 focus:border-green-500 focus:ring-4 focus:ring-green-500/10",
      },
      inputSize: {
        default: "h-12",
        sm: "h-9 px-3 text-xs",
        lg: "h-14 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      inputSize: "default",
    },
  }
);

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: any;
  rightIcon?: any;
  icon?: any;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant,
      inputSize,
      type,
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      icon,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const isPassword = type === "password";
    const currentType = isPassword ? (showPassword ? "text" : "password") : type;

    const inputVariant = error ? "error" : variant;
    const finalLeftIcon = leftIcon || icon;

    const renderIcon = (iconToRender: any) => {
      if (!iconToRender) return null;
      if (typeof iconToRender === 'function' || (typeof iconToRender === 'object' && 'displayName' in (iconToRender as any))) {
        const Icon = iconToRender as LucideIcon;
        return <Icon size={20} />;
      }
      return iconToRender;
    };

    const togglePasswordVisibility = () => {
      setShowPassword(!showPassword);
    };

    return (
      <div className="w-full space-y-2.5">
        {label && (
          <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">
            {label}
          </label>
        )}
        <div className="relative group">
          {finalLeftIcon && (
            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#002B5B]">
              {renderIcon(finalLeftIcon)}
            </div>
          )}
          <input
            type={currentType}
            className={cn(
              inputVariants({ variant: inputVariant, inputSize }),
              finalLeftIcon && "pl-14",
              (rightIcon || isPassword) && "pr-14",
              className
            )}
            ref={ref}
            {...props}
          />
          {isPassword ? (
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#002B5B] transition-colors focus:outline-none"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          ) : rightIcon && (
            <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#002B5B]">
              {renderIcon(rightIcon)}
            </div>
          )}
        </div>
        {error && <p className="text-xs font-medium text-red-500">{error}</p>}
        {helperText && !error && (
          <p className="text-xs font-normal text-slate-400 italic">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input, inputVariants };
