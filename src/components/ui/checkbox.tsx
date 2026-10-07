"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Check, Minus } from "lucide-react";

const checkboxVariants = cva(
  "peer shrink-0 border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "h-4 w-4",
        default: "h-5 w-5",
        lg: "h-6 w-6",
      },
      variant: {
        default: "data-[state=checked]:bg-primary data-[state=checked]:border-primary",
        secondary: "data-[state=checked]:bg-secondary data-[state=checked]:border-secondary",
        destructive: "data-[state=checked]:bg-destructive data-[state=checked]:border-destructive",
        success: "data-[state=checked]:bg-success data-[state=checked]:border-success",
        warning: "data-[state=checked]:bg-warning data-[state=checked]:border-warning",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  }
);

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof checkboxVariants> {
  label?: string;
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, size, variant, label, checked, indeterminate, id, ...props }, ref) => {
    const generatedId = React.useId();
    const checkboxId = id || generatedId;
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
            type="checkbox"
            ref={ref}
            id={checkboxId}
            checked={isChecked}
            className="sr-only"
            onChange={handleChange}
            {...props}
          />
          <label
            htmlFor={checkboxId}
            className={cn(
              checkboxVariants({ size, variant }),
              "rounded cursor-pointer flex items-center justify-center transition-colors",
              isChecked || indeterminate
                ? "bg-primary border-primary text-primary-foreground"
                : "bg-background border-input hover:border-primary/50",
              props.disabled && "cursor-not-allowed opacity-50",
              className
            )}
          >
            {indeterminate ? (
              <Minus className={cn(
                size === "sm" && "h-3 w-3",
                size === "default" && "h-4 w-4",
                size === "lg" && "h-5 w-5",
              )} />
            ) : isChecked ? (
              <Check className={cn(
                size === "sm" && "h-3 w-3",
                size === "default" && "h-4 w-4",
                size === "lg" && "h-5 w-5",
              )} />
            ) : null}
          </label>
        </div>
        {label && (
          <label
            htmlFor={checkboxId}
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

Checkbox.displayName = "Checkbox";

export { Checkbox, checkboxVariants };
