import { writeFileSync } from "node:fs"

const port = Number(process.env.CDP_PORT ?? 9222)
const [command, ...rest] = process.argv.slice(2)

async function findPage() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((response) => response.json())
      .catch(() => [])
    const page = Array.isArray(targets)
      ? targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl)
      : undefined
    if (page !== undefined) {
      return page
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return undefined
}

const page = await findPage()
if (page === undefined) {
  process.stderr.write("no CDP page; is the app running with --remote-debugging-port?\n")
  process.exit(2)
}

const socket = new WebSocket(page.webSocketDebuggerUrl)
let nextId = 1
const pending = new Map()

socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data))
  const resolve = pending.get(message.id)
  if (resolve !== undefined) {
    pending.delete(message.id)
    resolve(message.result)
  }
})

const send = (method, params) =>
  new Promise((resolve) => {
    const id = nextId
    nextId += 1
    pending.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })

await new Promise((resolve) => socket.addEventListener("open", resolve))

const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { awaitPromise: true, expression, returnByValue: true })
  return result?.result?.value
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const pressEnter = async () => {
  await send("Input.dispatchKeyEvent", {
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    type: "rawKeyDown",
    windowsVirtualKeyCode: 13
  })
  await send("Input.dispatchKeyEvent", {
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    type: "keyUp",
    windowsVirtualKeyCode: 13
  })
}

const focusAskInput = () =>
  evaluate('document.querySelector(\'input[aria-label="Ask input"]\').focus(), true')

const readVerify = () =>
  evaluate(
    "JSON.stringify({ first: window.__verify?.first ?? 0, settled: window.__verify?.settled ?? 0, events: window.__verify?.events ?? [] })"
  )

const installHook = () =>
  evaluate(`(() => {
    window.__verify = { events: [], first: 0, settled: 0 };
    window.yleulc.onAskEvent((event) => {
      if (window.__verify.first === 0 && (event._tag === "text-delta" || event._tag === "error")) {
        window.__verify.first = performance.now();
      }
      window.__verify.events.push(event);
      if (event._tag === "done" || event._tag === "error") {
        window.__verify.settled = performance.now();
      }
    });
    return true;
  })()`)

const waitForSettle = async (timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = JSON.parse(await readVerify())
    if (state.settled !== 0) {
      return state
    }
    await sleep(200)
  }
  return JSON.parse(await readVerify())
}

const ask = async (question, timeoutMs) => {
  await installHook()
  await send("Runtime.evaluate", { expression: "window.__verify.start = performance.now(), true" })
  await focusAskInput()
  await send("Input.insertText", { text: question })
  await pressEnter()
  const state = await waitForSettle(timeoutMs)
  const text = await evaluate("document.body.innerText")
  const start = Number(await evaluate("window.__verify.start"))
  const events = state.events ?? []
  const answer = events
    .filter((event) => event._tag === "text-delta")
    .map((event) => event.delta)
    .join("")
  const failure = events.find((event) => event._tag === "error")
  return {
    answer,
    answerRendered: typeof text === "string" && answer.length > 0 && text.includes(answer.slice(0, 24)),
    errorShown: typeof text === "string" && text.includes("Answer failed"),
    events,
    firstTokenMs: state.first === 0 ? null : Math.round(state.first - start),
    question,
    settledMs: state.settled === 0 ? null : Math.round(state.settled - start),
    status: failure === undefined ? (state.settled === 0 ? "timeout" : "done") : "error"
  }
}

let output = ""

if (command === "text") {
  output = String(await evaluate("document.body.innerText"))
} else if (command === "eval") {
  output = String(await evaluate(rest.join(" ")))
} else if (command === "shot") {
  const target = rest[0]
  const result = await send("Page.captureScreenshot", { format: "png" })
  if (result?.data === undefined) {
    process.stderr.write("screenshot failed\n")
    process.exit(1)
  }
  writeFileSync(target, Buffer.from(result.data, "base64"))
  output = target
} else if (command === "click") {
  const label = rest.join(" ").toLowerCase()
  output = String(
    await evaluate(`(() => {
      const nodes = Array.from(document.querySelectorAll("button, a, [role=button]"));
      const norm = (node) => (node.textContent ?? "").trim().toLowerCase();
      const target = nodes.find((node) => norm(node) === ${JSON.stringify(label)})
        ?? nodes.find((node) => norm(node).includes(${JSON.stringify(label)}));
      if (!target) return "NOT-FOUND";
      target.click();
      return "clicked";
    })()`)
  )
} else if (command === "status") {
  output = String(
    await evaluate(
      '(() => { const bar = document.querySelector(\'section[aria-label="Live session status"]\'); return bar === null ? "ABSENT" : bar.innerText.replace(/\\s+/g, " ").trim(); })()'
    )
  )
} else if (command === "type") {
  const text = rest.join(" ")
  await send("Input.insertText", { text })
  output = "typed"
} else if (command === "focus") {
  output = String(await evaluate(`document.querySelector(${JSON.stringify(rest[0])}).focus(), true`))
} else if (command === "ask") {
  const timeoutMs = Number(process.env.ASK_TIMEOUT_MS ?? 30000)
  output = JSON.stringify(await ask(rest.join(" "), timeoutMs))
} else if (command === "perf") {
  const timeoutMs = Number(process.env.ASK_TIMEOUT_MS ?? 60000)
  output = JSON.stringify(await ask(rest.join(" "), timeoutMs))
} else if (command === "wait") {
  const text = rest[0]
  const deadline = Date.now() + 20000
  let found = false
  while (Date.now() < deadline) {
    const body = await evaluate("document.body.innerText")
    if (typeof body === "string" && body.includes(text)) {
      found = true
      break
    }
    await sleep(250)
  }
  output = found ? "found" : "TIMEOUT"
} else {
  process.stderr.write("usage: drive.mjs <text|eval|shot|click|status|type|focus|ask|perf|wait> [...]\n")
  process.exit(2)
}

process.stdout.write(output + "\n")
socket.close()
