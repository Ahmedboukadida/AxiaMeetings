import React from 'react';
import { Row, flexRender } from '@tanstack/react-table';
import { cn, formatLogoUrl } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { MoreVertical } from 'lucide-react';

export interface CustomCardDesignProps<TData> {
    row: Row<TData>;
}

export function CustomCardDesign<TData>({ row }: CustomCardDesignProps<TData>) {
    const t = useTranslations('Common.table');
    const cells = row.getVisibleCells();
    
    // Find special cells to position them differently
    const selectCell = cells.find(c => c.column.id === "__select__");
    const actionsCell = cells.find(c => c.column.id === "actions");
    
    // All other content cells
    const contentCells = cells.filter(c => c.column.id !== "__select__" && c.column.id !== "actions");

    const titleCell = contentCells.length > 0 ? contentCells[0] : null;
    const remainingCells = contentCells.slice(1);

    // Dynamic Image Detection for generic rows (e.g. companies, references)
    const originalData = row.original as any;
    const rawImageUrl = originalData?.logo_file_name || originalData?.logo_url || originalData?.image_url;
    const formattedImg = formatLogoUrl(rawImageUrl);

    return (
        <motion.div
            whileHover={{ y: -8, transition: { duration: 0.3, ease: "easeOut" } }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "group relative bg-[#0a0715] rounded-3xl border border-purple-500/10 shadow-[0_0_20px_rgba(168,85,247,0.05)] hover:shadow-[0_0_35px_rgba(168,85,247,0.15)] transition-all duration-500 flex flex-col h-full overflow-hidden",
                row.getIsSelected() && "border-purple-500/50 ring-2 ring-purple-500/20"
            )}
        >
            {/* Dark Purple Glow Background Element */}
            <div className="absolute -top-32 -right-32 w-64 h-64 bg-purple-600/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-purple-600/20 transition-all duration-700" />
            <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-blue-600/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-blue-600/20 transition-all duration-700" />

            {/* Top Area with Optional Select */}
            {selectCell && (
                <div className="absolute top-4 right-4 z-20">
                    <div className="scale-110">
                        {flexRender(selectCell.column.columnDef.cell, selectCell.getContext())}
                    </div>
                </div>
            )}

            <div className="p-6 flex flex-col flex-1 relative z-10 space-y-6">
                {/* Image and Title Row */}
                <div className="flex items-center gap-4">
                    {formattedImg && (
                        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-purple-500/20 overflow-hidden flex-shrink-0 flex items-center justify-center p-2 shadow-[0_0_15px_rgba(168,85,247,0.1)]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={formattedImg} alt="Logo" className="w-full h-full object-contain" />
                        </div>
                    )}
                    
                    {titleCell && (
                        <div className="min-w-0 flex-1">
                            <div className="text-[9px] font-black tracking-[0.15em] uppercase text-purple-400/70 mb-1">
                                {typeof titleCell.column.columnDef.header === 'string' 
                                    ? titleCell.column.columnDef.header 
                                    : titleCell.column.id}
                            </div>
                            <h3 className="text-xl font-bold text-white leading-tight truncate tracking-tight group-hover:text-purple-300 transition-colors">
                                {flexRender(titleCell.column.columnDef.cell, titleCell.getContext())}
                            </h3>
                        </div>
                    )}
                </div>

                {/* Grid of properties */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                    {remainingCells.map((cell, idx) => (
                        <div key={cell.id} className="flex flex-col min-w-0 bg-white/[0.02] hover:bg-white/[0.04] transition-colors rounded-xl p-3.5 border border-white/[0.05]">
                            <div className="text-[9px] font-black tracking-widest uppercase text-slate-500 mb-1 truncate">
                                {typeof cell.column.columnDef.header === 'string' 
                                    ? cell.column.columnDef.header 
                                    : cell.column.id}
                            </div>
                            <div className="text-xs font-semibold text-slate-300 truncate">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                        </div>
                    ))}
                </div>
                
                {/* Bottom Action Area */}
                <div className="pt-4 border-t border-white/[0.08] flex items-center justify-end w-full">
                    {actionsCell ? (
                        <div className="w-full flex justify-end gap-2 [&>*]:w-full [&>button]:w-full [&_button]:w-full [&_.flex]:w-full [&_button]:bg-white/5 [&_button:hover]:bg-purple-500/20 [&_button:hover]:text-purple-300 [&_button]:border-white/10 [&_button]:backdrop-blur-sm [&_button]:text-slate-300">
                            {flexRender(actionsCell.column.columnDef.cell, actionsCell.getContext())}
                        </div>
                    ) : (
                        <button className="w-full h-10 flex items-center justify-center bg-white/5 hover:bg-purple-500/20 border border-white/10 rounded-xl text-slate-300 transition-all font-bold text-xs uppercase tracking-wider backdrop-blur-sm shadow-sm hover:shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                            {t('selectRow')}
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
}


