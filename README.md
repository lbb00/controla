# Controla

Control your function easily.

[![Npm](https://badgen.net/npm/v/controla)](https://www.npmjs.com/package/controla)
[![Bundlephobia](https://badgen.net/bundlephobia/minzip/controla)](https://bundlephobia.com/result?p=controla)
[![Coverage](https://img.shields.io/codecov/c/github/lbb00/controla.svg)](https://codecov.io/gh/lbb00/controla)
![Typescript](https://img.shields.io/badge/TS-Typescript-blue)
[![License](https://img.shields.io/github/license/lbb00/controla.svg)](https://github.com/lbb00/controla/blob/master/LICENSE)
[![Npm download](https://img.shields.io/npm/dw/controla.svg)](https://www.npmjs.com/package/controla)

## Install

```bash
npm install controla
```

## API

### controlAsyncFunction

```ts
import { controlAsyncFunction } from 'controla'

const outerAbortController = new AbortController()

const { run, abort } = controlAsyncFunction(
  async ({ signal }) => {
    return 'Hello, world!'
  },
  {
    signal: outerAbortController.signal, // Optional, AbortSignal
    timeout, // Optional, ms
  }
)
```

### controlSingleFlight

Deduplicate concurrent async calls into a single shared "flight", with optional idle cache window and per-call controls.

```ts
import { controlSingleFlight } from 'controla'

// Your flight function (single-flight deduped); use AbortSignal to support cancellation
const fetchUser = async ({ signal }: { signal?: AbortSignal }) => {
  const res = await fetch('/api/user', { signal })
  if (!res.ok) throw new Error('request failed')
  return (await res.json()) as { id: string; name: string }
}

// Minimal usage
const { run, abortAll } = controlSingleFlight(fetchUser, { timeout: 10_000, idleReleaseTime: 1000 })
const u1 = await run().promise            // shared flight for concurrent callers
const u2 = await run().promise            // reused within idle window
await run({ refresh: true }).promise      // force a new flight
await run({ timeout: 500 }).promise       // per-call timeout
abortAll()                                // abort underlying flight for everyone
```

Key points:

- `run(options)` returns `{ promise, abort }`
- `options`: `signal?`, `timeout?`, `refresh?`
- Factory options: `timeout`, `idleReleaseTime`
- Extra: `abortAll()` to cancel the active shared flight
