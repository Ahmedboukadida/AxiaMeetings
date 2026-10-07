import React from 'react';
import { Badge } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import { ArrowUpRight } from 'lucide-react';
import { CardBase } from '@/components/ui/CardBase';

interface CustomCardProps {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    badge?: { text: string; variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'primary' | 'warning' };
    stats?: { label: string; value: string | number }[];
    actionLabel?: string;
    onAction?: () => void;
    highlight?: boolean;
}

export function CustomCard({ title, subtitle, icon, badge, stats, actionLabel, onAction, highlight }: CustomCardProps) {
    return (
        <CardBase hover className={`group relative h-full flex flex-col p-6 mt-6 ${highlight ? 'bg-gradient-to-br from-blue-50/50 to-white' : ''}`}>
            <div className="absolute top-0 left-0 w-full h-1 opacity-50 group-hover:opacity-100 transition-opacity gradient-primary" />
            
            <div className="flex items-start justify-between mb-4 relative z-10">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm backdrop-blur-md ${highlight ? 'bg-[#002B5B] text-white' : 'bg-white/80 text-[#002B5B] border border-white/50'}`}>
                    {icon}
                </div>
                {badge && (
                    <Badge variant={badge.variant as any || 'outline'} className={`rounded-full text-[10px] font-bold uppercase tracking-wider px-3 py-1 shadow-sm backdrop-blur-sm ${highlight ? 'bg-white/80 border-white/50 text-[#002B5B]' : 'bg-white/50 border-white/40'}`}>
                        {badge.text}
                    </Badge>
                )}
            </div>
            
            <h3 className="text-xl font-bold text-slate-800 mb-1 line-clamp-1 relative z-10">{title}</h3>
            {subtitle && <p className="text-sm text-slate-500 font-medium mb-6 line-clamp-2 relative z-10">{subtitle}</p>}
            
            {stats && stats.length > 0 && (
                <div className="grid grid-cols-2 gap-3 mb-6 mt-auto relative z-10">
                    {stats.map((stat, idx) => (
                        <div key={idx} className="bg-white/50 backdrop-blur-sm rounded-xl p-3 border border-white/40 shadow-sm">
                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">{stat.label}</p>
                            <p className="text-lg font-bold text-slate-800">{stat.value}</p>
                        </div>
                    ))}
                </div>
            )}
            
            {onAction && (
                <Button 
                    onClick={onAction} 
                    className={`w-full rounded-xl mt-auto relative z-10 shadow-sm transition-all ${highlight ? 'bg-[#002B5B] hover:bg-[#003d80] text-white shadow-blue-900/20' : 'bg-white/60 hover:bg-white text-slate-700 border-white/50'}`}
                    variant={highlight ? 'default' : 'outline'}
                >
                    {actionLabel || 'View Details'}
                    <ArrowUpRight size={16} className="ml-2 opacity-50" />
                </Button>
            )}
        </CardBase>
    );
}
