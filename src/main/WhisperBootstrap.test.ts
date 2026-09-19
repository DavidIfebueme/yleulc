import { Buffer } from "node:buffer"
import { join } from "node:path"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  BootstrapError,
  buildWhisperTestFileSystem,
  decodeWhisperAsset,
  makeWhisperBootstrap,
  resolveWhisperAssetNames,
  sha256Hex,
  WhisperBootstrap,
  WhisperFileSystem,
  defaultWhisperModel,
  whisperCpuArchiveAsset,
  whisperModelAssets,
  type WhisperBootstrapInput,
  type WhisperFileSystemScript
} from "./WhisperBootstrap"

const installDir = join("/test-data", "whisper")
const binaryUrl = "https://example.invalid/whisper-cli-linux-x64"
const modelUrl = "https://example.invalid/ggml-tiny.bin"
const binaryBytes = Buffer.from("whisper-binary-fixture")
const modelBytes = Buffer.from("whisper-model-fixture")
const wrongDigest = "0".repeat(64)

function inputWithDigests(
  fileSystem: WhisperBootstrapInput["fileSystem"],
  binaryDigest: string,
  modelDigest: string
): WhisperBootstrapInput {
  return {
    binaryAsset: { fileName: "whisper-cli-linux-x64", sha256: binaryDigest, url: binaryUrl },
    binaryPath: join(installDir, "whisper-cli-linux-x64"),
    fileSystem,
    installDir,
    modelAsset: { fileName: "ggml-tiny.bin", sha256: modelDigest, url: modelUrl }
  }
}

function readyWithScript(script: WhisperFileSystemScript, binaryDigest: string, modelDigest: string) {
  return Effect.gen(function* () {
    const harness = yield* buildWhisperTestFileSystem(script)
    const bootstrapLayer = Layer.effect(
      WhisperBootstrap,
      Effect.gen(function* () {
        const fileSystem = yield* WhisperFileSystem
        return WhisperBootstrap.of(makeWhisperBootstrap(inputWithDigests(fileSystem, binaryDigest, modelDigest)))
      })
    )
    const complete = Layer.provide(bootstrapLayer, harness.layer)
    const inner = Effect.gen(function* () {
      const bootstrap = yield* WhisperBootstrap
      return yield* bootstrap.ensureReady
    })
    const paths = yield* Effect.provide(inner, complete)
    const fetched = yield* harness.fetchedUrls
    const stored = yield* harness.storedPaths
    return { fetched, paths, stored }
  })
}

function scriptWithBlanks(): WhisperFileSystemScript {
  return {
    fetchedBytes: new Map([
      [binaryUrl, binaryBytes],
      [modelUrl, modelBytes]
    ]),
    initialFiles: new Map()
  }
}

describe("resolveWhisperAssetNames", () => {
  it("resolves the Linux x64 archive executable path", async () => {
    const names = await Effect.runPromise(resolveWhisperAssetNames("linux", "x64"))
    expect(names.binaryFileName).toBe("whisper-cli")
    expect(names.binaryDirectoryName).toBe("whisper-bin-ubuntu-x64")
  })
  it("rejects unsupported platforms on the error channel", async () => {
    const error = await Effect.runPromise(Effect.flip(resolveWhisperAssetNames("darwin", "arm64")))
    expect(error).toBeInstanceOf(BootstrapError)
    expect(error.operation).toBe("resolveWhisperAssetNames")
  })
})

describe("whisper bootstrap manifest", () => {
  it("uses tiny without configuration", () => {
    expect(defaultWhisperModel).toBe("tiny")
    expect(whisperModelAssets[defaultWhisperModel]).toEqual(whisperModelAssets.tiny)
  })
  it("pins the verified Linux CPU archive and model assets", () => {
    expect(whisperCpuArchiveAsset).toEqual({
      fileName: "whisper-bin-ubuntu-x64.tar.gz",
      sha256: "53e7fd8b5764edad916b8848dd0af6abb1ff1d3b86c899e79c78652412536c32",
      url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-ubuntu-x64.tar.gz"
    })
    expect(whisperModelAssets).toEqual({
      base: {
        fileName: "ggml-base.bin",
        sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.bin?download=true"
      },
      small: {
        fileName: "ggml-small.bin",
        sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small.bin?download=true"
      },
      tiny: {
        fileName: "ggml-tiny.bin",
        sha256: "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny.bin?download=true"
      }
    })
  })
})

describe("sha256Hex", () => {
  it("matches the standard abc test vector", async () => {
    const digest = await Effect.runPromise(sha256Hex(Buffer.from("abc")))
    expect(digest).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })
})

describe("decodeWhisperAsset", () => {
  it("decodes a distribution asset payload", () => {
    expect(decodeWhisperAsset({ fileName: "ggml-tiny.bin", sha256: wrongDigest, url: modelUrl })).toEqual({
      fileName: "ggml-tiny.bin",
      sha256: wrongDigest,
      url: modelUrl
    })
  })
  it("rejects an asset missing its checksum", () => {
    expect(() => decodeWhisperAsset({ fileName: "ggml-tiny.bin", url: modelUrl })).toThrow()
  })
})

describe("WhisperBootstrap.ensureReady", () => {
  it("downloads the binary and tiny model on first run", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const binaryDigest = yield* sha256Hex(binaryBytes)
        const modelDigest = yield* sha256Hex(modelBytes)
        return yield* readyWithScript(scriptWithBlanks(), binaryDigest, modelDigest)
      })
    )
    expect(result.paths.binaryPath).toBe(join(installDir, "whisper-cli-linux-x64"))
    expect(result.paths.modelPath).toBe(join(installDir, "ggml-tiny.bin"))
    expect(result.fetched).toEqual([binaryUrl, modelUrl])
    expect(result.stored).toContain(join(installDir, "whisper-cli-linux-x64"))
    expect(result.stored).toContain(join(installDir, "ggml-tiny.bin"))
  })
  it("reuses verified files without downloading again", async () => {
    const fetched = await Effect.runPromise(
      Effect.gen(function* () {
        const binaryDigest = yield* sha256Hex(binaryBytes)
        const modelDigest = yield* sha256Hex(modelBytes)
        const harness = yield* buildWhisperTestFileSystem(scriptWithBlanks())
        const bootstrapLayer = Layer.effect(
          WhisperBootstrap,
          Effect.gen(function* () {
            const fileSystem = yield* WhisperFileSystem
            return WhisperBootstrap.of(
              makeWhisperBootstrap(inputWithDigests(fileSystem, binaryDigest, modelDigest))
            )
          })
        )
        const complete = Layer.provide(bootstrapLayer, harness.layer)
        const first = yield* Effect.provide(
          Effect.flatMap(WhisperBootstrap, (bootstrap) => bootstrap.ensureReady),
          complete
        )
        const second = yield* Effect.provide(
          Effect.flatMap(WhisperBootstrap, (bootstrap) => bootstrap.ensureReady),
          complete
        )
        void first
        void second
        return yield* harness.fetchedUrls
      })
    )
    expect(fetched).toEqual([binaryUrl, modelUrl])
  })
  it("re-downloads a stored binary that fails verification", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const binaryDigest = yield* sha256Hex(binaryBytes)
        const modelDigest = yield* sha256Hex(modelBytes)
        const script: WhisperFileSystemScript = {
          fetchedBytes: new Map([
            [binaryUrl, binaryBytes],
            [modelUrl, modelBytes]
          ]),
          initialFiles: new Map([
            [join(installDir, "whisper-cli-linux-x64"), Buffer.from("tampered")],
            [join(installDir, "ggml-tiny.bin"), modelBytes]
          ])
        }
        return yield* readyWithScript(script, binaryDigest, modelDigest)
      })
    )
    expect(result.fetched).toEqual([binaryUrl])
    expect(result.paths.binaryPath).toBe(join(installDir, "whisper-cli-linux-x64"))
  })
  it("fails the download whose checksum mismatches", async () => {
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const modelDigest = yield* sha256Hex(modelBytes)
        return yield* Effect.flip(readyWithScript(scriptWithBlanks(), wrongDigest, modelDigest))
      })
    )
    expect(error).toBeInstanceOf(BootstrapError)
    expect(error.operation).toBe("installAsset")
  })
  it("resolves canned paths from the test layer", async () => {
    const paths = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(WhisperBootstrap, (bootstrap) => bootstrap.ensureReady),
        WhisperBootstrap.Test
      )
    )
    expect(paths.binaryPath).toBe("/test-data/whisper-cli")
    expect(paths.modelPath).toBe("/test-data/ggml-tiny.bin")
  })
})
