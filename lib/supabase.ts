import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Database {
  public: {
    Tables: {
      vision_test_results: {
        Row: {
          id: string;
          mobile_number: string;
          vision_score: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          mobile_number: string;
          vision_score: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          mobile_number?: string;
          vision_score?: string;
          created_at?: string;
        };
      };
    };
  };
}

// Supabase project URL provided by user
export const DEFAULT_SUPABASE_URL = 'https://qiyhqpjvdehxcfhneelv.supabase.co';

// Environment variables for Supabase
const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  DEFAULT_SUPABASE_URL;

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

export function getSupabaseUrl(): string {
  return supabaseUrl;
}

export function hasSupabaseKey(): boolean {
  return Boolean(supabaseKey && supabaseKey.trim().length > 0);
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// Lazy singleton initialization
let supabaseInstance: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) {
    return null;
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseInstance;
}

export interface VisionTestRecord {
  id?: string;
  mobile_number: string;
  vision_score: string;
  created_at?: string;
}
