/**
 * Server-sent events over XMLHttpRequest.
 *
 * `expo/fetch` exposes a `body` reader, but on device it does not deliver the individual frames of a
 * long lived event stream: only the frames emitted right after the connection opens arrive, and the
 * rest of the stream is silently dropped. Reading `responseText` while the request is still
 * unfulfilled is the reliable way to consume SSE in React Native, so the event streams do not use
 * fetch at all.
 */

export type SseFrame = (data: string) => void

export function openSse(input: {
  url: string
  headers: Record<string, string>
  signal: AbortSignal
  onFrame: SseFrame
  onError: (cause: unknown) => void
  onOpen?: () => void
}) {
  const request = new XMLHttpRequest()
  let opened = false
  // XHR has no stream API, so the growing responseText is re-read and only the new tail parsed.
  let consumed = 0

  const abort = () => {
    try {
      request.abort()
    } catch {
      // Already finished.
    }
  }
  input.signal.addEventListener("abort", abort)
  if (input.signal.aborted) {
    abort()
    return
  }

  request.open("GET", input.url, true)
  // A cache buster keeps intermediaries from buffering the stream.
  request.setRequestHeader("Accept", "text/event-stream")
  request.setRequestHeader("Cache-Control", "no-cache")
  for (const [name, value] of Object.entries(input.headers)) request.setRequestHeader(name, value)

  const drain = () => {
    const text = request.responseText ?? ""
    if (text.length <= consumed) return
    const chunk = text.slice(consumed)
    consumed = text.length
    let rest = chunk
    let cut = rest.indexOf("\n\n")
    while (cut !== -1) {
      const frame = rest.slice(0, cut)
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue
        const data = line.slice(5).trim()
        if (data) input.onFrame(data)
      }
      rest = rest.slice(cut + 2)
      cut = rest.indexOf("\n\n")
    }
  }

  request.onreadystatechange = () => {
    // 3 is LOADING: headers are in and the body is still arriving.
    if (request.readyState === 3) {
      if (!opened) {
        opened = true
        input.onOpen?.()
      }
      drain()
      return
    }
    if (request.readyState === 4) {
      input.signal.removeEventListener("abort", abort)
      if (input.signal.aborted) return
      if (request.status >= 400) {
        input.onError(new Error(`stream ${request.status}`))
        return
      }
      drain()
    }
  }

  request.onerror = () => {
    input.signal.removeEventListener("abort", abort)
    if (input.signal.aborted) return
    input.onError(new Error("fallo de red en el stream"))
  }

  request.send()
}
