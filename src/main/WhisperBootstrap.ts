import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import type { IncomingMessage } from "node:http"
import { get as httpsGet } from "node:https"
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { Config, Context, Data, Effect, Layer, Ref, Schema } from "effect"

export const WhisperAssetSchema = Schema.Struct({
  fileName: Schema.String,
  sha256: Schema.String,
  url: Schema.String
})

export type WhisperAsset = typeof WhisperAssetSchema.Type

export const decodeWhisperAsset = Schema.decodeUnknownSync(WhisperAssetSchema)

export interface WhisperPaths {
  readonly binaryPath: string
  readonly modelPath: string
}

export interface WhisperAssetNames {
  readonly binaryFileName: string
  readonly modelFileName: string
}

export class BootstrapError extends Data.TaggedError("BootstrapError")<{
  readonly operation: string
  readonly reason: string
}> {}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return String(cause)
}

export function sha256Hex(bytes: Uint8Array): Effect.Effect<string> {
  return Effect.sync(() => createHash("sha256").update(bytes).digest("hex"))
}

export function resolveWhisperAssetNames(
  platform: string,
  arch: string
): Effect.Effect<WhisperAssetNames, BootstrapError> {
  if (platform === "linux" && arch === "x64") {
    return Effect.succeed({ binaryFileName: "whisper-cli-linux-x64", modelFileName: "ggml-tiny.bin" })
  }
  if (platform === "linux" && arch === "arm64") {
    return Effect.succeed({ binaryFileName: "whisper-cli-linux-aarch64", modelFileName: "ggml-tiny.bin" })
  }
  return Effect.fail(
    new BootstrapError({ operation: "resolveWhisperAssetNames", reason: `${platform}/${arch} is unsupported` })
  )
}

export interface WhisperFileSystemShape {
  readonly fetchBytes: (url: string) => Effect.Effect<Uint8Array, BootstrapError>
  readonly fileExists: (path: string) => Effect.Effect<boolean, BootstrapError>
  readonly makeExecutable: (path: string) => Effect.Effect<void, BootstrapError>
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, BootstrapError>
  readonly userDataDir: Effect.Effect<string, BootstrapError>
  readonly writeBytes: (path: string, bytes: Uint8Array) => Effect.Effect<void, BootstrapError>
}

export interface WhisperFileSystemScript {
  readonly fetchedBytes: ReadonlyMap<string, Uint8Array>
  readonly initialFiles: ReadonlyMap<string, Uint8Array>
}

export interface WhisperMemoryRefs {
  readonly fetched: Ref.Ref<ReadonlyArray<string>>
  readonly files: Ref.Ref<Map<string, Uint8Array>>
}

function inMemoryFileSystem(refs: WhisperMemoryRefs, script: WhisperFileSystemScript): WhisperFileSystemShape {
  return {
    fetchBytes: (url) =>
      Effect.gen(function* () {
        const canned = script.fetchedBytes.get(url)
        if (canned === undefined) {
          return yield* Effect.fail(
            new BootstrapError({ operation: "fetchBytes", reason: `no fixture bytes for ${url}` })
          )
        }
        yield* Ref.update(refs.fetched, (seen) => [...seen, url])
        return canned
      }),
    fileExists: (path) =>
      Effect.gen(function* () {
        const current = yield* Ref.get(refs.files)
        return current.has(path)
      }),
    makeExecutable: () => Effect.void,
    readBytes: (path) =>
      Effect.gen(function* () {
        const current = yield* Ref.get(refs.files)
        const found = current.get(path)
        if (found === undefined) {
          return yield* Effect.fail(new BootstrapError({ operation: "readBytes", reason: `${path} is missing` }))
        }
        return found
      }),
    userDataDir: Effect.succeed("/test-data"),
    writeBytes: (path, bytes) =>
      Ref.update(refs.files, (current) => new Map(current).set(path, bytes)).pipe(Effect.asVoid)
  }
}

function downloadBytes(url: string): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    httpsGet(url, (response: IncomingMessage) => {
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`unexpected status ${response.statusCode ?? 0} for ${url}`))
        return
      }
      const chunks: Array<Uint8Array> = []
      response.on("data", (chunk: Uint8Array) => {
        chunks.push(chunk)
      })
      response.on("end", () => {
        resolve(Buffer.concat(chunks))
      })
      response.on("error", (cause: unknown) => {
        reject(cause)
      })
    }).on("error", (cause: unknown) => {
      reject(cause)
    })
  })
}

const emptyFileSystemScript: WhisperFileSystemScript = {
  fetchedBytes: new Map(),
  initialFiles: new Map()
}

export class WhisperFileSystem extends Context.Service<WhisperFileSystem, WhisperFileSystemShape>()(
  "WhisperFileSystem"
) {
  static readonly Live = Layer.succeed(
    WhisperFileSystem,
    WhisperFileSystem.of({
      fetchBytes: (url) =>
        Effect.tryPromise({
          catch: (cause) => new BootstrapError({ operation: "fetchBytes", reason: describeCause(cause) }),
          try: () => downloadBytes(url)
        }),
      fileExists: (path) =>
        Effect.promise(() =>
          access(path).then(
            () => true,
            () => false
          )
        ),
      makeExecutable: (path) =>
        Effect.tryPromise({
          catch: (cause) => new BootstrapError({ operation: "makeExecutable", reason: describeCause(cause) }),
          try: () => chmod(path, 0o755)
        }),
      readBytes: (path) =>
        Effect.tryPromise({
          catch: (cause) => new BootstrapError({ operation: "readBytes", reason: describeCause(cause) }),
          try: () => readFile(path)
        }),
      userDataDir: Effect.tryPromise({
        catch: (cause) => new BootstrapError({ operation: "userDataDir", reason: describeCause(cause) }),
        try: () => {
          const base = process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share")
          const dir = join(base, "yleulc")
          return mkdir(dir, { recursive: true }).then(() => dir)
        }
      }),
      writeBytes: (path, bytes) =>
        Effect.tryPromise({
          catch: (cause) => new BootstrapError({ operation: "writeBytes", reason: describeCause(cause) }),
          try: () => mkdir(dirname(path), { recursive: true }).then(() => writeFile(path, bytes))
        })
    })
  )
  static readonly Test = Layer.effect(
    WhisperFileSystem,
    Effect.gen(function* () {
      const refs: WhisperMemoryRefs = {
        fetched: yield* Ref.make<ReadonlyArray<string>>([]),
        files: yield* Ref.make(new Map<string, Uint8Array>())
      }
      return WhisperFileSystem.of(inMemoryFileSystem(refs, emptyFileSystemScript))
    })
  )
}

export interface WhisperTestFileSystem {
  readonly fetchedUrls: Effect.Effect<ReadonlyArray<string>>
  readonly layer: Layer.Layer<WhisperFileSystem>
  readonly storedPaths: Effect.Effect<ReadonlyArray<string>>
}

export function buildWhisperTestFileSystem(
  script: WhisperFileSystemScript
): Effect.Effect<WhisperTestFileSystem> {
  return Effect.gen(function* () {
    const refs: WhisperMemoryRefs = {
      fetched: yield* Ref.make<ReadonlyArray<string>>([]),
      files: yield* Ref.make(new Map(script.initialFiles))
    }
    return {
      fetchedUrls: Ref.get(refs.fetched),
      layer: Layer.succeed(WhisperFileSystem, WhisperFileSystem.of(inMemoryFileSystem(refs, script))),
      storedPaths: Effect.gen(function* () {
        const current = yield* Ref.get(refs.files)
        return Array.from(current.keys())
      })
    }
  })
}

export interface WhisperBootstrapShape {
  readonly ensureReady: Effect.Effect<WhisperPaths, BootstrapError>
}

export interface WhisperBootstrapInput {
  readonly binaryAsset: WhisperAsset
  readonly fileSystem: WhisperFileSystemShape
  readonly installDir: string
  readonly modelAsset: WhisperAsset
}

export function makeWhisperBootstrap(input: WhisperBootstrapInput): WhisperBootstrapShape {
  const storedPath = (asset: WhisperAsset): string => join(input.installDir, asset.fileName)
  const storedValid = (asset: WhisperAsset): Effect.Effect<boolean, BootstrapError> =>
    Effect.gen(function* () {
      const exists = yield* input.fileSystem.fileExists(storedPath(asset))
      if (!exists) {
        return false
      }
      const bytes = yield* input.fileSystem.readBytes(storedPath(asset))
      const digest = yield* sha256Hex(bytes)
      return digest.toLowerCase() === asset.sha256.toLowerCase()
    })
  const installAsset = (asset: WhisperAsset, executable: boolean): Effect.Effect<void, BootstrapError> =>
    Effect.gen(function* () {
      const bytes = yield* input.fileSystem.fetchBytes(asset.url)
      const digest = yield* sha256Hex(bytes)
      if (digest.toLowerCase() !== asset.sha256.toLowerCase()) {
        return yield* Effect.fail(
          new BootstrapError({ operation: "installAsset", reason: `checksum mismatch for ${asset.fileName}` })
        )
      }
      yield* input.fileSystem.writeBytes(storedPath(asset), bytes)
      if (executable) {
        yield* input.fileSystem.makeExecutable(storedPath(asset))
      }
    })
  return {
    ensureReady: Effect.gen(function* () {
      const binaryOk = yield* storedValid(input.binaryAsset)
      const modelOk = yield* storedValid(input.modelAsset)
      if (!binaryOk) {
        yield* installAsset(input.binaryAsset, true)
      }
      if (!modelOk) {
        yield* installAsset(input.modelAsset, false)
      }
      return { binaryPath: storedPath(input.binaryAsset), modelPath: storedPath(input.modelAsset) }
    })
  }
}

export class WhisperBootstrap extends Context.Service<WhisperBootstrap, WhisperBootstrapShape>()(
  "WhisperBootstrap"
) {
  static readonly Live = Layer.effect(
    WhisperBootstrap,
    Effect.gen(function* () {
      const fileSystem = yield* WhisperFileSystem
      const dataDir = yield* fileSystem.userDataDir
      const names = yield* resolveWhisperAssetNames(process.platform, process.arch)
      const distribution = yield* Effect.mapError(
        Config.all({
          binarySha256: Config.String("YLEULC_WHISPER_BINARY_SHA256"),
          binaryUrl: Config.String("YLEULC_WHISPER_BINARY_URL"),
          modelSha256: Config.String("YLEULC_WHISPER_MODEL_SHA256"),
          modelUrl: Config.String("YLEULC_WHISPER_MODEL_URL")
        }),
        (cause) => new BootstrapError({ operation: "readBootstrapConfig", reason: describeCause(cause) })
      )
      return WhisperBootstrap.of(
        makeWhisperBootstrap({
          binaryAsset: {
            fileName: names.binaryFileName,
            sha256: distribution.binarySha256,
            url: distribution.binaryUrl
          },
          fileSystem,
          installDir: join(dataDir, "whisper"),
          modelAsset: {
            fileName: names.modelFileName,
            sha256: distribution.modelSha256,
            url: distribution.modelUrl
          }
        })
      )
    })
  )
  static readonly Test = Layer.succeed(
    WhisperBootstrap,
    WhisperBootstrap.of({
      ensureReady: Effect.succeed({ binaryPath: "/test-data/whisper-cli", modelPath: "/test-data/ggml-tiny.bin" })
    })
  )
}

export function makeWhisperBootstrapTestLayer(input: WhisperBootstrapInput): Layer.Layer<WhisperBootstrap> {
  return Layer.succeed(WhisperBootstrap, WhisperBootstrap.of(makeWhisperBootstrap(input)))
}
