"use no memo";
"use client";

import * as React from "react";
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    Download,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import { Input } from "./inputs";

export interface RemoteDataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    total: number;
    page: number;
    limit: number;
    onParamsChange: (params: { page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' }) => void;
    searchPlaceholder?: string;
    onRowClick?: (row: TData) => void;
    isLoading?: boolean;
    onExport?: () => void;
}

export function RemoteDataTable<TData, TValue>({
    columns,
    data,
    total,
    page,
    limit,
    onParamsChange,
    searchPlaceholder = "Search...",
    onRowClick,
    isLoading = false,
    onExport,
}: RemoteDataTableProps<TData, TValue>) {
    const t = useTranslations('Common.table');
    const [searchValue, setSearchValue] = React.useState("");
    
    const displaySearchPlaceholder = searchPlaceholder === "Search..." ? t('searchPlaceholder') : searchPlaceholder;
    
    // Debounce search
    React.useEffect(() => {
        if (searchValue === "") return; // Don't trigger on initial empty search
        const timer = setTimeout(() => {
            onParamsChange({ search: searchValue, page: 1 });
        }, 500);
        return () => clearTimeout(timer);
    }, [searchValue, onParamsChange]);

    // eslint-disable-next-line
    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        manualPagination: true,
        pageCount: Math.ceil(total / limit),
    });

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="w-full space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="relative max-w-sm flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={displaySearchPlaceholder}
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        className="pl-9 bg-white/50 "
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => onParamsChange({ page })} disabled={isLoading} className="rounded-xl">
                        <RefreshCw className={clsx("h-4 w-4 mr-2", isLoading && "animate-spin")} />
                        {t('refresh')}
                    </Button>
                    {onExport && (
                        <Button variant="outline" size="sm" onClick={onExport} className="rounded-xl">
                            <Download className="h-4 w-4 mr-2" />
                            {t('export')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Table Container */}
            <div className="rounded-4xl border border-zinc-200  bg-white  backdrop-blur-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-zinc-50/50  border-b border-zinc-200 ">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th key={header.id} className="px-6 py-4 font-bold text-zinc-500 uppercase tracking-widest text-sm">
                                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="divide-y divide-zinc-200 ">
                            <AnimatePresence mode="wait">
                                {isLoading ? (
                                    <tr className="bg-white/5 ">
                                        <td colSpan={columns.length} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="relative">
                                                  <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                                                  <div className="absolute inset-0 flex items-center justify-center">
                                                    <RefreshCw className="w-5 h-5 text-primary opacity-50" />
                                                  </div>
                                                </div>
                                                <span className="text-zinc-500 font-medium tracking-tight">{t('fetching')}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : data.length === 0 ? (
                                    <tr>
                                        <td colSpan={columns.length} className="px-6 py-20 text-center text-zinc-500">
                                            {t('noResults')}
                                        </td>
                                    </tr>
                                ) : (
                                    data.map((item, idx) => (
                                        <motion.tr
                                            key={idx}
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.03 }}
                                            className={clsx(
                                                "hover:bg-zinc-50 :bg-white/5 transition-colors group",
                                                onRowClick && "cursor-pointer"
                                            )}
                                            onClick={() => onRowClick?.(item)}
                                        >
                                            {table.getRowModel().rows[idx]?.getVisibleCells().map((cell) => (
                                                <td key={cell.id} className="px-6 py-4 whitespace-nowrap align-middle">
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </td>
                                            ))}
                                        </motion.tr>
                                    ))
                                )}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between px-2 pt-2">
                <div className="text-sm font-medium text-zinc-500">
                    {t('pagination.showing', {
                        from: ((page - 1) * limit) + 1,
                        to: Math.min(page * limit, total),
                        total: total
                    })}
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 mr-4">
                        <span className="text-sm font-medium text-zinc-500">{t('rowsPerPage')}</span>
                        <select
                            value={limit}
                            onChange={(e) => onParamsChange({ limit: Number(e.target.value), page: 1 })}
                            className="bg-transparent border border-zinc-200  rounded-lg py-1 px-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            {[10, 25, 50, 100].map(val => (
                                <option key={val} value={val}>{val}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            disabled={page <= 1 || isLoading}
                            onClick={() => onParamsChange({ page: page - 1 })}
                            className="rounded-xl w-9 h-9"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <div className="flex items-center px-4 py-1.5 rounded-xl bg-zinc-100  text-sm font-bold">
                            {t('pageInfo', { current: page, total: totalPages || 1 })}
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            disabled={page >= totalPages || isLoading}
                            onClick={() => onParamsChange({ page: page + 1 })}
                            className="rounded-xl w-9 h-9"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}


