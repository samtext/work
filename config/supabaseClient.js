import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
// Change this to match your .env variable name exactly
const supabaseKey = process.env.SUPABASE_ANON_KEY; 

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ ERROR: Supabase variables are missing from .env!");
}

export const supabase = createClient(supabaseUrl, supabaseKey);