// Cron job: runs every minute via Vercel crons
// Required env vars:
//   RESEND_API_KEY          — from resend.com
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY — generate: npx web-push generate-vapid-keys
//   VAPID_PRIVATE_KEY       — generate: npx web-push generate-vapid-keys
//   VAPID_EMAIL             — mailto:aabaalimanager@gmail.com
//   CRON_SECRET             — set in Vercel project settings → Environment Variables

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import webpush from "web-push";

const SCHEDULER_URL = "https://darija-subtitle.vercel.app/dashboard/scheduler";

const PLATFORM_LABELS: Record<string, string> = {
  tiktok:         "TikTok",
  instagram:      "Instagram",
  facebook:       "Facebook",
  youtube:        "YouTube",
  youtube_shorts: "YouTube Shorts",
  x:              "X (Twitter)",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

export async function GET(request: NextRequest) {
  // Verify Vercel cron secret (optional but recommended)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Configure web-push VAPID
  const vapidPublic  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail   = process.env.VAPID_EMAIL ?? "mailto:aabaalimanager@gmail.com";
  const pushEnabled  = vapidPublic && vapidPrivate;
  if (pushEnabled) {
    webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
  }

  // Find posts due in the next 35 minutes that haven't been reminded yet
  const now    = new Date().toISOString();
  const cutoff = new Date(Date.now() + 35 * 60 * 1000).toISOString();

  const { data: posts, error: postsError } = await admin
    .from("scheduled_posts")
    .select("*")
    .eq("status", "scheduled")
    .is("reminded_at", null)
    .gte("scheduled_at", now)
    .lte("scheduled_at", cutoff);

  if (postsError) {
    console.error("[remind] query error:", postsError.message);
    return NextResponse.json({ error: postsError.message }, { status: 500 });
  }

  if (!posts || posts.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;

  for (const post of posts) {
    const platformLabel = PLATFORM_LABELS[post.platform] ?? post.platform;
    const timeStr       = formatTime(post.scheduled_at);

    // Get user email via admin auth API
    const { data: userData, error: userError } =
      await admin.auth.admin.getUserById(post.user_id);

    if (userError || !userData?.user?.email) {
      console.error("[remind] failed to get user email for", post.user_id);
    } else {
      const userEmail = userData.user.email;

      // Send email via Resend
      // From: use onboarding@resend.dev for testing (no domain verification needed)
      // Switch to noreply@darija-subtitle.vercel.app once domain is verified in Resend
      if (process.env.RESEND_API_KEY) {
        const { error: emailError } = await resend.emails.send({
          from:    "DarijaSub <onboarding@resend.dev>",
          to:      [userEmail],
          subject: `⏰ Time to post! Your ${platformLabel} post is scheduled for ${timeStr}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
              <h2 style="color:#9333ea;margin-bottom:8px">⏰ Time to post!</h2>
              <p style="color:#374151;font-size:16px;line-height:1.5">
                Your <strong>${platformLabel}</strong> post is scheduled for
                <strong>${timeStr}</strong>.
              </p>
              <p style="color:#6b7280;font-size:14px">
                Head to your scheduler to publish it now:
              </p>
              <a href="${SCHEDULER_URL}"
                style="display:inline-block;margin-top:16px;padding:12px 24px;
                       background:linear-gradient(90deg,#7c3aed,#9333ea);
                       color:#fff;text-decoration:none;border-radius:10px;
                       font-weight:600;font-size:15px">
                📅 Open Scheduler →
              </a>
              <p style="color:#9ca3af;font-size:12px;margin-top:24px">
                DarijaSub · AI subtitle editor
              </p>
            </div>
          `,
        });
        if (emailError) {
          console.error("[remind] email error for", userEmail, emailError.message);
        }
      }

      // Send web push notification to all of this user's subscriptions
      if (pushEnabled) {
        const { data: subs } = await admin
          .from("push_subscriptions")
          .select("*")
          .eq("user_id", post.user_id);

        const payload = JSON.stringify({
          title: `⏰ Time to post on ${platformLabel}!`,
          body:  `Scheduled for ${timeStr}. Tap to open the scheduler.`,
          url:   SCHEDULER_URL,
        });

        for (const sub of subs ?? []) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            );
          } catch (pushErr) {
            console.error("[remind] push error for sub", sub.id, pushErr);
            // If subscription is expired/invalid, remove it
            if ((pushErr as { statusCode?: number }).statusCode === 410) {
              await admin.from("push_subscriptions").delete().eq("id", sub.id);
            }
          }
        }
      }
    }

    // Mark as reminded so we don't send again
    await admin
      .from("scheduled_posts")
      .update({ reminded_at: new Date().toISOString() })
      .eq("id", post.id);

    sent++;
  }

  return NextResponse.json({ sent, total: posts.length });
}
