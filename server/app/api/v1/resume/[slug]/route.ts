import { handle, ok } from "@/interfaces/http/api";
import { useCases } from "@/composition";

export const dynamic = "force-dynamic";

/** GET /api/v1/resume/:slug —— 对外读接口：当前发布版本内容 */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(request, async () => {
    const { slug } = await ctx.params;
    return ok(await useCases().getPublishedResume.execute(slug));
  });
}
