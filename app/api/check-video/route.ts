import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, EXPORT_BUCKET } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const storagePath = request.nextUrl.searchParams.get("path");
  if (!storagePath) {
    return NextResponse.json({ exists: false, error: "path is required" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    // list() with a search on the exact path is the lightest way to check existence
    const { data, error } = await admin.storage
      .from(EXPORT_BUCKET)
      .list(storagePath.split("/").slice(0, -1).join("/") || "", {
        search: storagePath.split("/").pop(),
        limit: 1,
      });

    if (error) {
      console.error("[/api/check-video]", error.message);
      return NextResponse.json({ exists: false });
    }

    const exists = Array.isArray(data) && data.some((f) => {
      const name = f.name;
      const tail = storagePath.split("/").pop();
      return name === tail;
    });

    return NextResponse.json({ exists });
  } catch (err) {
    console.error("[/api/check-video]", err);
    return NextResponse.json({ exists: false });
  }
}
