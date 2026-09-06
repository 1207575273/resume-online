/**
 * 领域错误基类：domain 层不认识 HTTP，只表达业务语义。
 * 状态码映射由 interfaces 层完成（src/interfaces/http/error-map.ts）。
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 资源不存在 */
export class NotFoundError extends DomainError {
  constructor(message = "资源不存在") {
    super(message, "NOT_FOUND");
  }
}

/** 违反业务不变量（状态迁移非法等） */
export class ConflictError extends DomainError {
  constructor(message = "操作与当前状态冲突") {
    super(message, "CONFLICT");
  }
}

/** 入参不满足领域契约 */
export class ValidationError extends DomainError {
  constructor(message = "参数校验失败") {
    super(message, "VALIDATION");
  }
}
