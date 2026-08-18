/**
 * Extra information a command declares for `hono agent-context`.
 * Keep it next to the command so it stays correct.
 */
export interface CommandAgentContext {
  /** Shape of `data` in the JSON output, as a compact sample */
  output?: string
  /** Error codes this command can return */
  errors?: string[]
  /** Usage examples, one command line each */
  examples?: string[]
  /** Extra notes for agents */
  notes?: string[]
}
