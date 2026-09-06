import { NextResponse } from "next/server";

/** GET /api/v1/openapi.json —— 手写 OpenAPI 3.1 描述（接口少，不上 swagger 生态） */
export async function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "codeyang-resume-server",
      version: "0.1.0",
      description: "在线简历 API：读公开，写需 x-internal-token（生产仅内网可达）",
    },
    servers: [{ url: "/api/v1" }],
    paths: {
      "/health": { get: { summary: "存活探针", responses: { 200: { description: "ok" } } } },
      "/resume/{slug}": {
        get: {
          summary: "取当前发布版本内容",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "发布版本" }, 404: { description: "不存在或未发布" } },
        },
      },
      "/resume/{slug}/versions": {
        get: { summary: "版本列表（元信息）", responses: { 200: { description: "版本列表" } } },
        post: {
          summary: "新建草稿版本（内部令牌）",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: { description: "简历内容快照；缺省=派生自当前发布版" },
                    label: { type: "string", description: "版本标签，如 2026 秋" },
                    note: { type: "string", description: "变更备注" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "已创建" }, 401: { description: "令牌错误" } },
        },
      },
      "/resume/{slug}/versions/{versionId}/publish": {
        post: { summary: "发布指定版本（内部令牌）", responses: { 200: { description: "已发布" }, 409: { description: "状态冲突" } } },
      },
    },
  });
}
