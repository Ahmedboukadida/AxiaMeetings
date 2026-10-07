"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { clsx } from "clsx";

interface DropdownMenuProps {
    children: React.ReactNode;
}

interface DropdownMenuTriggerProps {
    asChild?: boolean;
    children: React.ReactNode;
}

interface DropdownMenuContentProps {
    align?: "start" | "center" | "end";
    sideOffset?: number;
    children: React.ReactNode;
    className?: string;
}

interface DropdownMenuItemProps {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    destructive?: boolean;
}

interface DropdownMenuLabelProps {
    children: React.ReactNode;
    className?: string;
    inset?: boolean;
}

interface DropdownMenuSeparatorProps {
    className?: string;
}

interface DropdownMenuSubMenuProps {
    children: React.ReactNode;
    label?: string;
}

// Context
const DropdownMenuContext = React.createContext<{
    open: boolean;
    setOpen: (open: boolean) => void;
}>({ open: false, setOpen: () => { } });

function DropdownMenu({ children }: DropdownMenuProps) {
    const [open, setOpen] = React.useState(false);
    return (
        <DropdownMenuContext.Provider value={{ open, setOpen }}>
            <div className="relative inline-block">{children}</div>
        </DropdownMenuContext.Provider>
    );
}

function DropdownMenuTrigger({ asChild, children }: DropdownMenuTriggerProps) {
    const { setOpen } = React.useContext(DropdownMenuContext);

    if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
            onClick: () => setOpen(true),
        });
    }

    return (
        <button onClick={() => setOpen(true)} className="cursor-pointer">
            {children}
        </button>
    );
}

function DropdownMenuContent({
    align = "end",
    sideOffset = 4,
    children,
    className,
}: DropdownMenuContentProps) {
    const { open, setOpen } = React.useContext(DropdownMenuContext);

    const alignClasses = {
        start: "left-0",
        center: "left-1/2 -translate-x-1/2",
        end: "right-0",
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    <div
                        className="fixed inset-0 z-50"
                        onClick={() => setOpen(false)}
                    />
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className={clsx(
                            "absolute z-50 min-w-[8rem] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-xl mt-2",
                            alignClasses[align],
                            className
                        )}
                        style={{ top: `calc(100% + ${sideOffset}px)` }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {children}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

function DropdownMenuItem({
    children,
    onClick,
    className,
    destructive = false,
}: DropdownMenuItemProps) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "relative flex cursor-pointer select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none transition-colors",
                "focus:bg-accent focus:text-accent-foreground",
                destructive ? "text-destructive" : "text-foreground",
                className
            )}
        >
            {children}
        </button>
    );
}

function DropdownMenuLabel({
    children,
    className,
    inset,
}: DropdownMenuLabelProps) {
    return (
        <div
            className={clsx(
                "px-2 py-1.5 text-sm font-black text-foreground",
                inset && "pl-8",
                className
            )}
        >
            {children}
        </div>
    );
}

function DropdownMenuSeparator({ className }: DropdownMenuSeparatorProps) {
    return <div className={clsx("-mx-1 my-1 h-px bg-border", className)} />;
}

function DropdownMenuSubMenu({ children, label }: DropdownMenuSubMenuProps) {
    const [subOpen, setSubOpen] = React.useState(false);

    return (
        <div
            className="relative"
            onMouseEnter={() => setSubOpen(true)}
            onMouseLeave={() => setSubOpen(false)}
        >
            <button className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                {label}
                <ChevronRight className="h-4 w-4" />
            </button>
            <AnimatePresence>
                {subOpen && (
                    <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="absolute left-full top-0 ml-1 min-w-[8rem] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-xl"
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function DropdownMenuRadioGroup({
    onValueChange,
    children,
}: {
    value?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1">
            {React.Children.map(children, (child) => {
                if (React.isValidElement(child)) {
                    const reactElement = child as React.ReactElement<{ value?: string; onClick?: () => void }>;
                    return React.cloneElement(reactElement, {
                        onClick: () => onValueChange?.(reactElement.props.value || ""),
                    });
                }
                return child;
            })}
        </div>
    );
}

function DropdownMenuRadioItem({
    children,
}: {
    value?: string;
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

export {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSubMenu,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
};

