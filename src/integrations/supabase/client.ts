// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://hmcaajyrprstvhunbagl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtY2FhanlycHJzdHZodW5iYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM3MTEwOTksImV4cCI6MjA0OTI4NzA5OX0.MzmDNfUMwhLcNZZT-lsyGedomrxcGg3DZPvPPcXXdxQ";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);