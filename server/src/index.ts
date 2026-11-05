import { MancalaRoom } from './room'

interface Env {
  ROOM: DurableObjectNamespace
  FORFEIT_GRACE_MS?: string
}

export { MancalaRoom }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'mancala-server' })
    }
    const m = url.pathname.match(/^\/room\/([A-Z2-9]{6})$/)
    if (m) {
      const id = env.ROOM.idFromName(m[1])
      return env.ROOM.get(id).fetch(request)
    }
    return new Response('Not found. Use /room/<6-char-code> with a WebSocket upgrade.', {
      status: 404,
    })
  },
}
