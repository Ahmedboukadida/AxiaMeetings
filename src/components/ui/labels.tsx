"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

const labelVariants = cva(
  "text-[11px] font-black uppercase tracking-[0.2em] leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 transition-colors",
  {
    variants: {
      variant: {
        default: "text-slate-400",
        error: "text-red-500",
        success: "text-green-500",
        muted: "text-slate-300",
        primary: "text-[#002B5B]",
      },
      size: {
        sm: "text-[10px]",
        default: "text-[11px]",
        lg: "text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement>,
  VariantProps<typeof labelVariants> {
  required?: boolean;
  optional?: boolean;
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, variant, size, required, optional, children, ...props }, ref) => {
    const t = useTranslations("Common.form");
    return (
      <label
        ref={ref}
        className={cn(labelVariants({ variant, size }), className)}
        {...props}
      >
        {children}
        {required && (
          <span className="text-destructive ml-1" aria-hidden="true">
            *
          </span>
        )}
        {optional && (
          <span className="text-muted-foreground ml-1 font-normal italic">
            ({t("optional")})
          </span>
        )}
      </label>
    );
  }
);

Label.displayName = "Label";

export { Label, labelVariants };
