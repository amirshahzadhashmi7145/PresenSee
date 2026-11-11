import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { faceServiceHealthy } from "@/lib/face-client";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  try {
    await db.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }
  const face = await faceServiceHealthy();
  return NextResponse.json({ web: true, database, face }, { status: database && face ? 200 : 503 });
}
