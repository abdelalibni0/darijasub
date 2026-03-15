export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    hasElevenLabsKey: !!process.env.ELEVENLABS_API_KEY,
    keyPrefix: process.env.ELEVENLABS_API_KEY?.substring(0, 8) || "missing",
    allEnvKeys: Object.keys(process.env).filter(k => k.includes("ELEVEN") || k.includes("LABS"))
  });
}
