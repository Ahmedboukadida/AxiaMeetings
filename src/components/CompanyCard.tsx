import React from 'react';
import { Badge } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Building2, Mail, Phone, Users, Server, Sparkles } from 'lucide-react';
import { CardBase } from '@/components/ui/CardBase';

export function CompanyCard({ company, onEdit, onViewServices, onToggleAi }: { company: any; onEdit?: () => void; onViewServices?: () => void; onToggleAi?: () => void }) {
    const initials = company?.name ? company.name.substring(0, 2).toUpperCase() : 'CO';
    const activeStatus = company?.status === 'ACTIVE';
    
    const activeServices = [
        !!company?.login_endpoint_id,
        !!company?.users_endpoint_id,
        company?.have_notifications_service,
        company?.have_messages_service,
        company?.have_sms_service
    ].filter(Boolean).length;

    return (
        <CardBase hover className="group relative mt-6 h-full flex flex-col p-6 pt-8 items-center text-center">
            <div className="absolute top-0 left-0 w-full h-1 opacity-50 group-hover:opacity-100 transition-opacity gradient-primary" />
            
            <div className="absolute top-4 right-4 z-10">
                <Badge variant={activeStatus ? 'default' : 'secondary'} className={cn('uppercase text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full', activeStatus ? 'bg-green-500/10 text-green-600 border-green-500/20 shadow-sm' : 'bg-slate-100/50 text-slate-500')}>
                    {company?.status || 'INACTIVE'}
                </Badge>
            </div>

            <div className="w-16 h-16 rounded-2xl border border-white/50 bg-white/80 shadow-sm flex items-center justify-center text-[#002B5B] text-xl font-bold mb-4 z-10 relative shrink-0 backdrop-blur-md">
                {initials}
            </div>
            
            <h3 className="text-lg font-bold text-slate-800 mb-1 line-clamp-1 relative z-10">{company?.name}</h3>
            
            <div className="w-full space-y-2 mb-6 mt-4 relative z-10">
                {company?.email && (
                    <div className="flex items-center justify-center gap-2 text-xs text-slate-600 bg-white/50 py-1.5 rounded-xl border border-white/40 shadow-sm">
                        <Mail size={12} className="text-slate-400" />
                        <span className="truncate max-w-[180px]">{company.email}</span>
                    </div>
                )}
                {company?.phone && (
                    <div className="flex items-center justify-center gap-2 text-xs text-slate-600 bg-white/50 py-1.5 rounded-xl border border-white/40 shadow-sm">
                        <Phone size={12} className="text-slate-400" />
                        <span className="truncate max-w-[180px]">{company.phone}</span>
                    </div>
                )}
            </div>
            
            <div className="flex items-center gap-2 w-full mt-auto relative z-10 mb-3">
                {onViewServices && (
                    <Button onClick={onViewServices} variant="outline" className="flex-1 h-8 rounded-lg bg-white/60 hover:bg-white text-slate-600 shadow-sm transition-all text-xs" title="View Services">
                        <Server size={12} className="mr-1" />
                        {activeServices} Services
                    </Button>
                )}
                {onToggleAi && (
                    <Button onClick={onToggleAi} variant="outline" className={cn("flex-1 h-8 rounded-lg shadow-sm transition-all text-xs", company?.ai_is_active ? "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100" : "bg-white/60 text-slate-400 hover:bg-white")} title="Toggle AI">
                        <Sparkles size={12} className={cn("mr-1", company?.ai_is_active && "animate-pulse")} />
                        AI
                    </Button>
                )}
            </div>

            {onEdit && (
                <Button onClick={onEdit} variant="outline" className="w-full rounded-xl bg-white/60 hover:bg-[#002B5B] hover:text-white border-white/50 shadow-sm transition-all relative z-10">
                    View Details
                </Button>
            )}
        </CardBase>
    );
}
