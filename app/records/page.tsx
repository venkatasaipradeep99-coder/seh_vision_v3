'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/branding/Header';
import {
  Database,
  RefreshCw,
  Search,
  Download,
  ArrowLeft,
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

interface TestRecordItem {
  id: string;
  mobile_number: string;
  vision_score: string;
  created_at: string;
}

export default function RecordsPage() {
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
  }, []);

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

  return (
    <div className="min-h-screen bg-[#FFFDF9] flex flex-col justify-between selection:bg-orange-100 text-slate-900 font-sans">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 w-full">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-orange-200/80 text-orange-800 hover:bg-orange-50 font-bold text-xs sm:text-sm transition"
            id="link-back-to-test"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Vision Test</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchRecords}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer text-xs disabled:opacity-50"
              id="btn-refresh-records-page"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-600' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={records.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl transition cursor-pointer text-xs disabled:opacity-50"
              id="btn-export-csv-page"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Hero Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-orange-100 shadow-sm mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200 text-orange-700 flex items-center justify-center shrink-0">
                <Database className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  Vision Test Database Records
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium flex items-center gap-1.5 flex-wrap">
                  <span>Supabase Instance:</span>
                  <span className="font-mono text-orange-700 font-bold bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200/60">
                    {projectUrl.replace('https://', '')}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span>Table:</span>
                  <span className="font-mono text-slate-800 font-bold">vision_test_results</span>
                </p>
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                Total Records
              </span>
              <span className="text-2xl sm:text-3xl font-mono font-black text-slate-900">
                {records.length}
              </span>
            </div>
          </div>

          {/* Status badge */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              {source === 'supabase' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Connected to Supabase Cloud</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-bold">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Local Session Cache (Awaiting Supabase Key)</span>
                </span>
              )}
            </div>

            {!isConfigured && (
              <div className="text-slate-500 text-xs">
                Provide <code className="font-mono text-orange-700 font-bold">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in Settings to stream cloud records live.
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by 10-digit mobile number or vision score..."
              className="w-full pl-9 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 shadow-2xs transition"
              id="input-search-records-page"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Records List */}
        <div className="bg-white rounded-3xl p-4 sm:p-6 border border-orange-100 shadow-sm">
          {loading ? (
            <div className="py-20 text-center text-slate-500">
              <RefreshCw className="w-8 h-8 text-orange-600 animate-spin mx-auto mb-3" />
              <p className="font-bold text-sm">Querying {projectUrl}...</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center text-rose-600">
              <AlertCircle className="w-8 h-8 mx-auto mb-2" />
              <p className="font-bold text-sm">{error}</p>
              <button
                type="button"
                onClick={fetchRecords}
                className="mt-3 px-4 py-2 bg-orange-600 text-white font-bold rounded-xl text-xs"
              >
                Try Again
              </button>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Phone className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-bold text-slate-700 text-base">No vision test records found</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {searchQuery ? 'No records match your search query.' : 'Tests conducted on the app will appear in this database table.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
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
                    className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-orange-300 transition-all shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 text-orange-700 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        #{index + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-orange-600 shrink-0" />
                          <span className="font-mono font-black text-slate-900 text-lg tracking-wide">
                            {rec.mobile_number}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(rec.mobile_number, `mob-page-${rec.id}`)}
                            title="Copy mobile number"
                            className="text-slate-400 hover:text-slate-700 p-1 rounded cursor-pointer"
                          >
                            {copiedId === `mob-page-${rec.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{dateStr}</span>
                          {rec.id && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-[11px] truncate max-w-[160px]">
                                ID: {rec.id}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div className="text-right">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Vision Score
                        </div>
                        <div
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-sm font-black font-mono mt-0.5 ${
                            isPassing
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
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
      </main>
    </div>
  );
}
