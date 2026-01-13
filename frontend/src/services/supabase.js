import { createClient } from '@supabase/supabase-js';

// 1. Initialize Client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase Keys in .env file");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 2. Upload Helper Function
// Returns: { url: string | null, error: object | null }
export const uploadFile = async (file, bucket = 'task-assets') => {
  try {
    // A. Sanitize file name to avoid collisions
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '-')}`;
    const filePath = `${fileName}`;

    // B. Upload to Supabase
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      throw error;
    }

    // C. Get Public URL
    const { data: publicData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return { url: publicData.publicUrl, error: null };

  } catch (error) {
    console.error("Supabase Upload Error:", error.message);
    return { url: null, error };
  }
};