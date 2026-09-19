import { Buffer } from "node:buffer"
import { execFile } from "node:child_process"
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

export const WhisperModelSchema = Schema.Union([
  Schema.Literal("tiny"),
  Schema.Literal("base"),
  Schema.Literal("small")
])

export type WhisperModel = typeof WhisperModelSchema.Type

export const defaultWhisperModel: WhisperModel = "tiny"

export const whisperCpuArchiveAsset: WhisperAsset = {
  fileName: "whisper-bin-ubuntu-x64.tar.gz",
  sha256: "53e7fd8b5764edad916b8848dd0af6abb1ff1d3b86c899e79c78652412536c32",
  url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-ubuntu-x64.tar.gz"
}

export const whisperModelAssets: Readonly<Record<WhisperModel, WhisperAsset>> = {
  tiny: {
    fileName: "ggml-tiny.bin",
    sha256: "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny.bin?download=true"
  },
  base: {
    fileName: "ggml-base.bin",
    sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.bin?download=true"
  },
  small: {
    fileName: "ggml-small.bin",
    sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small.bin?download=true"
  }
}

export interface WhisperPaths {
  readonly binaryPath: string
  readonly modelPath: string
}

export interface WhisperAssetNames {
  readonly binaryDirectoryName: string
  readonly binaryFileName: string
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
    return Effect.succeed({ binaryDirectoryName: "whisper-bin-ubuntu-x64", binaryFileName: "whisper-cli" })
  }
  return Effect.fail(
    new BootstrapError({ operation: "resolveWhisperAssetNames", reason: `${platform}/${arch} is unsupported` })
  )
}

export interface WhisperFileSystemShape {
  readonly fetchBytes: (url: string) => Effect.Effect<Uint8Array, BootstrapError>
  readonly fileExists: (path: string) => Effect.Effect<boolean, BootstrapError>
  readonly makeExecutable: (path: string) => Effect.Effect<void, BootstrapError>
  readonly unpackArchive: (archivePath: string, destination: string) => Effect.Effect<void, BootstrapError>
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
    unpackArchive: () => Effect.void,
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

function downloadBytes(url: string, redirects = 0): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    httpsGet(url, (response: IncomingMessage) => {
      if (response.statusCode !== undefined && response.statusCode >= 300 && response.statusCode < 400) {
        const location = response.headers.location
        response.resume()
        if (location === undefined || redirects === 5) {
          reject(new Error(`unexpected redirect for ${url}`))
          return
        }
        downloadBytes(new URL(location, url).toString(), redirects + 1).then(resolve, reject)
        return
      }
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

function unpackArchive(archivePath: string, destination: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile("tar", ["-xzf", archivePath, "-C", destination], (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
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
      unpackArchive: (archivePath, destination) =>
        Effect.tryPromise({
          catch: (cause) => new BootstrapError({ operation: "unpackArchive", reason: describeCause(cause) }),
          try: () => unpackArchive(archivePath, destination)
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
  readonly binaryPath: string
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
        yield* installAsset(input.binaryAsset, false)
      }
      if (!modelOk) {
        yield* installAsset(input.modelAsset, false)
      }
      const binaryExists = yield* input.fileSystem.fileExists(input.binaryPath)
      if (!binaryExists) {
        yield* input.fileSystem.unpackArchive(storedPath(input.binaryAsset), input.installDir)
        yield* input.fileSystem.makeExecutable(input.binaryPath)
      }
      return { binaryPath: input.binaryPath, modelPath: storedPath(input.modelAsset) }
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
      const modelName = yield* Config.withDefault(
        Config.schema(WhisperModelSchema, "YLEULC_WHISPER_MODEL"),
        defaultWhisperModel
      )
      const installDir = join(dataDir, "whisper")
      return WhisperBootstrap.of(
        makeWhisperBootstrap({
          binaryAsset: whisperCpuArchiveAsset,
          binaryPath: join(installDir, names.binaryDirectoryName, names.binaryFileName),
          fileSystem,
          installDir,
          modelAsset: whisperModelAssets[modelName]
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
