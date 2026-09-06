import { handle, ok, rejectMissingInternalToken } from "@/interfaces/http/api";
import { useCases } from "@/composition";

export const dynamic = "force-dynamic";

/** POST /api/v1/resume/:slug/versions/:versionId/publish —— 发布指定版本（旧版本自动归档） */
export async function POST(request: Request, ctx: { params: Promise<{ slug: string; versionId: string }> }) {
  const unauthorized = rejectMissingInternalToken(request);
  if (unauthorized) return unauthorized;

  return handle(request, async () => {
    const { slug, versionId } = await ctx.params;
    return ok(await useCases().publishResumeVersion.execute({ slug, versionId }));
  });
}
