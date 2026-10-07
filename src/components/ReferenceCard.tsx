import React from 'react';
import { Badge } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import { Globe, Type, Settings2, Pencil } from 'lucide-react';
import { CardBase } from '@/components/ui/CardBase';

export function ReferenceCard({ reference, onEdit }: { reference: any; onEdit?: () => void }) {
    const isSystem = reference?.isSystem;

    return (
        <CardBase hover className="group flex flex-col h-full mt-6 p-5 relative">
            <div className="absolute top-0 left-0 w-full h-1 opacity-50 group-hover:opacity-100 transition-opacity gradient-primary" />
            
            <div className="flex items-start justify-between mb-4 z-10 relative">
                <div className="w-10 h-10 rounded-xl bg-white/80 border border-white/50 shadow-sm backdrop-blur-md flex items-center justify-center text-[#002B5B]">
                    {reference?.type === 'LOCALE' ? <Globe size={18} /> : 
                     reference?.type === 'CATEGORY' ? <Type size={18} /> : 
                     <Settings2 size={18} />}
                </div>
                {isSystem && (
                    <Badge variant="outline" className="bg-white/50 backdrop-blur-sm text-slate-500 border-white/40 shadow-sm text-[10px] uppercase font-bold">
                        System
                    </Badge>
                )}
            </div>
            
            <h3 className="text-base font-bold text-slate-800 mb-1 break-words z-10 relative">{reference?.code || reference?.name}</h3>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-4 z-10 relative">{reference?.type}</p>
            
            <div className="mt-auto flex gap-2 z-10 relative">
                {onEdit && (
                    <Button onClick={onEdit} variant="outline" className="w-full flex items-center justify-center gap-2 rounded-xl h-9 text-xs mt-4 bg-white/60 hover:bg-white border-white/50 shadow-sm transition-all">
                        <Pencil size={12} /> Edit
                    </Button>
                )}
            </div>
        </CardBase>
    );
}
