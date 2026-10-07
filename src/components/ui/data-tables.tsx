"use client";

import * as React from "react";
import {
    ColumnDef,
    ColumnFiltersState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    RowSelectionState,
    SortingState,
    useReactTable,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ChevronUp,
    ChevronDown,
    ChevronsUpDown,
    Search,
    X,
    Trash2,
    CheckSquare,
    LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

export type Column<TData, TValue = unknown> = ColumnDef<TData, TValue>;

export interface BulkAction<TData> {
    label: string;
    icon?: LucideIcon | React.ReactNode;
    variant?: "default" | "danger";
    onClick: (rows: TData[]) => void;
}

export interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    pageSize?: number;
    showPagination?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
    className?: string;
    bulkActions?: BulkAction<TData>[];
    emptyMessage?: string;
    pagesize?: number;
}

function SortIcon({ direction }: { direction: "asc" | "desc" | false }) {
    if (direction === "asc") return <ChevronUp className="h-3.5 w-3.5 text-[#002B5B]" />;
    if (direction === "desc") return <ChevronDown className="h-3.5 w-3.5 text-[#002B5B]" />;
    return <ChevronsUpDown className="h-3.5 w-3.5 text-slate-300" />;
}
export function DataTable<TData, TValue>({
    columns,
    data,
    pageSize = 10,
    showPagination = true,
    searchable = true,
    searchPlaceholder = "Search...",
    className,
    bulkActions = [],
    emptyMessage,
    pagesize,
}: DataTableProps<TData, TValue>) {
    const tablePageSize = pagesize || pageSize;
    const t = useTranslations('Common.table');
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = React.useState("");
    const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
    
    const displayEmptyMessage = emptyMessage || t('noResults');
    const displaySearchPlaceholder = searchPlaceholder === "Search..." ? t('searchPlaceholder') : searchPlaceholder;

    // Prepend selection column if bulk actions exist
    const allColumns = React.useMemo<ColumnDef<TData, TValue>[]>(() => {
        if (bulkActions.length === 0) return columns;
        const selectionCol: ColumnDef<TData, TValue> = {
            id: "__select__",
            header: ({ table }) => (
                <input
                    type="checkbox"
                    checked={table.getIsAllPageRowsSelected()}
                    ref={(el) => {
                        if (el) el.indeterminate = table.getIsSomePageRowsSelected();
                    }}
                    onChange={table.getToggleAllPageRowsSelectedHandler()}
                    className="w-4 h-4 rounded border-slate-300 text-[#002B5B] accent-[#002B5B] cursor-pointer"
                    aria-label={t('selectAll')}
                />
            ),
            cell: ({ row }) => (
                <input
                    type="checkbox"
                    checked={row.getIsSelected()}
                    onChange={row.getToggleSelectedHandler()}
                    className="w-4 h-4 rounded border-slate-300 text-[#002B5B] accent-[#002B5B] cursor-pointer"
                    aria-label={t('selectRow')}
                />
            ),
            size: 40,
            enableSorting: false,
        };
        return [selectionCol, ...columns];
    }, [columns, bulkActions]);

    const table = useReactTable({
        data,
        columns: allColumns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter,
        onRowSelectionChange: setRowSelection,
        state: { sorting, columnFilters, globalFilter, rowSelection },
        initialState: { pagination: { pageSize: tablePageSize } },
    });

    const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
    const selectedCount = selectedRows.length;
    const totalFiltered = table.getFilteredRowModel().rows.length;
    const pageIndex = table.getState().pagination.pageIndex;
    const pageSizeState = table.getState().pagination.pageSize;
    const from = totalFiltered === 0 ? 0 : pageIndex * pageSizeState + 1;
    const to = Math.min((pageIndex + 1) * pageSizeState, totalFiltered);

    const renderActionIcon = (iconToRender: LucideIcon | React.ReactNode) => {
        if (!iconToRender) return null;
        if (typeof iconToRender === 'function' || (typeof iconToRender === 'object' && 'displayName' in (iconToRender as any))) {
            const Icon = iconToRender as LucideIcon;
            return <Icon size={16} />;
        }
        return iconToRender;
    };

    return (
        <div className={cn("w-full space-y-4", className)}>
            {/* Toolbar */}
            {(searchable || (bulkActions.length > 0 && selectedCount > 0)) && (
                <div className="flex items-center justify-between gap-4 flex-wrap px-1">
                    {searchable && (
                        <div className="relative flex-1 min-w-[200px] max-w-sm">
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
                                    onClick={() => setGlobalFilter("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Bulk actions bar */}
                    {bulkActions.length > 0 && selectedCount > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-[#002B5B]/5 border border-[#002B5B]/20 rounded-xl">
                            <CheckSquare className="h-4 w-4 text-[#002B5B]" />
                            <span className="text-sm font-semibold text-[#002B5B]">{t('selected', { count: selectedCount })}</span>
                            <div className="w-px h-4 bg-[#002B5B]/20 mx-1" />
                            {bulkActions.map((action, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        action.onClick(selectedRows);
                                        setRowSelection({});
                                    }}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase rounded-lg transition-all",
                                        action.variant === "danger"
                                            ? "bg-red-500 hover:bg-red-600 text-white"
                                            : "bg-[#002B5B] hover:bg-[#003d80] text-white"
                                    )}
                                >
                                    {renderActionIcon(action.icon)}
                                    {action.label}
                                </button>
                            ))}
                            <button
                                onClick={() => setRowSelection({})}
                                className="ml-1 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Table and Mobile Cards */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                
                {/* Desktop View (Table) */}
                <div className="hidden md:block overflow-x-auto custom-scrollbar">
                    <table className="w-full min-w-full">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase"
                                            style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                                        >
                                            {header.isPlaceholder ? null : (
                                                header.column.getCanSort() ? (
                                                    <button
                                                        onClick={header.column.getToggleSortingHandler()}
                                                        className="flex items-center gap-1.5 hover:text-slate-700 transition-colors group"
                                                    >
                                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                                        <SortIcon direction={header.column.getIsSorted()} />
                                                    </button>
                                                ) : (
                                                    flexRender(header.column.columnDef.header, header.getContext())
                                                )
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
                                        className={cn(
                                            "transition-colors",
                                            row.getIsSelected()
                                                ? "bg-[#002B5B]/5"
                                                : "bg-white hover:bg-slate-50/80"
                                        )}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td
                                                key={cell.id}
                                                className="px-6 py-3 text-sm text-slate-700 break-words whitespace-normal leading-normal"
                                            >
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td
                                        colSpan={allColumns.length}
                                        className="px-5 py-12 text-center text-slate-400 font-normal text-sm"
                                    >
                                        {displayEmptyMessage}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile View (Cards) */}
                <div className="md:hidden divide-y divide-slate-100">
                    {table.getRowModel().rows.length ? (
                        table.getRowModel().rows.map((row) => (
                            <div key={row.id} className={cn("p-5 space-y-4", row.getIsSelected() ? "bg-[#002B5B]/5" : "bg-white")}>
                                {row.getVisibleCells().map((cell) => {
                                    if (cell.column.id === "__select__") {
                                        return (
                                            <div key={cell.id} className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
                                                <span className="text-xs font-semibold uppercase text-slate-400">{t('mobile.select')}</span>
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </div>
                                        );
                                    }
                                    if (cell.column.id === "actions") {
                                        return (
                                            <div key={cell.id} className="pt-3 mt-3 border-t border-slate-100 flex justify-end">
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={cell.id} className="flex flex-col gap-1.5">
                                            <span className="text-xs font-semibold uppercase text-slate-400">
                                                {typeof cell.column.columnDef.header === 'string' ? cell.column.columnDef.header : cell.column.id}
                                            </span>
                                            <div className="text-sm text-slate-700 font-normal break-words whitespace-normal overflow-hidden text-ellipsis">
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    ) : (
                        <div className="p-8 text-center text-slate-400 font-normal text-sm">
                            {displayEmptyMessage}
                        </div>
                    )}
                </div>
            </div>

            {/* Pagination */}
            {showPagination && (
                <div className="flex items-center justify-between gap-6 flex-wrap px-1 pt-2">
                    <div className="text-sm text-slate-500 font-medium">
                        {totalFiltered === 0 ? (
                            t('pagination.noResults')
                        ) : (
                            <>
                                {t.rich('pagination.showing', {
                                    from: from,
                                    to: to,
                                    total: totalFiltered,
                                    span: (chunks) => <span className="font-semibold text-slate-700">{chunks}</span>
                                })}
                                {data.length !== totalFiltered && (
                                    <span className="text-slate-400">{t('pagination.filtered', { total: data.length })}</span>
                                )}
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => table.setPageIndex(0)}
                            disabled={!table.getCanPreviousPage()}
                            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            aria-label={t('pagination.first')}
                        >
                            <ChevronsLeft className="h-4 w-4 text-slate-600" />
                        </button>
                        <button
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            aria-label={t('pagination.previous')}
                        >
                            <ChevronLeft className="h-4 w-4 text-slate-600" />
                        </button>

                        {/* Page numbers */}
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(table.getPageCount(), 5) }, (_, i) => {
                                const totalPages = table.getPageCount();
                                const current = table.getState().pagination.pageIndex;
                                let page: number;
                                if (totalPages <= 5) {
                                    page = i;
                                } else if (current < 3) {
                                    page = i;
                                } else if (current > totalPages - 4) {
                                    page = totalPages - 5 + i;
                                } else {
                                    page = current - 2 + i;
                                }
                                return (
                                    <button
                                        key={page}
                                        onClick={() => table.setPageIndex(page)}
                                            className={cn(
                                                "w-8 h-8 text-xs font-medium rounded-lg transition-all",
                                                page === current
                                                    ? "bg-[#002B5B] text-white shadow-sm"
                                                    : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                                            )}
                                    >
                                        {page + 1}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            aria-label={t('pagination.next')}
                        >
                            <ChevronRight className="h-4 w-4 text-slate-600" />
                        </button>
                        <button
                            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                            disabled={!table.getCanNextPage()}
                            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            aria-label={t('pagination.last')}
                        >
                            <ChevronsRight className="h-4 w-4 text-slate-600" />
                        </button>

                        {/* Page size selector */}
                        <select
                            value={pageSizeState}
                            onChange={(e) => table.setPageSize(Number(e.target.value))}
                            className="ml-2 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-600 focus:border-[#002B5B] outline-none cursor-pointer"
                        >
                            {[5, 10, 20, 50, 100].map((size) => (
                                <option key={size} value={size}>
                                    {t('pagination.perPage', { count: size })}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}
        </div>
    );
}

