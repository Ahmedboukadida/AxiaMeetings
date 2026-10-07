"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Typography } from "@/components/ui/typographys";

export interface StatsCardProps extends React.HTMLAttributes<HTMLDivElement> {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    iconWrapperClassName?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}

export function StatsCard({
    title,
    subtitle,
    icon,
    iconWrapperClassName,
    action,
    children,
    className,
    ...props
}: StatsCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={cn(
                "bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 group hover:shadow-2xl hover:shadow-[#002B5B]/5 transition-all duration-500 flex flex-col",
                className
            )}
            {...(props as any)}
        >
            <div className="flex items-start justify-between mb-6 sm:mb-8 gap-4">
                <div className="flex items-center gap-3">
                    {icon && (
                        <div
                            className={cn(
                                "w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border",
                                iconWrapperClassName ||
                                    "bg-blue-50 text-[#002B5B] border-blue-100"
                            )}
                        >
                            {icon}
                        </div>
                    )}
                    <div>
                        <Typography variant="h3" className="text-sm sm:text-base font-semibold">
                            {title}
                        </Typography>
                        {subtitle && (
                            <Typography
                                variant="label"
                                className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block mt-0.5"
                            >
                                {subtitle}
                            </Typography>
                        )}
                    </div>
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
            <div className="grow flex flex-col justify-center min-h-0 w-full">
                {children}
            </div>
        </motion.div>
    );
}
