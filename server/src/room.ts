import { DurableObject } from 'cloudflare:workers'
import type { GameEvent, Player } from '../../src/engine/types'
import type { ClientMessage, PlayerInfo, ServerMessage } from '../../src/online/protocol'
import {
  applyClientMove,
  createRoom,
  disconnectToken,
  forfeitIfExpired,
  FORFEIT_GRACE_MS,
  joinRoom,
  playersInfo,
  renamePlayer,
  requestRematch,
  roomFromJSON,
  roomToJSON,
  seatOf,
  type RoomState,
} from './logic'

interface Env {
  ROOM: DurableObjectNamespace
  FORFEIT_GRACE_MS?: string
}

const STORAGE_KEY = 'room'

/**
 * One Durable Object per room. Holds the game state (validated with the same
 * engine the client uses), tracks connections via hibernatable WebSockets,
 * persists to storage, and runs an alarm for the disconnect grace period.
 */
export class MancalaRoom extends DurableObject<Env> {
  private room: RoomState | null = null

  /** Token attached to a socket. Survives DO hibernation (unlike a Map). */
  private tokenOf(ws: WebSocket): string | null {
    const t = ws.deserializeAttachment()
    return typeof t === 'string' && t.length > 0 ? t : null
  }

  private async load(): Promise<RoomState> {
    if (!this.room) {
      const stored = await this.ctx.storage.get<string>(STORAGE_KEY)
      this.room = stored ? roomFromJSON(stored) : createRoom(6)
    }
    return this.room
  }

  private async persist(): Promise<void> {
    if (this.room) await this.ctx.storage.put(STORAGE_KEY, roomToJSON(this.room))
  }

  private graceMs(): number {
    const v = Number(this.env.FORFEIT_GRACE_MS)
    return Number.isFinite(v) && v > 0 ? v : FORFEIT_GRACE_MS
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const room = await this.load()
    // Any room activity also checks whether a disconnected player has now
    // exceeded the grace period (the alarm is the primary trigger, but this
    // makes forfeits robust even if an alarm is delayed).
    await this.checkForfeit()
    let msg: ClientMessage
    try {
      msg = JSON.parse(String(message))
    } catch {
      this.send(ws, { t: 'error', message: 'Malformed message' })
      return
    }
    if (msg.t === 'hello') {
      const token = msg.token.slice(0, 64)
      const name = msg.name.slice(0, 24) || 'Player'
      ws.serializeAttachment(token)
      const seat = joinRoom(room, token, name)
      await this.persist()
      this.send(ws, {
        t: 'welcome',
        room: this.ctx.id.name ?? 'room',
        seat,
        token,
        state: room.game,
        players: playersInfo(room),
        spectators: room.spectatorTokens.length,
      })
      this.broadcastLobby()
      return
    }

    const token = this.tokenOf(ws)
    if (!token) {
      this.send(ws, { t: 'error', message: 'Send hello first' })
      return
    }

    switch (msg.t) {
      case 'move': {
        const outcome = applyClientMove(room, token, msg.pit)
        if (outcome.error) {
          this.send(ws, { t: 'error', message: outcome.error })
          return
        }
        await this.persist()
        this.broadcastState(room, outcome.events, outcome.lastMove)
        return
      }
      case 'rename': {
        if (renamePlayer(room, token, msg.name)) await this.persist()
        this.broadcastLobby()
        return
      }
      case 'rematch': {
        const { reset } = requestRematch(room, token)
        await this.persist()
        if (reset) {
          this.broadcastState(room, [], null)
          this.broadcast({ t: 'notice', message: 'Rematch! Seats swapped, new game.' })
        }
        this.broadcastLobby()
        return
      }
      case 'leave': {
        await this.handleClose(ws)
        return
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleClose(ws)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleClose(ws)
  }

  private async handleClose(ws: WebSocket): Promise<void> {
    const token = this.tokenOf(ws)
    try {
      ws.close()
    } catch {
      // already closed
    }
    if (!token || !this.room) return
    // Another socket may still hold the same identity (e.g. a stale duplicate
    // tab) — only mark the player disconnected when the last one is gone.
    const stillConnected = this.ctx.getWebSockets().some((s) => s !== ws && this.tokenOf(s) === token)
    if (stillConnected) return
    const wasPlayer = seatOf(this.room, token) !== null
    disconnectToken(this.room, token, Date.now())
    await this.persist()
    this.broadcastLobby()
    if (wasPlayer) {
      // Start the forfeit grace timer. Awaited so it survives DO hibernation.
      await this.ctx.storage.setAlarm(Date.now() + this.graceMs())
    }
  }

  async alarm(): Promise<void> {
    await this.checkForfeit()
  }

  /** Forfeit a disconnected player if the grace period has elapsed; re-arm the alarm otherwise. */
  private async checkForfeit(): Promise<void> {
    const room = await this.load()
    const now = Date.now()
    const { forfeitedSeat } = forfeitIfExpired(room, now, this.graceMs())
    if (forfeitedSeat !== null) {
      console.log('[room]', this.ctx.id.name, 'player seat', forfeitedSeat, 'forfeited after grace', this.graceMs(), 'ms')
      await this.persist()
      this.broadcastState(room, [], null)
      const loser = room.players[forfeitedSeat]?.name ?? 'A player'
      const winner = playersInfo(room).find((p) => p.seat !== forfeitedSeat)?.name ?? 'The other player'
      this.broadcast({
        t: 'notice',
        message: `${loser} disconnected — ${winner} wins by forfeit.`,
      })
      this.broadcastLobby()
      return
    }
    // Still within grace: re-arm so the alarm fires again later.
    for (const seat of [0, 1] as const) {
      const p = room.players[seat]
      if (p && !p.connected && p.disconnectedAt !== null) {
        const remaining = this.graceMs() - (now - p.disconnectedAt)
        if (remaining > 0) await this.ctx.storage.setAlarm(now + remaining)
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg)
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    }
  }

  /** State updates are sent per-socket so each client learns its own seat (rematch swaps seats). */
  private broadcastState(
    room: RoomState,
    events: GameEvent[],
    lastMove: { player: Player; pit: number } | null,
  ): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue
      const token = this.tokenOf(ws)
      ws.send(
        JSON.stringify({
          t: 'state',
          state: room.game,
          events,
          lastMove,
          you: token ? seatOf(room, token) : null,
        } satisfies ServerMessage),
      )
    }
  }

  private broadcastLobby(): void {
    if (!this.room) return
    const players: PlayerInfo[] = playersInfo(this.room)
    this.broadcast({ t: 'lobby', players, spectators: this.room.spectatorTokens.length })
  }
}
