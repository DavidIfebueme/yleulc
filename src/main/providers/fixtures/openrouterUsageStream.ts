export const openrouterUsageStream = `data: {"id":"gen-abc123","object":"chat.completion.chunk","created":1726400000,"model":"openai/gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"Hi"},"finish_reason":null}]}

data: {"id":"gen-abc123","object":"chat.completion.chunk","created":1726400000,"model":"openai/gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"gen-abc123","object":"chat.completion.chunk","created":1726400000,"model":"openai/gpt-4o","choices":[{"index":0,"delta":{"content":"","role":"assistant"},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":3,"total_tokens":15}}

data: [DONE]
`
