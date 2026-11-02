/**
 * Client view of RFC 9457 problem details (ADR-0006). Every API failure surfaces as an
 * `ApiProblem` with a register `code`, a translated message and the correlation id the user can
 * quote to support.
 */
import { HttpErrorResponse } from '@angular/common/http';
import { translate } from './translate';

export interface ApiFieldError {
  readonly field: string;
  readonly code: string;
  readonly message: string;
  /** Values of the message placeholders (e.g. min). */
  readonly params?: Readonly<Record<string, string | number>>;
}

export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
    readonly correlationId: string | null,
    readonly errors: readonly ApiFieldError[] = [],
    /** Values of the message placeholders (e.g. minutes, triesLeft). */
    readonly params: Readonly<Record<string, string | number>> = {},
  ) {
    super(detail);
    this.name = 'ApiProblem';
  }
}

interface ProblemBody {
  code?: unknown;
  detail?: unknown;
  correlationId?: unknown;
  errors?: unknown;
  params?: unknown;
}

const isProblemBody = (v: unknown): v is ProblemBody =>
  typeof v === 'object' && v !== null && typeof (v as ProblemBody).code === 'string';

/** Only string and number placeholder values are kept. */
const paramsOf = (v: unknown): Record<string, string | number> =>
  typeof v === 'object' && v !== null
    ? Object.fromEntries(
        Object.entries(v as Record<string, unknown>).filter(
          (e): e is [string, string | number] =>
            typeof e[1] === 'string' || typeof e[1] === 'number',
        ),
      )
    : {};

/** Converts any HTTP failure into an ApiProblem with register wording (never raw server text). */
export function toApiProblem(error: HttpErrorResponse): ApiProblem {
  const correlationId = error.headers?.get('X-Correlation-Id') ?? null;
  if (error.status === 0) {
    return new ApiProblem(0, 'GEN.UNAVAILABLE', translate('GEN.UNAVAILABLE'), correlationId);
  }
  const body: unknown = error.error;
  if (isProblemBody(body)) {
    const code = body.code as string;
    const params = paramsOf(body.params);
    const errors = Array.isArray(body.errors)
      ? (body.errors as { field?: unknown; code?: unknown; params?: unknown }[]).map((e) => {
          const p = paramsOf(e.params);
          const c = String(e.code ?? 'VALIDATION.FORMAT');
          return {
            field: String(e.field ?? ''),
            code: c,
            message: translate(c, p),
            ...(Object.keys(p).length ? { params: p } : {}),
          };
        })
      : [];
    return new ApiProblem(
      error.status,
      code,
      translate(code, params),
      typeof body.correlationId === 'string' ? body.correlationId : correlationId,
      errors,
      params,
    );
  }
  const fallback = error.status >= 500 ? 'GEN.INTERNAL' : 'GEN.BAD_REQUEST';
  return new ApiProblem(error.status, fallback, translate(fallback), correlationId);
}
