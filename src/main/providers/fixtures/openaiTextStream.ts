export const openaiTextStream = `data: {"id":"chatcmpl-001","object":"chat.completion.chunk","created":1726400000,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-001","object":"chat.completion.chunk","created":1726400000,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" from the meeting"},"finish_reason":null}]}

data: {"id":"chatcmpl-001","object":"chat.completion.chunk","created":1726400000,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
`
