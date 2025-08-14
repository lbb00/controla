import { controlAsyncFunction } from './control-async-function.js'

export function controlSingleFlight<
  T extends (args: { signal?: AbortSignal }) => Promise<R>,
  R = Awaited<ReturnType<T>>,
>(
  flightFn: T,
  {
    timeout,
    idleReleaseTime,
    idleOnSuccessOnly = true,
    abortFlightIfRelease = true,
    onRelease,
    onFlightStart,
    onFlightEnd,
    onFlightError,
    onFlightSuccess,
  }: {
    timeout?: number
    idleReleaseTime?: number
    idleOnSuccessOnly?: boolean
    abortFlightIfRelease?: boolean
    onRelease?: () => void
    onFlightStart?: () => void
    onFlightSuccess?: (res: R) => void
    onFlightError?: (err: Error) => void
    onFlightEnd?: () => void
  }={}
) {
  let activeFlight: Promise<[Error | undefined, R | undefined]> | undefined
  let activeController: AbortController | undefined

  let currentFlightId: symbol | undefined

  let awaitFlightCount = 0
  function incAwaitFlightCount() {
    awaitFlightCount++
  }
  function decAwaitFlightCount() {
    awaitFlightCount--
    if (awaitFlightCount === 0 && !idleReleaseTime) {
      releaseFlight()
    }
  }

  let idleReleaseTimer: ReturnType<typeof setTimeout> | undefined

  const safeReleaseForThisFlight = (flightId: symbol) => {
    if (currentFlightId === flightId) {
      releaseFlight()
    }
  }

  const startFlightIfNeeded = ({ refresh }: { refresh?: boolean } = {}) => {
    if (!activeFlight || refresh) {
      if (idleReleaseTimer) {
        clearTimeout(idleReleaseTimer)
        idleReleaseTimer = undefined
      }

      const flightId = Symbol('flight')
      currentFlightId = flightId

      const controller = new AbortController()
      activeController = controller

      const { run } = controlAsyncFunction(({ signal }) => flightFn({ signal }), {
        timeout,
        signal: controller.signal,
      })

      onFlightStart?.()

      let ok = false
      activeFlight = run()
        .then((res) => {
          ok = true
          onFlightSuccess?.(res)

          return [undefined, res] as [undefined, R]
        })
        .catch((err: unknown) => {
          const normalizedError = err instanceof Error ? err : new Error(String(err))

          if (idleOnSuccessOnly) {
            safeReleaseForThisFlight(flightId)
          }
          onFlightError?.(normalizedError)

          return [normalizedError, undefined] as [Error, undefined]
        })
        .finally(() => {
          onFlightEnd?.()
          idleReleaseTimer = setTimeout(
            () => {
              safeReleaseForThisFlight(flightId)
            },
            !idleReleaseTime || (!ok && !idleOnSuccessOnly) ? 0 : idleReleaseTime
          )
        })
    }

    return activeFlight!
  }

  const releaseFlight = () => {
    if (idleReleaseTimer) {
      clearTimeout(idleReleaseTimer)
      idleReleaseTimer = undefined
    }
    if (abortFlightIfRelease && activeController && !activeController.signal.aborted) {
      activeController?.abort()
    }
    activeFlight = undefined
    activeController = undefined
    onRelease?.()
  }

  const abortAll = () => {
    if (activeController) {
      activeController.abort()
      releaseFlight()
    }
  }

  const run = ({
    signal,
    timeout: customTimeout,
    refresh = false,
  }: {
    signal?: AbortSignal
    timeout?: number
    refresh?: boolean
  } = {}) => {
    incAwaitFlightCount()
    const sharedPromise = startFlightIfNeeded({
      refresh,
    })
    const { run: runInner, abort: abortSingle } = controlAsyncFunction(() => sharedPromise, {
      timeout: customTimeout,
      signal,
    })

    const p = runInner()
      .then(([err, result]) => {
        if (err) {
          throw err
        }
        return result
      })
      .finally(() => {
        decAwaitFlightCount()
      })

    return {
      promise: p,
      abort: abortSingle,
    }
  }

  return { run, abortAll }
}
