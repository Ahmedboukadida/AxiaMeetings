"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const radioVariants = cva(
  "peer shrink-0 border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "h-4 w-4",
        default: "h-5 w-5",
        lg: "h-6 w-6",
      },
      variant: {
        default: "data-[state=checked]:border-primary",
        secondary: "data-[state=checked]:border-secondary",
        destructive: "data-[state=checked]:border-destructive",
        success: "data-[state=checked]:border-success",
        warning: "data-[state=checked]:border-warning",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  }
);

const radioIndicatorVariants = cva(
  "absolute inset-0 flex items-center justify-center",
  {
    variants: {},
    defaultVariants: {},
  }
);

const radioDotVariants = cva(
  "rounded-full",
  {
    variants: {
      size: {
        sm: "h-2 w-2",
        default: "h-2.5 w-2.5",
        lg: "h-3 w-3",
      },
      variant: {
        default: "bg-primary",
        secondary: "bg-secondary",
        destructive: "bg-destructive",
        success: "bg-success",
        warning: "bg-warning",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  }
);

export interface RadioProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof radioVariants> {
  label?: string;
}

const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, size, variant, label, checked, id, ...props }, ref) => {
    const generatedId = React.useId();
    const radioId = id || generatedId;
    const [isChecked, setIsChecked] = React.useState(checked || false);

    React.useEffect(() => {
      setIsChecked(checked || false);
    }, [checked]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setIsChecked(e.target.checked);
      props.onChange?.(e);
    };

    return (
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="radio"
            ref={ref}
            id={radioId}
            checked={isChecked}
            className="sr-only"
            onChange={handleChange}
            {...props}
          />
          <label
            htmlFor={radioId}
            className={cn(
              radioVariants({ size, variant }),
              "rounded-full cursor-pointer flex items-center justify-center transition-colors relative",
              isChecked
                ? "border-primary"
                : "border-input hover:border-primary/50",
              props.disabled && "cursor-not-allowed opacity-50",
              className
            )}
          >
            {isChecked && (
              <div className={cn(radioIndicatorVariants())}>
                <div className={cn(radioDotVariants({ size, variant }))} />
              </div>
            )}
          </label>
        </div>
        {label && (
          <label
            htmlFor={radioId}
            className={cn(
              "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer",
              props.disabled && "cursor-not-allowed opacity-70"
            )}
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);

Radio.displayName = "Radio";

export { Radio, radioVariants, radioIndicatorVariants, radioDotVariants };
