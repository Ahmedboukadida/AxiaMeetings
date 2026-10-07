"use client";

import * as React from "react";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "list" | "grid";

export interface ListGridToggleProps {
    viewMode: ViewMode;
    setViewMode: (mode: ViewMode) => void;
    className?: string;
    gridLabel?: string;
    listLabel?: string;
}

export function ListGridToggle({ viewMode, setViewMode, className, gridLabel = "Grid", listLabel = "List" }: ListGridToggleProps) {
    const STORAGE_KEY = "axia_meetings_view_mode";

    React.useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY) as ViewMode;
        if (stored === "list" || stored === "grid") {
            setViewMode(stored);
        } else {
            setViewMode(window.matchMedia('(max-width: 768px)').matches ? "grid" : "list");
        }
    }, [setViewMode]);

    const handleSetMode = (mode: ViewMode) => {
        setViewMode(mode);
        localStorage.setItem(STORAGE_KEY, mode);
    };

    return (
        <div className={cn("flex bg-slate-50 p-0.5 rounded-lg border border-slate-100", className)}>
            <button
                type="button"
                onClick={() => handleSetMode("grid")}
                className={cn(
                    "flex-1 md:flex-none flex items-center justify-center gap-2 h-8 px-3 rounded-md transition-all font-semibold text-[10px] uppercase",
                    viewMode === "grid"
                        ? "bg-white text-[#002B5B] shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                )}
            >
                <LayoutGrid size={12} /> <span className="hidden md:inline">{gridLabel}</span>
            </button>
            <button
                type="button"
                onClick={() => handleSetMode("list")}
                className={cn(
                    "flex-1 md:flex-none flex items-center justify-center gap-2 h-8 px-3 rounded-md transition-all font-semibold text-[10px] uppercase",
                    viewMode === "list"
                        ? "bg-white text-[#002B5B] shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                )}
            >
                <ListIcon size={12} /> <span className="hidden md:inline">{listLabel}</span>
            </button>
        </div>
    );
}
