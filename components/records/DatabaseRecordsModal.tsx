'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  RefreshCw,
  Search,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  Phone,
  Clock,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Calendar,
} from 'lucide-react';

export interface TestRecordItem {
  id: string;
  mobile_number: string;
  vision_score: string;
  created_at: string;
}

interface DatabaseRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DatabaseRecordsModal: React.FC<DatabaseRecordsModalProps> = ({ isOpen, onClose }) => {
  const [records, setRecords] = useState<TestRecordItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'supabase' | 'local_storage'>('local_storage');
  const [projectUrl, setProjectUrl] = useState<string>('https://qiyhqpjvdehxcfhneelv.supabase.co');
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vision-test-results', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRecords(json.data);
        if (json.source) setSource(json.source);
        if (json.project_url) setProjectUrl(json.project_url);
        if (typeof json.is_configured === 'boolean') setIsConfigured(json.is_configured);
      } else {
        setError(json.error || 'Unable to load records');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    fetch('/api/vision-test-results', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (!isMounted) return;
        if (json.success && Array.isArray(json.data)) {
          setRecords(json.data);
          if (json.source) setSource(json.source);
          if (json.project_url) setProjectUrl(json.project_url);
          if (typeof json.is_configured === 'boolean') setIsConfigured(json.is_configured);
        } else {
          setError(json.error || 'Unable to load records');
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Network error fetching records');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.mobile_number.toLowerCase().includes(q) ||
        r.vision_score.toLowerCase().includes(q) ||
        (r.id && r.id.toLowerCase().includes(q))
    );
  }, [records, searchQuery]);

  const copyToClipboard = (text: string, id: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const exportCsv = () => {
    if (records.length === 0) return;
    const header = ['ID', 'Mobile Number', 'Vision Score', 'Created At'];
    const rows = records.map((r) => [
      `"${r.id || ''}"`,
      `"${r.mobile_number || ''}"`,
      `"${r.vision_score || ''}"`,
      `"${r.created_at || ''}"`,
    ]);
    const csvContent = [header.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `vision_test_results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      id="database-records-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        id="database-records-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-b from-orange-50/40 to-white flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-orange-100/80 border border-orange-200 text-orange-700 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Vision Test Database Records
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 font-medium flex items-center gap-1.5 flex-wrap">
                <span>Project:</span>
                <span className="font-mono text-orange-700 font-bold bg-orange-50 px-1.5 py-0.5 rounded-md border border-orange-200/60">
                  {projectUrl.replace('https://', '')}
                </span>
                <span className="text-slate-300">•</span>
                <span>Table:</span>
                <span className="font-mono text-slate-700 font-bold">vision_test_results</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer shrink-0"
            id="btn-close-records-modal"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status bar */}
        <div className="px-5 sm:px-6 py-3 bg-slate-50 border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            {source === 'supabase' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Connected to Supabase Cloud</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-bold">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Local Session Cache (Awaiting Supabase Key)</span>
              </span>
            )}
            <span className="text-slate-500 font-medium">
              Total Records: <strong className="text-slate-900 font-mono">{records.length}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchRecords}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer text-xs disabled:opacity-50"
              id="btn-refresh-records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-600' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={records.length === 0}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl transition cursor-pointer text-xs disabled:opacity-50"
              id="btn-export-csv"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Notice for Supabase Key if in local storage mode */}
        {!isConfigured && (
          <div className="mx-5 sm:mx-6 mt-4 p-3.5 rounded-2xl bg-orange-50/70 border border-orange-200/80 flex items-start gap-3 text-xs">
            <ShieldCheck className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
            <div className="text-slate-700 leading-relaxed">
              <span className="font-bold text-slate-900">Connecting to {projectUrl}:</span> To sync
              and read live data directly from your Supabase cloud project, configure your{' '}
              <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-orange-200 text-orange-800 font-bold">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{' '}
              in your environment settings. All test results in this session are safely preserved and
              ready to push.
            </div>
          </div>
        )}

        {/* Search Input */}
        <div className="p-4 sm:px-6 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by 10-digit mobile number or vision score..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition"
              id="input-search-records"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Records List/Table */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2">
          {loading ? (
            <div className="py-16 text-center text-slate-500">
              <RefreshCw className="w-7 h-7 text-orange-600 animate-spin mx-auto mb-3" />
              <p className="font-bold text-sm">Fetching records from {projectUrl}...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-rose-600">
              <AlertCircle className="w-7 h-7 mx-auto mb-2" />
              <p className="font-bold text-sm">{error}</p>
              <button
                type="button"
                onClick={fetchRecords}
                className="mt-3 px-3 py-1.5 bg-orange-600 text-white font-bold rounded-xl text-xs"
              >
                Try Again
              </button>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="py-16 text-center text-slate-400" id="records-empty-state">
              <Phone className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="font-bold text-slate-700 text-sm">No test results found</p>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery ? 'No records match your search filter.' : 'Run a vision test to record your first result.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredRecords.map((rec, index) => {
                const isPassing =
                  rec.vision_score.includes('5/5') ||
                  rec.vision_score.includes('4/5') ||
                  rec.vision_score.includes('Passed');
                const dateStr = rec.created_at
                  ? new Date(rec.created_at).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : 'Recent';

                return (
                  <div
                    key={rec.id || `record-${index}`}
                    className="p-3.5 rounded-2xl bg-white border border-slate-200/90 hover:border-orange-300 transition-all shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        #{index + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                          <span className="font-mono font-black text-slate-900 text-base sm:text-lg tracking-wide">
                            {rec.mobile_number}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(rec.mobile_number, `mob-${rec.id}`)}
                            title="Copy mobile number"
                            className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
                          >
                            {copiedId === `mob-${rec.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          <span>{dateStr}</span>
                          {rec.id && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-[11px] truncate max-w-[120px]">
                                ID: {rec.id}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div className="text-right">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Vision Score
                        </div>
                        <div
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs sm:text-sm font-black font-mono mt-0.5 ${
                            isPassing
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{rec.vision_score}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>
            Displaying <strong className="text-slate-800 font-mono">{filteredRecords.length}</strong> of{' '}
            <strong className="text-slate-800 font-mono">{records.length}</strong> records
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
