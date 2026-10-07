"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Typography } from "./typographys";

const textareaVariants = cva(
  "flex w-full rounded-[2rem] border bg-slate-50/50 px-6 py-4 text-base font-medium text-slate-700 transition-all duration-300 placeholder:text-slate-300 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 min-h-[120px] resize-none",
  {
    variants: {
      variant: {
        default: "border-slate-100 focus:border-[#002B5B] focus:ring-4 focus:ring-[#002B5B]/5",
        error: "border-red-200 focus:border-red-500 focus:ring-4 focus:ring-red-500/10",
        success: "border-green-200 focus:border-green-500 focus:ring-4 focus:ring-green-500/10",
      },
      size: {
        sm: "min-h-[80px] px-4 py-3 text-sm rounded-2xl",
        default: "min-h-[120px] px-6 py-4 text-base",
        lg: "min-h-[200px] px-8 py-6 text-lg rounded-[2.5rem]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant, size, label, error, helperText, id, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id || generatedId;
    const currentVariant = error ? "error" : variant;

    return (
      <div className="w-full space-y-2.5">
        {label && (
          <label htmlFor={textareaId}>
            <Typography variant="label" className="mb-0">{label}</Typography>
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(textareaVariants({ variant: currentVariant, size }), className)}
          ref={ref}
          {...props}
        />
        {error && (
          <Typography variant="small" className="text-red-500 font-bold px-1">
            {error}
          </Typography>
        )}
        {helperText && !error && (
          <Typography variant="muted" className="italic px-1">
            {helperText}
          </Typography>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export { Textarea, textareaVariants };
