'use client';

import React from 'react';
import Link from 'next/link';
import { Database } from 'lucide-react';
import { SankaraLogo } from './SankaraLogo';
import { SupportedLanguage } from '@/lib/types';

interface HeaderProps {
  currentLanguage?: SupportedLanguage;
  onLanguageChange?: (lang: SupportedLanguage) => void;
  showAdminLink?: boolean;
  minimal?: boolean;
  onOpenRecords?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  minimal = false,
  onOpenRecords,
}) => {
  return (
    <header className="w-full bg-white/95 backdrop-blur-md border-b border-orange-100/80 sticky top-0 z-30" id="main-app-header">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 sm:h-18 flex items-center justify-between gap-3">
        {/* Sankara Eye Foundation, India Logo */}
        <Link href="/" className="hover:opacity-90 transition flex items-center py-1" id="header-home-link" aria-label="Sankara Eye Foundation, India Home">
          <SankaraLogo variant={minimal ? 'compact' : 'full'} size="md" />
        </Link>

        {/* Database Records Trigger */}
        <div className="flex items-center gap-2">
          {onOpenRecords ? (
            <button
              type="button"
              onClick={onOpenRecords}
              className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-700 hover:text-orange-700 bg-orange-50 hover:bg-orange-100/80 border border-orange-200/80 transition cursor-pointer"
              id="btn-open-database-records"
            >
              <Database className="w-4 h-4 text-orange-600" />
              <span>Database Records</span>
            </button>
          ) : (
            <Link
              href="/records"
              className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-700 hover:text-orange-700 bg-orange-50 hover:bg-orange-100/80 border border-orange-200/80 transition"
              id="btn-link-database-records"
            >
              <Database className="w-4 h-4 text-orange-600" />
              <span>Database Records</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};
