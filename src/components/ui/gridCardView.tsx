"use client";

/**
 * GridCardView — Reusable responsive grid/card view component
 *
 * Addresses Requirements 2.4 & 3.4 (Data Table Consistency Fix):
 * - On mobile (< 768px): renders items as cards in a CSS Grid layout
 * - On desktop (≥ 768px): renders a standard <table> — unchanged from existing behaviour
 * - Supports infinite scrolling via IntersectionObserver
 * - Provides a list/grid view toggle for the card layout
 *
 * Bug condition: componentType = 'dataTable' on mobile screens
 * Expected behaviour: consistent card-based display on mobile
 * Preservation: desktop table rendering is completely unchanged
 */

import * as React from "react";
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutGrid, List, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GridCardViewColumn<TData, TValue = unknown> = ColumnDef<TData, TValue>;

export interface GridCardViewProps<TData, TValue = unknown> {
    /** Column definitions — same format as TanStack Table */
    columns: ColumnDef<TData, TValue>[];
    /** Current page / batch of data */
    data: TData[];
    /** Whether more data is available for infinite scroll */
    hasMore?: boolean;
    /** Called when the sentinel element enters the viewport (load next page) */
    onLoadMore?: () => void;
    /** Whether a load-more fetch is in progress */
    isLoadingMore?: boolean;
    /** Whether the initial data load is in progress */
    isLoading?: boolean;
    /** Placeholder shown when data is empty */
    emptyMessage?: string;
    /** Enable the search bar */
    searchable?: boolean;
    searchPlaceholder?: string;
    /** Extra class names for the root wrapper */
    className?: string;
    /** Called when a row/card is clicked */
    onRowClick?: (row: TData) => void;
    /**
     * Render prop for the card body on mobile.
     * If omitted the component falls back to a generic label/value layout
     * derived from the column definitions.
     */
    renderCard?: (item: TData, index: number) => React.ReactNode;
}

// ---------------------------------------------------------------------------
// View-mode toggle
// ---------------------------------------------------------------------------

type ViewMode = "grid" | "list";

interface ViewToggleProps {
    mode: ViewMode;
    onChange: (mode: ViewMode) => void;
}

function ViewToggle({ mode, onChange }: ViewToggleProps) {
    return (
        <div
            className="flex items-center gap-0.5 p-1 bg-slate-100 rounded-xl"
            role="group"
            aria-label="View mode"
        >
            <button
                type="button"
                onClick={() => onChange("grid")}
                aria-pressed={mode === "grid"}
                className={cn(
                    "p-1.5 rounded-lg transition-all",
                    mode === "grid"
                        ? "bg-white text-[#002B5B] shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                )}
                aria-label="Grid view"
            >
                <LayoutGrid size={15} />
            </button>
            <button
                type="button"
                onClick={() => onChange("list")}
                aria-pressed={mode === "list"}
                className={cn(
                    "p-1.5 rounded-lg transition-all",
                    mode === "list"
                        ? "bg-white text-[#002B5B] shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                )}
                aria-label="List view"
            >
                <List size={15} />
            </button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Infinite-scroll sentinel
// ---------------------------------------------------------------------------

interface SentinelProps {
    onVisible: () => void;
    isLoading: boolean;
}

function InfiniteScrollSentinel({ onVisible, isLoading }: SentinelProps) {
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !isLoading) {
                    onVisible();
                }
            },
            { threshold: 0.1 }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [onVisible, isLoading]);

    return (
        <div ref={ref} className="flex items-center justify-center py-6">
            {isLoading && (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <Loader2 size={16} className="animate-spin" />
                    <span>Loading more…</span>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GridCardView<TData, TValue = unknown>({
    columns,
    data,
    hasMore = false,
    onLoadMore,
    isLoadingMore = false,
    isLoading = false,
    emptyMessage,
    searchable = false,
    searchPlaceholder,
    className,
    onRowClick,
    renderCard,
}: GridCardViewProps<TData, TValue>) {
    const t = useTranslations("Common.table");

    const [viewMode, setViewMode] = React.useState<ViewMode>("grid");
    const [globalFilter, setGlobalFilter] = React.useState("");

    const displayEmptyMessage = emptyMessage ?? t("noResults");
    const displaySearchPlaceholder =
        searchPlaceholder ?? t("searchPlaceholder");

    // Filter data client-side when searchable is enabled
    const filteredData = React.useMemo(() => {
        if (!globalFilter.trim()) return data;
        const lower = globalFilter.toLowerCase();
        return data.filter((row) =>
            JSON.stringify(row).toLowerCase().includes(lower)
        );
    }, [data, globalFilter]);

    // TanStack Table instance (used for desktop table rendering)
    const table = useReactTable({
        data: filteredData,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    // ------------------------------------------------------------------
    // Loading skeleton
    // ------------------------------------------------------------------
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 size={28} className="animate-spin text-[#002B5B]/40" />
                <span className="text-sm text-slate-400">{t("fetching")}</span>
            </div>
        );
    }

    return (
        <div className={cn("w-full space-y-4", className)}>
            {/* ----------------------------------------------------------------
                Toolbar: search + view toggle (toggle only visible on mobile)
            ---------------------------------------------------------------- */}
            {(searchable || true /* always show toggle on mobile */) && (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    {searchable && (
                        <div className="relative flex-1 min-w-[180px] max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                value={globalFilter}
                                onChange={(e) => setGlobalFilter(e.target.value)}
                                placeholder={displaySearchPlaceholder}
                                className="w-full pl-9 pr-9 py-2 text-sm rounded-xl border border-slate-200 focus:border-[#002B5B] focus:ring-2 focus:ring-[#002B5B]/10 outline-none bg-white transition-all"
                            />
                            {globalFilter && (
                                <button
                                    type="button"
                                    onClick={() => setGlobalFilter("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                    aria-label="Clear search"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    )}

                    {/* View toggle — only meaningful on mobile */}
                    <div className="md:hidden ml-auto">
                        <ViewToggle mode={viewMode} onChange={setViewMode} />
                    </div>
                </div>
            )}

            {/* ----------------------------------------------------------------
                DESKTOP: standard table (≥ 768px) — UNCHANGED from existing pattern
            ---------------------------------------------------------------- */}
            <div
                className="hidden md:block rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm"
                data-testid="grid-card-view-desktop"
            >
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full min-w-full">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase"
                                            style={{
                                                width:
                                                    header.getSize() !== 150
                                                        ? header.getSize()
                                                        : undefined,
                                            }}
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef.header,
                                                      header.getContext()
                                                  )}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {table.getRowModel().rows.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        onClick={() => onRowClick?.(row.original)}
                                        className={cn(
                                            "bg-white hover:bg-slate-50 :bg-slate-800/80 transition-colors",
                                            onRowClick && "cursor-pointer"
                                        )}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td
                                                key={cell.id}
                                                className="px-6 py-3 text-sm text-slate-700 break-words whitespace-normal leading-normal"
                                            >
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td
                                        colSpan={columns.length}
                                        className="px-5 py-12 text-center text-slate-400 text-sm"
                                    >
                                        {displayEmptyMessage}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Desktop infinite scroll sentinel */}
                {hasMore && onLoadMore && (
                    <InfiniteScrollSentinel
                        onVisible={onLoadMore}
                        isLoading={isLoadingMore}
                    />
                )}
            </div>

            {/* ----------------------------------------------------------------
                MOBILE: card-based layout (< 768px)
            ---------------------------------------------------------------- */}
            <div
                className="md:hidden"
                data-testid="grid-card-view-mobile"
            >
                {filteredData.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-sm">
                        {displayEmptyMessage}
                    </div>
                ) : (
                    <>
                        {/* Grid mode: 2-column CSS Grid */}
                        {viewMode === "grid" && (
                            <div
                                className="grid gap-3"
                                style={{
                                    gridTemplateColumns:
                                        "repeat(auto-fill, minmax(min(100%, 160px), 1fr))",
                                }}
                            >
                                <AnimatePresence initial={false}>
                                    {filteredData.map((item, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, scale: 0.96 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.96 }}
                                            transition={{ duration: 0.15, delay: idx * 0.02 }}
                                            onClick={() => onRowClick?.(item)}
                                            className={cn(
                                                "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 overflow-hidden",
                                                onRowClick && "cursor-pointer active:scale-[0.98] transition-transform"
                                            )}
                                        >
                                            {renderCard ? (
                                                renderCard(item, idx)
                                            ) : (
                                                <GenericCardBody
                                                    item={item}
                                                    columns={columns}
                                                    table={table}
                                                    rowIndex={idx}
                                                />
                                            )}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* List mode: single-column stacked cards */}
                        {viewMode === "list" && (
                            <div className="space-y-3">
                                <AnimatePresence initial={false}>
                                    {filteredData.map((item, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 6 }}
                                            transition={{ duration: 0.15, delay: idx * 0.02 }}
                                            onClick={() => onRowClick?.(item)}
                                            className={cn(
                                                "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 overflow-hidden",
                                                onRowClick && "cursor-pointer active:scale-[0.99] transition-transform"
                                            )}
                                        >
                                            {renderCard ? (
                                                renderCard(item, idx)
                                            ) : (
                                                <GenericCardBody
                                                    item={item}
                                                    columns={columns}
                                                    table={table}
                                                    rowIndex={idx}
                                                />
                                            )}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Mobile infinite scroll sentinel */}
                        {hasMore && onLoadMore && (
                            <InfiniteScrollSentinel
                                onVisible={onLoadMore}
                                isLoading={isLoadingMore}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Generic card body — used when no renderCard prop is provided
// ---------------------------------------------------------------------------

interface GenericCardBodyProps<TData, TValue> {
    item: TData;
    columns: ColumnDef<TData, TValue>[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table: ReturnType<typeof useReactTable<TData>>;
    rowIndex: number;
}

function GenericCardBody<TData, TValue>({
    table,
    rowIndex,
}: GenericCardBodyProps<TData, TValue>) {
    const row = table.getRowModel().rows[rowIndex];
    if (!row) return null;

    const cells = row.getVisibleCells();

    return (
        <>
            {cells.map((cell) => {
                const isActions = cell.column.id === "actions";
                const headerLabel =
                    typeof cell.column.columnDef.header === "string"
                        ? cell.column.columnDef.header
                        : cell.column.id;

                if (isActions) {
                    return (
                        <div
                            key={cell.id}
                            className="pt-3 mt-1 border-t border-slate-100 flex justify-end"
                        >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                    );
                }

                return (
                    <div key={cell.id} className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {headerLabel}
                        </span>
                        <div className="text-sm text-slate-700 break-words leading-snug">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                    </div>
                );
            })}
        </>
    );
}
