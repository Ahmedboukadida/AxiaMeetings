"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const typographyVariants = cva("text-slate-900 transition-colors", {
  variants: {
    variant: {
      h1:    "text-xl md:text-2xl font-semibold leading-tight",
      h2:    "text-lg md:text-xl font-semibold leading-tight",
      h3:    "text-base md:text-lg font-semibold leading-snug",
      h4:    "text-sm md:text-base font-semibold leading-normal",
      p:     "text-[13px] md:text-sm text-slate-500 font-normal leading-relaxed",
      lead:  "text-sm text-slate-600 font-medium leading-relaxed",
      large: "text-[13px] md:text-sm font-semibold",
      small: "text-[11px] font-medium leading-none",
      muted: "text-[11px] text-slate-400 font-normal",
      label: "text-[10px] font-bold uppercase text-slate-400",
    },
    color: {
      default: "text-slate-900",
      primary: "text-[#002B5B]",
      secondary: "text-slate-500",
      accent: "text-blue-600",
      white: "text-white",
      error: "text-red-500",
    },
  },
  defaultVariants: {
    variant: "p",
    color: "default",
  },
});

export interface TypographyProps
  extends Omit<React.HTMLAttributes<HTMLHeadingElement | HTMLParagraphElement>, "color">,
    VariantProps<typeof typographyVariants> {
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";
}

const Typography = React.forwardRef<HTMLElement, TypographyProps>(
  ({ className, variant, color, as, children, ...props }, ref) => {
    const Component = as || (variant && ["h1", "h2", "h3", "h4"].includes(variant) ? (variant as any) : "p");
    
    return (
      <Component
        ref={ref as any}
        className={cn(typographyVariants({ variant, color }), className)}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

Typography.displayName = "Typography";

export { Typography, typographyVariants };
