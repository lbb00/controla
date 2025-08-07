# Controla

Control made simple.

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

const { run, abort } = controlAsyncFunction(
  async ({ signal }) => {
    return 'Hello, world!'
  },
  {
    signal, // Optional, AbortSignal
    timeout, // Optional, ms
  }
)
```
