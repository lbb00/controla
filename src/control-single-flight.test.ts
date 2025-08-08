import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock package self-import inside the module under test to local implementation
// so tests don't depend on build outputs in dist.
vi.mock('controla', async () => await import('./control-async-function.js'))

import { controlSingleFlight } from './control-single-flight.js'

describe('controlSingleFlight', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('shared flight behavior', () => {
    it('should share the same in-flight promise across multiple run calls', async () => {
      const flightFn = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('OK'), 1000)))

      const { run } = controlSingleFlight(flightFn, { timeout: 5000 })

      const a = run().promise
      const b = run().promise

      expect(flightFn).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(1000)

      await expect(a).resolves.toBe('OK')
      await expect(b).resolves.toBe('OK')

      // After all awaiters finished and without idleReleaseTime, next run should start a new flight
      const c = run().promise
      expect(flightFn).toHaveBeenCalledTimes(2)
      vi.advanceTimersByTime(1000)
      await expect(c).resolves.toBe('OK')
    })
  })

  describe('refresh behavior', () => {
    it('should start a new flight when refresh=true even if there is an active flight', async () => {
      const flightFn = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('R'), 2000)))

      const { run } = controlSingleFlight(flightFn, { timeout: 10000 })

      const first = run().promise
      const second = run({ refresh: true }).promise

      // Two separate flights should be started
      expect(flightFn).toHaveBeenCalledTimes(2)

      vi.advanceTimersByTime(2000)
      await expect(first).resolves.toBe('R')
      await expect(second).resolves.toBe('R')
    })
  })

  describe('idle cache window', () => {
    it('should reuse the resolved flight within idleReleaseTime and start a new one after it', async () => {
      const flightFn = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('V'), 100)))

      const { run } = controlSingleFlight(flightFn, { timeout: 5000, idleReleaseTime: 1000 })

      const p1 = run().promise
      vi.advanceTimersByTime(100)
      await expect(p1).resolves.toBe('V')

      // Within idle window, should NOT start a new flight
      const p2 = run().promise
      expect(flightFn).toHaveBeenCalledTimes(1)
      await expect(p2).resolves.toBe('V')

      // After idle window, should start a new flight
      vi.advanceTimersByTime(1000)
      const p3 = run().promise
      expect(flightFn).toHaveBeenCalledTimes(2)
      vi.advanceTimersByTime(100)
      await expect(p3).resolves.toBe('V')
    })
  })

  describe('abort and release semantics', () => {
    it('should abort the active flight when the last waiter is released (no idleReleaseTime)', async () => {
      const onFlightError = vi.fn()
      const flightFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('NEVER'), 10000)))

      const { run } = controlSingleFlight(flightFn, {
        timeout: 60000,
        onFlightError,
      })

      const { promise: p1, abort: a1 } = run()
      const { promise: p2, abort: a2 } = run()

      // Abort both waiters; after the second finishes, it should release and abort the flight
      a1('A')
      a2('B')

      await expect(p1).rejects.toBe('A')
      await expect(p2).rejects.toBe('B')

      // Let microtasks settle
      await Promise.resolve()

      // Underlying flight should be aborted once with external abort error
      expect(onFlightError).toHaveBeenCalledTimes(1)
      expect(onFlightError.mock.calls[0][0]).toBeInstanceOf(Error)
      expect((onFlightError.mock.calls[0][0] as Error).message).toBe('external abort')
    })
  })

  describe('timeout behavior', () => {
    it('should timeout the active flight and release (idleOnlySuccess default=true)', async () => {
      const onFlightError = vi.fn()
      const flightFn = vi.fn().mockImplementation(() => {
        // First call resolves after 2000ms, subsequent calls resolve after 100ms
        const callIndex = flightFn.mock.calls.length
        const delay = callIndex === 0 ? 2000 : 100
        return new Promise((resolve) => setTimeout(() => resolve('LATE'), delay))
      })

      const { run } = controlSingleFlight(flightFn, {
        // Large timeout so the inner flight itself does not timeout
        // The first waiter will time out via per-call custom timeout
        timeout: 60000,
        onFlightError,
      })

      const p = run({ timeout: 1000 }).promise

      vi.advanceTimersByTime(1001)
      await expect(p).rejects.toThrow('timeout')

      // Underlying active flight should be aborted due to release; a new run should start a new flight

      // Next run should start a fresh flight (previous released)
      const p2 = run().promise
      expect(flightFn).toHaveBeenCalledTimes(2)
      vi.advanceTimersByTime(100)
      await expect(p2).resolves.toBe('LATE')
    })
  })
})
