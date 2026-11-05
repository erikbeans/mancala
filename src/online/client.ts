import type { ClientMessage, ServerMessage } from './protocol'

/**
 * WebSocket URL of the game server. Local dev runs `wrangler dev` on :8787;
 * production uses the deployed worker. Override with VITE_ONLINE_WS_URL.
 */
export function onlineWsUrl(): string {
  const fromEnv = import.meta.env.VITE_ONLINE_WS_URL as string | undefined
  if (fromEnv) return fromEnv
  if (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    return `ws://${location.hostname}:8787`
  }
  // Permanent game server on a custom domain (see README: worker route
  // api.clickbeans.com/* -> mancala-server in the Cloudflare dashboard).
  return 'wss://api.clickbeans.com'
}

export interface OnlineHandlers {
  onMessage: (msg: ServerMessage) => void
  onOpen?: () => void
  onClose?: () => void
}

const TOKEN_KEY = 'mancala:token'
const NAME_KEY = 'mancala:name'

// In-memory fallback: keeps the identity stable for the lifetime of the page
// even if storage is unavailable (private mode, blocked storage, sandboxed tab).
let memToken: string | null = null

/**
 * Stable per-tab identity so a reconnect (or reload) reclaims the same seat.
 * sessionStorage (not localStorage) so that opening an invite link in a
 * second tab of the same browser counts as a separate player, while a refresh
 * of the same tab keeps the seat.
 */
export function playerToken(): string {
  if (memToken) return memToken
  let t: string | null = null
  try {
    t = sessionStorage.getItem(TOKEN_KEY)
  } catch {
    t = null
  }
  if (!t) {
    t = crypto.randomUUID()
    try {
      sessionStorage.setItem(TOKEN_KEY, t)
    } catch {
      // storage unavailable — memToken still keeps this page session stable
    }
  }
  memToken = t
  return t
}

export function storedPlayerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // ignore
  }
}

export function defaultPlayerName(): string {
  const stored = storedPlayerName()
  if (stored) return stored
  const name = `Player${Math.floor(1000 + Math.random() * 9000)}`
  savePlayerName(name)
  return name
}

/**
 * Thin WebSocket client for one room. Reconnects automatically with backoff
 * (the server keeps the seat for FORFEIT_GRACE_MS via the token).
 */
export class OnlineClient {
  private ws: WebSocket | null = null
  private handlers: OnlineHandlers
  private room: string
  private name: string
  private closedByUser = false
  private retryMs = 1000
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  connected = false

  constructor(room: string, name: string, handlers: OnlineHandlers) {
    this.room = room
    this.name = name
    this.handlers = handlers
  }

  connect(): void {
    this.closedByUser = false
    const url = `${onlineWsUrl()}/room/${this.room}`
    const ws = new WebSocket(url)
    this.ws = ws
    ws.onopen = () => {
      this.connected = true
      this.retryMs = 1000
      this.handlers.onOpen?.()
      this.send({ t: 'hello', name: this.name, token: playerToken() })
    }
    ws.onmessage = (e) => {
      try {
        this.handlers.onMessage(JSON.parse(String(e.data)) as ServerMessage)
      } catch {
        // ignore malformed frames
      }
    }
    ws.onclose = () => {
      this.connected = false
      this.handlers.onClose?.()
      if (!this.closedByUser) {
        this.retryTimer = setTimeout(() => {
          this.retryMs = Math.min(this.retryMs * 2, 10_000)
          this.connect()
        }, this.retryMs)
      }
    }
    ws.onerror = () => {
      // onclose follows; nothing to do here
    }
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  close(): void {
    this.closedByUser = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.ws?.close()
    this.connected = false
  }
}
