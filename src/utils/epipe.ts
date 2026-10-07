/**
 * Ignore EPIPE when the reader closes the pipe early, as in
 * `hono --help | head`. Without a listener, the failed write becomes an
 * unhandled 'error' event and Node prints a stack trace to stderr,
 * which reads like a crash. Other errors still throw.
 */
export const ignoreEpipe = (stream: NodeJS.EventEmitter): void => {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE') {
      throw error
    }
  })
}
