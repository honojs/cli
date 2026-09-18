/**
 * Where a request goes: the Hono app in this process, or a running
 * workerd. `Hono#request` satisfies it as-is.
 */
export interface RequestTarget {
  request(input: Request, requestInit?: RequestInit, env?: unknown): Response | Promise<Response>
}
