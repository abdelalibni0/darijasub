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
export const EXPORT_BUCKET = "export-uploads";

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
  if (error && !error.message.includes("already exists")) {
    throw new Error(`Could not create storage bucket: ${error.message}`);
  }
}

/**
 * Ensures the export-uploads bucket exists (higher size limit for source videos).
 * Safe to call on every request — ignores "already exists" errors.
 */
export async function ensureExportBucket() {
  const admin = createAdminClient();
  const { error } = await admin.storage.createBucket(EXPORT_BUCKET, {
    public: false,
    fileSizeLimit: 524_288_000, // 500 MB
  });
  if (error && !error.message.includes("already exists")) {
    throw new Error(`Could not create export storage bucket: ${error.message}`);
  }
}
