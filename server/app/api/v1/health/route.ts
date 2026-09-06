import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** 存活探针：compose healthcheck 与 LB 用 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "codeyang-resume-server",
    uptime: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
}
