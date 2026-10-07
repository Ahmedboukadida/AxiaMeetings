import React from 'react';
import { Badge } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import { Mail, Phone, MoreHorizontal, Shield, Building2, Hash, Trash2 } from 'lucide-react';
import { CardBase } from '@/components/ui/CardBase';

export function UserAdminCard({ user, onEdit, onDelete }: { user: any; onEdit?: () => void; onDelete?: () => void }) {
    const initials = user?.fullname
        ? user.fullname.split(' ').map((n:any) => n[0]).join('').toUpperCase().slice(0, 2)
        : user?.username?.slice(0, 2).toUpperCase() || '??';

    return (
        <CardBase hover className="group relative mt-6 flex flex-col p-6 pt-12 items-center text-center">
            <div className="absolute top-0 left-0 w-full h-1 opacity-50 group-hover:opacity-100 transition-opacity gradient-primary" />
            
            <div className="absolute top-4 right-4 z-10">
                <Badge variant="outline" className="bg-white/80 backdrop-blur-sm border-white/20 text-xs font-bold uppercase tracking-wider text-[#002B5B] shadow-sm rounded-full">
                    {user?.role}
                </Badge>
            </div>

            <div className="w-20 h-20 rounded-full border-4 border-white bg-gradient-to-br from-[#002B5B] to-blue-600 shadow-xl flex items-center justify-center text-white text-2xl font-bold mb-4 relative z-10 shrink-0">
                {initials}
            </div>
            
            <h3 className="text-lg font-bold text-slate-800 mb-1 relative z-10">{user?.fullname || user?.username}</h3>
            <p className="text-sm text-slate-500 font-medium mb-4 relative z-10">@{user?.username}</p>
            
            <div className="w-full space-y-2 mb-6 relative z-10">
                <div className="flex items-center justify-center gap-2 text-sm text-slate-600 bg-white/50 py-2 rounded-xl border border-white/40 shadow-sm">
                    <Mail size={14} className="text-slate-400" />
                    <span className="truncate max-w-[180px]">{user?.email || '—'}</span>
                </div>
                {user?.company && (
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-600 bg-white/50 py-2 rounded-xl border border-white/40 shadow-sm">
                        <Building2 size={14} className="text-slate-400" />
                        <span className="truncate max-w-[180px]">{user.company.name}</span>
                    </div>
                )}
                {user?.identifiant_extern && (
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-600 bg-white/50 py-2 rounded-xl border border-white/40 shadow-sm">
                        <Hash size={14} className="text-slate-400" />
                        <span className="truncate max-w-[180px] font-mono">{user.identifiant_extern}</span>
                    </div>
                )}
            </div>
            
            <div className="flex items-center gap-3 w-full mt-auto relative z-10">
                {onDelete && (
                    <Button variant="outline" onClick={onDelete} className="flex-1 rounded-xl bg-white/60 hover:bg-red-50 text-red-600 border-white/50 shadow-sm transition-all">
                        <Trash2 size={16} />
                    </Button>
                )}
                {onEdit && (
                    <Button onClick={onEdit} className="flex-1 rounded-xl bg-[#002B5B] hover:bg-[#003d80] text-white shadow-lg shadow-blue-900/20 transition-all">
                        Profile
                    </Button>
                )}
            </div>
        </CardBase>
    );
}
