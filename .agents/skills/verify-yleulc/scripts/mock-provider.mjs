import { createServer } from "node:http"

const scenario = process.env.MOCK_SCENARIO ?? "default"
const port = Number(process.env.MOCK_PORT ?? 8787)

const chunk = (delta, finish, usage) =>
  `data: ${JSON.stringify({
    choices: [{ delta, finish_reason: finish, index: 0, logprobs: null }],
    created: 1790426969,
    id: "verify",
    model: "deepseek-flash",
    object: "chat.completion.chunk",
    system_fingerprint: "verify",
    usage
  })}\n\n`

const replies = {
  default: "Hi! How can I help?",
  slow: "This answer streams slowly on purpose for latency measurement.",
  long: Array.from({ length: 40 }, (_, index) => `Line ${index} of a long answer.`).join("\n")
}

const requests = []

const server = createServer((req, res) => {
  let body = ""
  req.on("data", (piece) => {
    body = body + String(piece)
  })
  req.on("end", () => {
    requests.push({ body, method: req.method, url: req.url })
    if (req.method === "GET" && req.url === "/models") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end('{"object":"list","data":[{"id":"deepseek-flash","object":"model"}]}')
      return
    }
    if (req.method === "GET" && req.url === "/requests") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify(requests))
      return
    }
    if (req.method === "POST" && req.url === "/chat/completions") {
      res.writeHead(200, { "content-type": "text/event-stream" })
      if (scenario === "error") {
        res.write(`data: ${JSON.stringify({ error: { message: "verify upstream failure" } })}\n\n`)
        res.end()
        return
      }
      const reply = replies[scenario] ?? replies.default
      res.write(chunk({ content: null, reasoning_content: "", role: "assistant" }, null, null))
      if (scenario === "slow" || scenario === "long") {
        const parts = reply.match(/.{1,12}/g) ?? [reply]
        let index = 0
        const timer = setInterval(() => {
          if (index >= parts.length) {
            clearInterval(timer)
            res.write(chunk({ content: "" }, "stop", { completion_tokens: 5, prompt_tokens: 9, total_tokens: 14 }))
            res.write("data: [DONE]\n\n")
            res.end()
            return
          }
          res.write(chunk({ content: parts[index], reasoning_content: "" }, null, null))
          index += 1
        }, 60)
        return
      }
      res.write(chunk({ content: reply, reasoning_content: "" }, null, null))
      res.write(chunk({ content: "" }, "stop", { completion_tokens: 5, prompt_tokens: 9, total_tokens: 14 }))
      res.write("data: [DONE]\n\n")
      res.end()
      return
    }
    res.writeHead(404)
    res.end("{}")
  })
})

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`mock-ready scenario=${scenario} port=${port}\n`)
})
