import { createClient } from "@supabase/supabase-js";

/** Server-only admin client using the service role key — never expose to the browser. */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export const UPLOAD_BUCKET = "temp-uploads";

/**
 * Ensures the temp-uploads bucket exists.
 * Safe to call on every request — ignores "already exists" errors.
 */
export async function ensureBucket() {
  const admin = createAdminClient();
  const { error } = await admin.storage.createBucket(UPLOAD_BUCKET, {
    public: false,
    fileSizeLimit: 26_214_400, // 25 MB
  });
  // "already exists" is not a real error
  if (error && !error.message.includes("already exists")) {
    throw new Error(`Could not create storage bucket: ${error.message}`);
  }
}
