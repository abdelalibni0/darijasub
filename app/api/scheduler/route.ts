import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getAuthedSupabase() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthedSupabase();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("scheduled_posts")
      .select("*")
      .order("scheduled_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ posts: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch posts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthedSupabase();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json() as {
      platform?: string;
      scheduled_at?: string;
      caption?: string;
      hashtags?: string;
      video_url?: string;
      project_id?: string;
    };

    const { platform, scheduled_at, caption, hashtags, video_url, project_id } = body;

    if (!platform?.trim())    return NextResponse.json({ error: "platform is required" }, { status: 400 });
    if (!scheduled_at?.trim()) return NextResponse.json({ error: "scheduled_at is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("scheduled_posts")
      .insert({
        user_id:      user.id,
        platform,
        scheduled_at,
        caption:      caption ?? null,
        hashtags:     hashtags ?? null,
        video_url:    video_url ?? null,
        project_id:   project_id ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ post: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthedSupabase();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, status } = await request.json() as { id?: string; status?: string };
    if (!id?.trim())     return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (!status?.trim()) return NextResponse.json({ error: "status is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("scheduled_posts")
      .update({ status })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ post: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthedSupabase();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await request.json() as { id?: string };
    if (!id?.trim()) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await supabase
      .from("scheduled_posts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
