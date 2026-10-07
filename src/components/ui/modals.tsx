"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Typography } from "@/components/ui/typographys";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    children: React.ReactNode;
    size?: "sm" | "md" | "lg" | "xl" | "2xl" | "4xl" | "5xl" | "6xl" | "7xl" | "8xl" | "full";
    showCloseButton?: boolean;
    closeOnOverlayClick?: boolean;
    className?: string;
}

const sizeMap = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
    "8xl": "max-w-[90rem]",
    full: "max-w-[95vw] max-h-[95vh]",
};

const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    description,
    children,
    size = "md",
    showCloseButton = true,
    closeOnOverlayClick = true,
    className,
}) => {
    // Escape key + body scroll lock
    React.useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
            document.body.style.overflow = "hidden";
        }
        return () => {
            document.removeEventListener("keydown", handleEscape);
            document.body.style.overflow = "";
        };
    }, [isOpen, onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:ps-72">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
                        onClick={closeOnOverlayClick ? onClose : undefined}
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 12 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        className={cn(
                            "relative w-full bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-[0_40px_100px_-20px_rgba(0,43,91,0.2)] overflow-hidden flex flex-col max-h-[92vh]",
                            sizeMap[size],
                            className
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        {(title || showCloseButton) && (
                            <div className="flex items-start justify-between px-6 md:px-8 pt-6 md:pt-8 pb-4 md:pb-5 border-b border-slate-100">
                                <div className="flex-1 pr-4 md:pr-6">
                                    {title && (
                                        <Typography variant="h3">
                                            {title}
                                        </Typography>
                                    )}
                                    {description && (
                                        <Typography variant="p" color="secondary" className="mt-1">
                                            {description}
                                        </Typography>
                                    )}
                                </div>
                                {showCloseButton && (
                                    <button
                                        onClick={onClose}
                                        className="shrink-0 p-2 md:p-3 rounded-xl md:rounded-2xl hover:bg-slate-50 text-slate-400 hover:text-[#002B5B] transition-all border border-transparent hover:border-slate-100"
                                        aria-label="Close modal"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Body */}
                        <div className={cn("px-6 md:px-8 py-6 md:py-8 overflow-y-auto flex-1 custom-scrollbar")}>
                            {children}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

Modal.displayName = "Modal";

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmVariant?: "danger" | "warning" | "primary" | "default";
    loading?: boolean;
    icon?: LucideIcon | React.ReactNode;
    children?: React.ReactNode;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmLabel,
    cancelLabel,
    confirmVariant = "danger",
    loading = false,
    icon,
    children,
}) => {
    const tc = useTranslations("Common");
    
    const renderIcon = (iconToRender: LucideIcon | React.ReactNode) => {
        if (!iconToRender) return null;
        if (typeof iconToRender === 'function' || (typeof iconToRender === 'object' && 'displayName' in (iconToRender as any))) {
            const Icon = iconToRender as LucideIcon;
            return <Icon size={24} />;
        }
        return iconToRender;
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md">
            <div className="text-center space-y-6">
                {icon && (
                    <div className="w-16 h-16 rounded-[1.5rem] bg-slate-50 flex items-center justify-center mx-auto border border-slate-100 shadow-sm">
                        {renderIcon(icon)}
                    </div>
                )}
                <div>
                    <Typography variant="h3">{title}</Typography>
                    <Typography variant="p" color="secondary" className="mt-3">
                        {description}
                    </Typography>
                </div>

                {children}

                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 h-10"
                    >
                        {cancelLabel || tc("cancel")}
                    </Button>
                    <Button
                        variant={confirmVariant === "danger" ? "danger" : "primary"}
                        onClick={onConfirm}
                        disabled={loading}
                        className="flex-1 h-10 shadow-xl shadow-blue-900/10"
                    >
                        {loading ? tc("processing") : (confirmLabel || tc("confirm"))}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export { Modal };
export type { ModalProps };
