import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { controlAsyncFunction } from './control-async-function.js'

describe('controlAsyncFunction', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('basic functionality', () => {
    it('should run a simple promise function successfully', async () => {
      const mockFn = vi.fn().mockResolvedValue('success')
      const scheduler = controlAsyncFunction(mockFn)

      const result = await scheduler.run()

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(mockFn).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) })
    })

    it('should reject when the wrapped function rejects', async () => {
      const error = new Error('test error')
      const mockFn = vi.fn().mockRejectedValue(error)
      const scheduler = controlAsyncFunction(mockFn)

      await expect(scheduler.run()).rejects.toThrow('test error')
    })

    it('should reject when run() is called multiple times', async () => {
      const mockFn = vi.fn().mockResolvedValue('success')
      const scheduler = controlAsyncFunction(mockFn)

      await scheduler.run()

      await expect(scheduler.run()).rejects.toThrow('run() can only be called once')
    })

    it('should reject when run() is called after manual abort', async () => {
      const mockFn = vi.fn().mockResolvedValue('success')
      const scheduler = controlAsyncFunction(mockFn)

      scheduler.abort('manual abort')

      await expect(scheduler.run()).rejects.toThrow('already aborted')
    })
  })

  describe('timeout functionality', () => {
    it('should timeout when function takes longer than specified timeout', async () => {
      const mockFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('success'), 2000)))
      const scheduler = controlAsyncFunction(mockFn, { timeout: 1000 })

      const runPromise = scheduler.run()

      // Fast-forward time beyond timeout
      vi.advanceTimersByTime(1001)

      await expect(runPromise).rejects.toThrow('timeout')
    })

    it('should complete successfully when function finishes before timeout', async () => {
      const mockFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('success'), 500)))
      const scheduler = controlAsyncFunction(mockFn, { timeout: 1000 })

      const runPromise = scheduler.run()

      // Fast-forward time to when function completes
      vi.advanceTimersByTime(500)

      await expect(runPromise).resolves.toBe('success')
    })

    it('should clear timeout when function completes successfully', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      const mockFn = vi.fn().mockResolvedValue('success')
      const scheduler = controlAsyncFunction(mockFn, { timeout: 1000 })

      await scheduler.run()

      expect(clearTimeoutSpy).toHaveBeenCalled()
    })
  })

  describe('external abort signal', () => {
    it('should abort when external signal is aborted', async () => {
      const abortController = new AbortController()
      const mockFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('success'), 1000)))
      const scheduler = controlAsyncFunction(mockFn, {
        signal: abortController.signal,
      })

      const runPromise = scheduler.run()

      // Abort externally
      abortController.abort()

      await expect(runPromise).rejects.toThrow('external abort')
    })

    it('should complete successfully when external signal is not aborted', async () => {
      const abortController = new AbortController()
      const mockFn = vi.fn().mockResolvedValue('success')
      const scheduler = controlAsyncFunction(mockFn, {
        signal: abortController.signal,
      })

      const result = await scheduler.run()

      expect(result).toBe('success')
    })

    it('should remove event listener after completion', async () => {
      const abortController = new AbortController()
      const removeEventListenerSpy = vi.spyOn(abortController.signal, 'removeEventListener')
      const mockFn = vi.fn().mockResolvedValue('success')
      const scheduler = controlAsyncFunction(mockFn, {
        signal: abortController.signal,
      })

      await scheduler.run()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function))
    })
  })

  describe('manual abort', () => {
    it('should abort with custom reason', async () => {
      const mockFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('success'), 1000)))
      const scheduler = controlAsyncFunction(mockFn)

      const runPromise = scheduler.run()

      scheduler.abort('custom abort reason')

      await expect(runPromise).rejects.toBe('custom abort reason')
    })

    it('should preserve first abort reason when multiple aborts occur', async () => {
      const mockFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('success'), 1000)))
      const scheduler = controlAsyncFunction(mockFn)

      const runPromise = scheduler.run()

      scheduler.abort('first abort')
      scheduler.abort('second abort') // Should not throw, should be ignored

      // Should be rejected with first abort reason
      await expect(runPromise).rejects.toBe('first abort')
    })

    it('should not allow multiple aborts when not running', async () => {
      const mockFn = vi.fn().mockResolvedValue('success')
      const scheduler = controlAsyncFunction(mockFn)

      scheduler.abort('first abort')
      scheduler.abort('second abort') // Should not throw

      // Should be rejected with "already aborted" when run() is called after abort
      await expect(scheduler.run()).rejects.toThrow('already aborted')
    })

    it('should abort before run() is called', async () => {
      const mockFn = vi.fn().mockResolvedValue('success')
      const scheduler = controlAsyncFunction(mockFn)

      scheduler.abort('pre-abort')

      await expect(scheduler.run()).rejects.toThrow('already aborted')
      expect(mockFn).not.toHaveBeenCalled()
    })
  })

  describe('signal propagation', () => {
    it('should pass abort signal to the wrapped function', async () => {
      const mockFn = vi.fn().mockImplementation(({ signal }) => {
        expect(signal).toBeInstanceOf(AbortSignal)
        return Promise.resolve('success')
      })
      const scheduler = controlAsyncFunction(mockFn)

      await scheduler.run()

      expect(mockFn).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) })
    })

    it('should abort the signal passed to wrapped function when manually aborted', async () => {
      let capturedSignal: AbortSignal | undefined
      const mockFn = vi.fn().mockImplementation(({ signal }) => {
        capturedSignal = signal
        return new Promise((resolve) => setTimeout(() => resolve('success'), 1000))
      })
      const scheduler = controlAsyncFunction(mockFn)

      const runPromise = scheduler.run()
      scheduler.abort('manual abort')

      await expect(runPromise).rejects.toBe('manual abort')
      expect(capturedSignal?.aborted).toBe(true)
    })
  })

  describe('combined scenarios', () => {
    it('should handle timeout with external signal', async () => {
      const abortController = new AbortController()
      const mockFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('success'), 2000)))
      const scheduler = controlAsyncFunction(mockFn, {
        timeout: 1000,
        signal: abortController.signal,
      })

      const runPromise = scheduler.run()

      // Timeout should happen first
      vi.advanceTimersByTime(1001)

      await expect(runPromise).rejects.toThrow('timeout')
    })

    it('should handle external abort before timeout', async () => {
      const abortController = new AbortController()
      const mockFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('success'), 2000)))
      const scheduler = controlAsyncFunction(mockFn, {
        timeout: 1000,
        signal: abortController.signal,
      })

      const runPromise = scheduler.run()

      // External abort before timeout
      abortController.abort()

      await expect(runPromise).rejects.toThrow('external abort')
    })

    it('should clean up all resources on completion', async () => {
      const abortController = new AbortController()
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      const removeEventListenerSpy = vi.spyOn(abortController.signal, 'removeEventListener')

      const mockFn = vi.fn().mockResolvedValue('success')
      const scheduler = controlAsyncFunction(mockFn, {
        timeout: 1000,
        signal: abortController.signal,
      })

      await scheduler.run()

      expect(clearTimeoutSpy).toHaveBeenCalled()
      expect(removeEventListenerSpy).toHaveBeenCalled()
    })
  })
})
