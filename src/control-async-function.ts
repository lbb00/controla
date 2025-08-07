type PromiseFn<R = unknown> = (info: { signal?: AbortSignal }) => Promise<R>

export function controlAsyncFunction<R>(
  fn: PromiseFn<R>,
  options: {
    timeout?: number
    signal?: AbortSignal
  } = {}
): {
  run: () => Promise<R>
  abort: (reason: unknown) => void
} {
  let abortResolvers: PromiseWithResolvers<R> | undefined
  const abortController = new AbortController()

  let aborted = false
  let started = false

  let timeoutId: NodeJS.Timeout | undefined
  const safeAbort = (reason: unknown) => {
    if (aborted) return
    aborted = true
    abortController.abort(reason)
    // To fix Unhandled Rejection
    // Only reject if we have created the abort promise (i.e., run() has been called)
    if (abortResolvers) {
      abortResolvers.reject(reason)
    }
  }

  if (typeof options.timeout === 'number') {
    timeoutId = setTimeout(() => {
      safeAbort(new Error('timeout'))
    }, options.timeout)
  }

  const abortBySignal = () => {
    safeAbort(new Error('external abort'))
  }

  if (options.signal) {
    options.signal.addEventListener('abort', abortBySignal, {
      once: true,
    })
  }

  return {
    run() {
      if (started) {
        return Promise.reject(new Error('run() can only be called once'))
      }
      if (aborted) {
        return Promise.reject(new Error('already aborted'))
      }
      started = true

      abortResolvers = Promise.withResolvers<R>()

      return Promise.race([fn({ signal: abortController.signal }), abortResolvers.promise]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId)
        if (options.signal) options.signal.removeEventListener('abort', abortBySignal)
      })
    },
    abort: safeAbort,
  }
}
