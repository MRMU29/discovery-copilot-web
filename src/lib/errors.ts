/** Domain-layer error with a stable machine code for UI mapping (plan §4.3 error discipline). */
export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'CAPACITY_LIMIT'
  | 'PARENT_RULE'
  | 'CYCLE'
  | 'INTEGRITY'
  | 'CORRUPT_ROW'
  | 'SECRET_REJECTED'
  | 'INVALID_INPUT'
