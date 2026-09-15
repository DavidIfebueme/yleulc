import { Context, Data, Effect, Layer, Option, Redacted, Ref } from "effect"
import { execFile, spawn } from "node:child_process"

export class KeychainError extends Data.TaggedError("KeychainError")<{
  readonly account: string
  readonly kind: "delete" | "store"
  readonly message: string
  readonly service: string
}> {}

export interface KeychainShape {
  readonly deletePassword: (service: string, account: string) => Effect.Effect<void, KeychainError>
  readonly getPassword: (
    service: string,
    account: string
  ) => Effect.Effect<Option.Option<Redacted.Redacted<string>>, never>
  readonly setPassword: (
    service: string,
    account: string,
    password: Redacted.Redacted<string>
  ) => Effect.Effect<void, KeychainError>
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return String(cause)
}

function lookupPassword(service: string, account: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile("secret-tool", ["lookup", "service", service, "account", account], (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(String(stdout))
    })
  })
}

function storePassword(service: string, account: string, password: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("secret-tool", ["store", "--label=yleulc", "service", service, "account", account])
    child.on("error", (cause) => {
      reject(cause)
    })
    child.on("close", (code) => {
      if (code === 0) {
        resolve(undefined)
      } else {
        reject(new Error(`secret-tool store exited with ${String(code)}`))
      }
    })
    if (child.stdin === null) {
      reject(new Error("secret-tool store has no stdin"))
      return
    }
    child.stdin.write(password)
    child.stdin.end()
  })
}

function clearPassword(service: string, account: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile("secret-tool", ["clear", "service", service, "account", account], (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve(undefined)
    })
  })
}

export class Keychain extends Context.Service<Keychain, KeychainShape>()("Keychain") {
  static readonly Live = Layer.succeed(
    Keychain,
    Keychain.of({
      deletePassword: (service, account) =>
        Effect.tryPromise({
          catch: (cause) => new KeychainError({ account, kind: "delete", message: describeCause(cause), service }),
          try: () => clearPassword(service, account)
        }),
      getPassword: (service, account) =>
        Effect.option(Effect.tryPromise(() => lookupPassword(service, account))).pipe(
          Effect.map((result) =>
            Option.flatMap(result, (raw) => {
              const trimmed = raw.trim()
              return trimmed.length === 0 ? Option.none() : Option.some(Redacted.make(trimmed))
            })
          )
        ),
      setPassword: (service, account, password) =>
        Effect.tryPromise({
          catch: (cause) => new KeychainError({ account, kind: "store", message: describeCause(cause), service }),
          try: () => storePassword(service, account, Redacted.value(password))
        })
    })
  )
  static readonly Test = Layer.effect(
    Keychain,
    Effect.gen(function* () {
      const store = yield* Ref.make(new Map<string, Redacted.Redacted<string>>())
      const keyOf = (service: string, account: string): string => `${service}:${account}`
      return Keychain.of({
        deletePassword: (service, account) =>
          Ref.update(store, (entries) => {
            const next = new Map(entries)
            next.delete(keyOf(service, account))
            return next
          }),
        getPassword: (service, account) =>
          Ref.get(store).pipe(Effect.map((entries) => Option.fromNullishOr(entries.get(keyOf(service, account))))),
        setPassword: (service, account, password) =>
          Ref.update(store, (entries) => new Map(entries).set(keyOf(service, account), password))
      })
    })
  )
}
