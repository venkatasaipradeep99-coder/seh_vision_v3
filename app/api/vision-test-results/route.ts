import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseClient,
  getSupabaseUrl,
  hasSupabaseKey,
  isSupabaseConfigured,
  VisionTestRecord,
} from '@/lib/supabase';

// In-memory fallback repository for environments before Supabase credentials are configured
// or for offline resilience
const fallbackResults: VisionTestRecord[] = [];

// Strict 10-digit Indian mobile number validator
function isValidIndianMobile(number: string): boolean {
  if (!number || typeof number !== 'string') return false;
  const cleaned = number.trim().replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(cleaned)) return false;
  if (!/^[6-9]/.test(cleaned)) return false; // Indian mobile starts with 6, 7, 8, 9
  if (/^(\d)\1{9}$/.test(cleaned)) return false; // Reject repeated digits like 0000000000, 9999999999
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mobile_number, vision_score } = body;

    // Validate mobile number
    if (!mobile_number || !isValidIndianMobile(String(mobile_number))) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid 10-digit Indian mobile number. Must be exactly 10 digits starting with 6-9.',
        },
        { status: 400 }
      );
    }

    // Validate vision score
    if (!vision_score || typeof vision_score !== 'string' || !vision_score.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Vision score is required.',
        },
        { status: 400 }
      );
    }

    const cleanMobile = String(mobile_number).trim();
    const cleanScore = String(vision_score).trim();
    const nowIso = new Date().toISOString();

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await (supabase as any)
          .from('vision_test_results')
          .insert([
            {
              mobile_number: cleanMobile,
              vision_score: cleanScore,
            },
          ])
          .select()
          .single();

        if (error) {
          console.warn('[Supabase] Insert warning, falling back to storage:', error.message);
          // Still store in memory so test data is never lost
          const fallbackRecord: VisionTestRecord = {
            id: `vtr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            mobile_number: cleanMobile,
            vision_score: cleanScore,
            created_at: nowIso,
          };
          fallbackResults.unshift(fallbackRecord);
          return NextResponse.json({
            success: true,
            data: fallbackRecord,
            source: 'local_fallback',
            supabase_warning: error.message,
          });
        }

        return NextResponse.json({
          success: true,
          data,
          source: 'supabase',
        });
      } catch (dbErr: any) {
        console.error('[Supabase] Exception during insert:', dbErr);
      }
    }

    // If Supabase not configured yet or threw exception, store in fallback store
    const localRecord: VisionTestRecord = {
      id: `vtr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      mobile_number: cleanMobile,
      vision_score: cleanScore,
      created_at: nowIso,
    };
    fallbackResults.unshift(localRecord);

    return NextResponse.json({
      success: true,
      data: localRecord,
      source: isSupabaseConfigured ? 'local_fallback' : 'local_storage',
      message: isSupabaseConfigured
        ? 'Saved to fallback store'
        : 'Saved successfully. Configure SUPABASE_URL and SUPABASE_ANON_KEY to persist directly in Supabase cloud.',
    });
  } catch (err: any) {
    console.error('Error in vision-test-results API route:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to save vision test result',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const projectUrl = getSupabaseUrl();
  const configured = hasSupabaseKey();

  try {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await (supabase as any)
        .from('vision_test_results')
        .select('id, mobile_number, vision_score, created_at')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return NextResponse.json({
          success: true,
          data,
          total: data.length,
          source: 'supabase',
          project_url: projectUrl,
          is_configured: true,
        });
      }

      if (error) {
        console.warn('[Supabase GET] Error querying vision_test_results:', error.message);
        return NextResponse.json({
          success: true,
          data: fallbackResults,
          total: fallbackResults.length,
          source: 'local_storage',
          project_url: projectUrl,
          is_configured: true,
          supabase_error: error.message,
          hint: 'Table vision_test_results may need to be created or RLS SELECT policy enabled.',
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: fallbackResults,
      total: fallbackResults.length,
      source: 'local_storage',
      project_url: projectUrl,
      is_configured: configured,
      hint: configured
        ? 'Connected'
        : 'To stream live records directly from Supabase, provide NEXT_PUBLIC_SUPABASE_ANON_KEY in Settings.',
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to retrieve vision test results',
        project_url: projectUrl,
        is_configured: configured,
      },
      { status: 500 }
    );
  }
}
