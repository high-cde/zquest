/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isUniqueError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}
