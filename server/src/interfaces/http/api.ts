import { NextResponse } from "next/server";
import { ConflictError, DomainError, NotFoundError, ValidationError } from "@/domain/shared/domain-error";
import { logger } from "@/infrastructure/logger";
import { config } from "@/infrastructure/config";

/**
 * interfaces 层 HTTP 适配：
 * - handle()：统一请求日志（方法/路径/状态/耗时）+ 异常兜底
 * - fail()：领域错误 → HTTP 状态码的唯一映射点
 */

/** 包一层路由处理器：记录请求日志，异常转响应 */
export async function handle(request: Request, run: () => Promise<NextResponse>): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    const response = await run();
    logger.info(
      { method: request.method, path: new URL(request.url).pathname, status: response.status, durationMs: Date.now() - startedAt },
      "request",
    );
    return response;
  } catch (error) {
    logger.error(
      { method: request.method, path: new URL(request.url).pathname, durationMs: Date.now() - startedAt, err: error },
      "request_failed",
    );
    return fail(error);
  }
}

export function ok(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 422 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 404 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 409 });
  }
  if (error instanceof DomainError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 400 });
  }
  logger.error({ err: error }, "未处理异常");
  return NextResponse.json({ error: { code: "INTERNAL", message: "服务内部错误" } }, { status: 500 });
}

/**
 * 写接口保护：nginx 在生产只把 /api/v1/resume 的 GET 暴露公网，
 * 这里再做一道令牌校验（纵深防御）。token 未配置时一律拒绝。
 */
export function rejectMissingInternalToken(request: Request): NextResponse | null {
  const provided = request.headers.get("x-internal-token");
  if (!config.internalApiToken || provided !== config.internalApiToken) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "缺少或错误的 x-internal-token" } },
      { status: 401 },
    );
  }
  return null;
}

/** 解析 JSON 请求体，容忍空 body */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new ValidationError("请求体应为 JSON 对象");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ValidationError("请求体不是合法 JSON");
  }
}

export function readStringField(body: Record<string, unknown>, key: string): string | null | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new ValidationError(`${key} 应为字符串`);
  return value;
}
