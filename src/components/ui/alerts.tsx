"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

const alertVariants = cva(
  "relative w-full rounded-xl border p-3 md:p-3.5 transition-all duration-300",
  {
    variants: {
      variant: {
        default: "bg-neutral-50 border-neutral-200 text-neutral-900",
        success: "bg-success-50 border-success-200 text-success-800",
        warning: "bg-warning-50 border-warning-200 text-warning-800",
        error: "bg-error-50 border-error-200 text-error-800",
        info: "bg-primary-50 border-primary-200 text-primary-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const alertIcons = {
  default: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
  description?: string;
  onClose?: () => void;
  icon?: React.ReactNode;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, title, description, onClose, icon, ...props }, ref) => {
    const IconComponent = alertIcons[variant || "default"];

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        <div className="flex items-start gap-3">
          {icon !== null && (
            <div className="shrink-0">
              {icon || <IconComponent className="h-4.5 w-4.5" />}
            </div>
          )}
          <div className="flex-1">
            {title && (
              <h5 className="font-bold text-[13px] mb-0.5">{title}</h5>
            )}
            {description && (
              <p className="text-[12px] leading-relaxed opacity-90">{description}</p>
            )}
            {!title && !description && props.children}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }
);

Alert.displayName = "Alert";

export { Alert, alertVariants };

