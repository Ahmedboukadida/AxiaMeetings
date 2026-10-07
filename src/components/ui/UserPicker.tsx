'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, UserPlus, Users, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface User {
    id: number;
    username?: string;
    fullname?: string;
    email: string;
}

interface UserPickerProps {
    /** All available users to pick from */
    users: User[];
    /** Comma-separated string of selected emails */
    value: string;
    /** Called with new comma-separated email string on change */
    onChange: (value: string) => void;
    /** Whether adding emails by typing is also allowed */
    allowFreeText?: boolean;
    placeholder?: string;
}

export function UserPicker({ users, value, onChange, allowFreeText = true, placeholder }: UserPickerProps) {
    const t = useTranslations('Common.userPicker');
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [freeEmail, setFreeEmail] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    // Parse selected emails from the comma-separated string
    const selectedEmails = value
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus search when opening
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => searchRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const filtered = users.filter(u => {
        const term = searchTerm.toLowerCase();
        if (!term) return true;
        return (
            u.email?.toLowerCase().includes(term) ||
            u.fullname?.toLowerCase().includes(term) ||
            u.username?.toLowerCase().includes(term)
        );
    });

    const toggleUser = useCallback((email: string) => {
        const current = selectedEmails;
        const updated = current.includes(email)
            ? current.filter(e => e !== email)
            : [...current, email];
        onChange(updated.join(', '));
    }, [selectedEmails, onChange]);

    const removeEmail = useCallback((email: string) => {
        onChange(selectedEmails.filter(e => e !== email).join(', '));
    }, [selectedEmails, onChange]);

    const addFreeEmail = () => {
        const email = freeEmail.trim();
        if (!email || selectedEmails.includes(email)) return;
        onChange([...selectedEmails, email].join(', '));
        setFreeEmail('');
    };

    const getDisplayName = (email: string) => {
        const u = users.find(u => u.email === email);
        return u?.fullname || u?.username || email;
    };

    const unselectedCount = users.filter(u => !selectedEmails.includes(u.email)).length;

    return (
        <div className="space-y-2" ref={containerRef}>

            {/* Selected chips */}
            {selectedEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 bg-blue-50 border border-blue-100 rounded-xl min-h-[40px]">
                    {selectedEmails.map(email => (
                        <span
                            key={email}
                            className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-lg shadow-sm"
                        >
                            <span className="max-w-[200px] truncate" title={email}>
                                {getDisplayName(email)}
                            </span>
                            <button
                                type="button"
                                onClick={() => removeEmail(email)}
                                className="hover:bg-blue-500 rounded p-1 transition-colors flex-shrink-0"
                            >
                                <X size={14} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* Trigger button */}
            <button
                type="button"
                onClick={() => setIsOpen(prev => !prev)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 border border-slate-200 rounded-xl bg-white hover:border-blue-300 transition-all text-left text-base"
            >
                <span className="flex items-center gap-2 text-slate-500">
                    <Users size={18} className="text-slate-400" />
                    {selectedEmails.length === 0
                        ? <span>{t('selectFromCompany')}</span>
                        : <span className="font-bold text-slate-700">{t('selected', { count: selectedEmails.length })}</span>
                    }
                </span>
                <div className="flex items-center gap-2">
                    {unselectedCount > 0 && (
                        <span className="text-base font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">
                            {t('available', { count: unselectedCount })}
                        </span>
                    )}
                    <ChevronDown size={20} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {/* Dropdown panel */}
            {isOpen && (
                <div className="border border-slate-200 rounded-xl bg-white shadow-xl overflow-hidden z-50 relative">
                    {/* Search bar */}
                    <div className="p-2 border-b border-slate-100 bg-slate-50">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                ref={searchRef}
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder={placeholder || t('placeholder')}
                                className="w-full pl-9 pr-3 py-2.5 text-base border border-slate-200 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 outline-none bg-white transition-all"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* User list */}
                    <div className="max-h-[200px] overflow-y-auto divide-y divide-slate-50">
                        {filtered.length === 0 ? (
                            <div className="p-4 text-center text-slate-400 text-sm font-medium">
                                {t('noMatch', { term: searchTerm })}
                            </div>
                        ) : (
                            filtered.map(u => {
                                const isSelected = selectedEmails.includes(u.email);
                                return (
                                    <button
                                        key={u.id}
                                        type="button"
                                        onClick={() => toggleUser(u.email)}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-blue-50 ${isSelected ? 'bg-blue-50/70' : ''}`}
                                    >
                                        {/* Avatar */}
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                            {(u.fullname || u.username || u.email).charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-base font-bold truncate ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                                                {u.fullname || u.username || u.email}
                                            </p>
                                            <p className="text-sm text-slate-400 truncate">{u.email}</p>
                                        </div>
                                        {isSelected && (
                                            <span className="shrink-0 text-sm font-black uppercase tracking-widest text-blue-600 bg-blue-100 px-2 py-1 rounded-md">
                                                ✓ {t('added')}
                                            </span>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Footer: select all / clear */}
                    <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex justify-between items-center text-sm font-bold text-slate-500">
                        <button
                            type="button"
                            onClick={() => {
                                const all = users.map(u => u.email);
                                onChange(all.join(', '));
                            }}
                            className="hover:text-blue-600 transition-colors uppercase tracking-widest"
                        >
                            {t('selectAll', { count: users.length })}
                        </button>
                        {selectedEmails.length > 0 && (
                            <button
                                type="button"
                                onClick={() => onChange('')}
                                className="hover:text-red-600 transition-colors uppercase tracking-widest"
                            >
                                {t('clearAll')}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Optional: add by free text email */}
            {allowFreeText && (
                <div className="flex gap-2">
                    <input
                        type="email"
                        value={freeEmail}
                        onChange={e => setFreeEmail(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFreeEmail(); } }}
                        placeholder={t('manualEmail')}
                        className="flex-1 px-4 py-3 text-base border border-slate-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 outline-none transition-all"
                    />
                    <button
                        type="button"
                        onClick={addFreeEmail}
                        disabled={!freeEmail.trim()}
                        className="px-3 py-2 bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 rounded-xl transition-colors disabled:opacity-40 border border-slate-200"
                    >
                        <UserPlus size={15} />
                    </button>
                </div>
            )}
        </div>
    );
}


