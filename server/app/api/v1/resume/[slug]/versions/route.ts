import { handle, ok, readJsonBody, readStringField, rejectMissingInternalToken } from "@/interfaces/http/api";
import { useCases } from "@/composition";

export const dynamic = "force-dynamic";

/** GET /api/v1/resume/:slug/versions —— 版本列表（仅元信息） */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(request, async () => {
    const { slug } = await ctx.params;
    return ok(await useCases().listResumeVersions.execute(slug));
  });
}

/**
 * POST /api/v1/resume/:slug/versions —— 新建草稿版本
 * body: { content?: ResumeContent, label?: string, note?: string }
 * content 缺省 = 基于当前发布版本派生（复制一份再改）
 */
export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const unauthorized = rejectMissingInternalToken(request);
  if (unauthorized) return unauthorized;

  return handle(request, async () => {
    const { slug } = await ctx.params;
    const body = await readJsonBody(request);
    return ok(
      await useCases().createResumeVersion.execute({
        slug,
        content: body.content,
        label: readStringField(body, "label"),
        note: readStringField(body, "note"),
      }),
      { status: 201 },
    );
  });
}
