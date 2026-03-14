import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, UPLOAD_BUCKET } from "@/lib/supabase/admin";

export const maxDuration = 60;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  // Verify the request comes from Vercel Cron (or an authorised manual call)
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const admin = createAdminClient();

    // List every file in the bucket (up to 1 000 at a time; loop if needed)
    const toDelete: string[] = [];
    let offset = 0;
    const PAGE = 1000;
    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);

    while (true) {
      const { data, error } = await admin.storage
        .from(UPLOAD_BUCKET)
        .list("", { limit: PAGE, offset, sortBy: { column: "created_at", order: "asc" } });

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;

      for (const file of data) {
        const created = file.created_at ? new Date(file.created_at) : null;
        if (created && created < cutoff) {
          toDelete.push(file.name);
        }
      }

      if (data.length < PAGE) break;
      offset += PAGE;
    }

    let deleted = 0;
    let failed = 0;

    // Delete in batches of 100 (Supabase limit per remove call)
    const BATCH = 100;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = toDelete.slice(i, i + BATCH);
      const { error } = await admin.storage.from(UPLOAD_BUCKET).remove(batch);
      if (error) {
        console.error("[/api/cleanup] remove error:", error.message);
        failed += batch.length;
      } else {
        deleted += batch.length;
      }
    }

    console.log(`[/api/cleanup] scanned ${toDelete.length} expired files, deleted ${deleted}, failed ${failed}`);

    return NextResponse.json({
      ok: true,
      cutoffDate: cutoff.toISOString(),
      expired: toDelete.length,
      deleted,
      failed,
    });
  } catch (err) {
    console.error("[/api/cleanup]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
