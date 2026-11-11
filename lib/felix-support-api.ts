import { timingSafeEqual } from "node:crypto"

export function isFelixSupportApiAuthorized(request: Request, expectedToken: string) {
  const authorization = request.headers.get("authorization") ?? ""
  if (!authorization.toLowerCase().startsWith("bearer ")) return false

  const provided = Buffer.from(authorization.slice(7))
  const expected = Buffer.from(expectedToken)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}
