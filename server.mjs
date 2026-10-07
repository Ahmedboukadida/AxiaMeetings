import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

// ── Logging ──────────────────────────────────────────────────────────────────
// LOG_LEVEL = error | warn | info (default) | debug. Per-socket events are debug only.
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LOG_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LOG_LEVELS.info;
const log = {
  error: (...a) => LOG_LEVEL >= 0 && console.error(...a),
  warn: (...a) => LOG_LEVEL >= 1 && console.warn(...a),
  info: (...a) => LOG_LEVEL >= 2 && console.log(...a),
  debug: (...a) => LOG_LEVEL >= 3 && console.log(...a),
};

// Small dedicated pool for the socket server (API routes use their own client).
const SOCKET_DB_POOL_MAX = Number.parseInt(process.env.SOCKET_DB_POOL_MAX || '5', 10) || 5;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: SOCKET_DB_POOL_MAX,
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS) || 30_000,
  connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS) || 10_000,
  keepAlive: true,
  application_name: 'axiameetings-socket',
});
pool.on('error', (err) => console.error('[socket-db] idle client error:', err.message));
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// ── CORS allow-list ──────────────────────────────────────────────────────────
// NEXT_PUBLIC_SITE_URL plus optional comma-separated CORS_ORIGINS.
// Requests without an Origin header (same-origin GETs, server-to-server, curl)
// are not affected; same-origin requests never need CORS headers.
function normalizeOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

const allowedOrigins = new Set(
  [process.env.NEXT_PUBLIC_SITE_URL, ...(process.env.CORS_ORIGINS || '').split(',')]
    .map(normalizeOrigin)
    .filter(Boolean)
);

function isAllowedOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  return normalized !== null && allowedOrigins.has(normalized);
}

// ── Live meeting helpers ─────────────────────────────────────────────────────
// Vote rules mirror src/lib/votes.ts (this file is plain ESM and cannot import TS).
const VOTE_VALUES = ['OUI', 'NON', 'NEUTRE'];

function normaliseVote(value) {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return VOTE_VALUES.includes(upper) ? upper : null;
}

function toId(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

function meetingIdFromRoom(roomId) {
  const m = typeof roomId === 'string' ? /^meeting-(\d+)$/.exec(roomId) : null;
  return m ? toId(m[1]) : null;
}

function voteKey(roomId, pointId) {
  return `${roomId}#${pointId}`;
}

function clampDuration(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 60;
  return Math.min(3600, Math.max(5, Math.round(n)));
}

function remainingSeconds(entry) {
  return Math.max(0, Math.ceil((entry.endsAt - Date.now()) / 1000));
}

// ── Socket authentication (mirrors src/lib/authz.ts) ─────────────────────────
// Every socket gets a principal at handshake time (re-checked on every reconnect):
//   { kind: 'staff', userId, role, companyId, email }      logged-in user (any role)
//   { kind: 'invitee', participantId, meetingId, email }   invite link (token + email)
// Valid invitee credentials win over the browser session (same rule as
// requireMeetingActor). Sockets with neither are refused ('unauthorized').
const AUTH_COOKIE = 'axia_meetings_token';
const ROLES = ['DEVELOPER', 'ADMIN', 'PARTICIPANT'];
const MAX_CRED_LENGTH = 1024;

const SQL_USER = 'SELECT id, role::text AS role, company_id, email, token_version FROM users WHERE id = $1';
// Join tokens expire when the meeting ends (N47): no invitee access to a FINISHED or CANCELLED meeting.
const SQL_INVITEE = `SELECT p.id, p.email, p.meeting_id FROM meetings_participants p
  JOIN meetings m ON m.id = p.meeting_id AND m.status::text NOT IN ('FINISHED', 'CANCELLED')
  WHERE p.meeting_id = $1 AND p.token = $2 AND p.email = $3
    AND EXISTS (SELECT 1 FROM meetings_invitations i
                WHERE i.meetings_participant_id = p.id AND i.meeting_id = p.meeting_id AND i.status = 'ACCEPTED')
  ORDER BY p.id LIMIT 1`;
const SQL_MEETING = 'SELECT id, company_id, status::text AS status FROM meetings WHERE id = $1';
const SQL_OWN_PARTICIPANT = 'SELECT id FROM meetings_participants WHERE meeting_id = $1 AND email = $2 ORDER BY id LIMIT 1';

const isCred = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_CRED_LENGTH;
const asObject = (v) => (v && typeof v === 'object' ? v : {});

function readCookie(header, name) {
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const c = part.trim();
    if (c.startsWith(`${name}=`)) {
      try {
        return decodeURIComponent(c.slice(name.length + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Logged-in user from a JWT, re-loaded from the DB (deleted user / role or company change apply at once).
async function principalFromJwt(raw) {
  const secret = process.env.JWT_SECRET;
  if (!secret || !isCred(raw)) return null;
  let payload;
  try {
    payload = jwt.verify(raw, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  const userId = toId(payload?.userId);
  if (!userId) return null;
  const { rows } = await pool.query(SQL_USER, [userId]);
  const row = rows[0];
  if (!row || !ROLES.includes(row.role)) return null;
  // Session revocation (N41): the token's tv must equal users.token_version (missing tv = 0).
  const tv = payload.tv === undefined ? 0 : payload.tv;
  if (!Number.isInteger(tv) || tv !== (row.token_version ?? 0)) return null;
  // An ADMIN or PARTICIPANT without a company has no scope at all.
  if (row.role !== 'DEVELOPER' && row.company_id == null) return null;
  return { kind: 'staff', userId: row.id, role: row.role, companyId: row.company_id, email: row.email ?? null };
}

// Invitee of one meeting: token + email must match, the invitation must be ACCEPTED and the
// meeting must not be FINISHED or CANCELLED.
async function principalFromInvite(meetingId, token, email) {
  if (!meetingId || !isCred(token) || !isCred(email)) return null;
  const { rows } = await pool.query(SQL_INVITEE, [meetingId, token, email]);
  const row = rows[0];
  return row ? { kind: 'invitee', participantId: row.id, meetingId: row.meeting_id, email: row.email } : null;
}

async function resolvePrincipal(handshake) {
  const auth = asObject(handshake?.auth);
  const headers = asObject(handshake?.headers);
  const meetingId = toId(auth.meetingId);
  const inviteCreds = Boolean(meetingId && isCred(auth.email) && isCred(auth.token));
  if (inviteCreds) {
    const invitee = await principalFromInvite(meetingId, auth.token, auth.email);
    if (invitee) return invitee;
  }
  const bearer = typeof headers.authorization === 'string' && /^Bearer\s+/i.test(headers.authorization)
    ? headers.authorization.replace(/^Bearer\s+/i, '').trim()
    : null;
  // Cookie (web), then auth.token / Authorization header (mobile Bearer). auth.token is an
  // invite token, not a JWT, when meetingId + email came with it.
  const candidates = [readCookie(headers.cookie, AUTH_COOKIE), inviteCreds ? null : auth.token, bearer];
  for (const raw of candidates) {
    const staff = await principalFromJwt(raw);
    if (staff) return staff;
  }
  return null;
}

// What a principal may do in one meeting, or null when he may not read it
// (same rules as assertMeetingAccess / isMeetingStaff in src/lib/authz.ts):
// DEVELOPER: all; ADMIN: own company; PARTICIPANT user: own company + invited by email;
// invitee: his meeting only. participantId = the caller's own participant row (votes, hands).
async function computeAccess(principal, meetingId) {
  const { rows } = await pool.query(SQL_MEETING, [meetingId]);
  const meeting = rows[0];
  if (!meeting) return null;
  const base = { meetingId: meeting.id, companyId: meeting.company_id };
  if (principal.kind === 'invitee') {
    return principal.meetingId === meeting.id ? { ...base, staff: false, participantId: principal.participantId } : null;
  }
  const staff = principal.role === 'DEVELOPER'
    || (principal.role === 'ADMIN' && principal.companyId != null && principal.companyId === meeting.company_id);
  let participantId = null;
  if (principal.email && (staff || principal.companyId === meeting.company_id)) {
    const r = await pool.query(SQL_OWN_PARTICIPANT, [meeting.id, principal.email]);
    participantId = r.rows[0]?.id ?? null;
  }
  if (staff) return { ...base, staff: true, participantId };
  if (principal.role === 'PARTICIPANT' && principal.companyId === meeting.company_id && participantId) {
    return { ...base, staff: false, participantId };
  }
  return null;
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

const staffRoom = (roomId) => `${roomId}:staff`;

async function recordVote(pointId, participantId, vote) {
  const existing = await prisma.meetings_votes.findFirst({
    where: { point_id: pointId, meetings_participant_id: participantId },
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  if (existing) {
    await prisma.meetings_votes.update({ where: { id: existing.id }, data: { vote } });
  } else {
    await prisma.meetings_votes.create({ data: { point_id: pointId, meetings_participant_id: participantId, vote } });
  }
}

// Latest row per participant counts (protects against legacy duplicate rows).
async function tallyVotes(pointId) {
  const rows = await prisma.meetings_votes.findMany({
    where: { point_id: pointId },
    orderBy: { id: 'asc' },
    select: { meetings_participant_id: true, vote: true },
  });
  const latest = new Map();
  for (const r of rows) latest.set(r.meetings_participant_id, r.vote);
  const results = { oui: 0, non: 0, neutre: 0 };
  for (const v of latest.values()) {
    if (v === 'OUI') results.oui++;
    else if (v === 'NON') results.non++;
    else if (v === 'NEUTRE') results.neutre++;
  }
  return { results, total: results.oui + results.non + results.neutre };
}

let httpServer;
let io;

app.prepare().then(() => {
  httpServer = createServer((req, res) => {
    // CORS headers only for allow-listed origins
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
    }

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Client address for rate limiting (src/lib/rate-limit.ts getIp): always from the TCP
    // socket, never from the client. Forwarding headers are only honoured with TRUST_PROXY=true.
    delete req.headers['x-axia-client-ip'];
    const remote = req.socket?.remoteAddress;
    if (remote) req.headers['x-axia-client-ip'] = remote;

    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  io = new Server(httpServer, {
    cors: {
      // Same allow-list as HTTP. No Origin header => no CORS headers needed.
      origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Attach io to global so it can be used in API routes
  global.io = io;

  // ── Live room state (in memory, single process) ───────────────────────────
  // Active votes: one entry (and one timer) per room + point.
  const activeVotes = new Map(); // `${roomId}#${pointId}` -> { roomId, meetingId, pointId, description, timer }
  // Pending lobby requests: roomId -> Map(participantId -> { socketId, name })
  const pendingJoins = new Map();
  // Serialises vote writes per (point, participant) so a quick re-vote never creates duplicates.
  const voteLocks = new Map();
  // Votes closed by this process: roomId -> Set(pointId). Makes a repeated Stop (or a
  // resume after the vote ended) a no-op. Emptied when the room empties or the meeting ends.
  const closedVotes = new Map();
  // Stops being processed right now (dedupes a double click while the DB tally runs).
  const stopsInFlight = new Set();

  const isClosed = (roomId, pointId) => closedVotes.get(roomId)?.has(pointId) === true;
  function markClosed(roomId, pointId) {
    let set = closedVotes.get(roomId);
    if (!set) closedVotes.set(roomId, (set = new Set()));
    set.add(pointId);
  }

  function clearRoomState(roomId) {
    for (const [key, entry] of activeVotes) {
      if (entry.roomId === roomId) {
        clearTimeout(entry.timer);
        activeVotes.delete(key);
      }
    }
    pendingJoins.delete(roomId);
    closedVotes.delete(roomId);
  }

  // Socket.IO removes a room when its last socket leaves: drop room-scoped
  // bookkeeping with it. An active vote is kept (its timer bounds it) so a
  // network blip that empties the room does not kill the vote.
  io.of('/').adapter.on('delete-room', (roomId) => {
    if (!meetingIdFromRoom(roomId)) return; // also skips the `${roomId}:staff` rooms
    pendingJoins.delete(roomId);
    closedVotes.delete(roomId);
    log.debug(`room ${roomId} empty, state released`);
  });

  async function loadPoint(meetingId, pointId) {
    const point = await prisma.meetings_points.findUnique({
      where: { id: pointId },
      select: { id: true, point: true, meeting_id: true, type: true },
    });
    return point && point.meeting_id === meetingId && point.type === 'VOTE' ? point : null;
  }

  function startVoteTimer(key, roomId, meetingId, point, seconds) {
    const previous = activeVotes.get(key);
    if (previous) clearTimeout(previous.timer);
    closedVotes.get(roomId)?.delete(point.id);
    const entry = {
      roomId, meetingId, pointId: point.id, description: point.point,
      duration: seconds, endsAt: Date.now() + seconds * 1000, timer: null,
    };
    entry.timer = setTimeout(() => {
      endVote(key).catch((e) => log.error('Error ending vote:', e));
    }, seconds * 1000);
    activeVotes.set(key, entry);
    return entry;
  }

  // Current room state for one socket (sent on every join-room, i.e. on every (re)connect).
  async function sendRoomState(socket, roomId, access) {
    const meetingId = meetingIdFromRoom(roomId);
    if (!meetingId) return;
    const meeting = await prisma.meetings.findUnique({
      where: { id: meetingId },
      select: { status: true, company_id: true },
    });
    let activeVote = null;
    for (const entry of activeVotes.values()) {
      if (entry.roomId !== roomId) continue;
      activeVote = {
        noteId: entry.pointId,
        description: entry.description,
        duration: entry.duration,
        remaining: remainingSeconds(entry),
        ...(await tallyVotes(entry.pointId)),
      };
      break;
    }
    const state = { roomId, meetingStatus: meeting?.status ?? null, activeVote };
    if (access?.staff && meeting) {
      state.pendingJoins = [...(pendingJoins.get(roomId)?.entries() ?? [])]
        .map(([participantId, p]) => ({ participantId, name: p.name, socketId: p.socketId }));
    }
    if (socket.connected) socket.emit('room:state', state);
  }

  // Meeting ended (REST PUT or the creator's socket): tell the room, drop its state.
  function endMeetingRoom(meetingId) {
    const roomId = `meeting-${meetingId}`;
    clearRoomState(roomId);
    io.to(roomId).emit('meeting:ended');
  }

  function startMeetingRoom(meetingId) {
    const roomId = `meeting-${meetingId}`;
    pendingJoins.delete(roomId); // everyone waiting is now admitted
    io.to(roomId).emit('meeting:started');
  }

  // For API routes running in this process (see src/app/api/meetings/[id]/live/route.ts).
  global.liveRooms = { endMeeting: endMeetingRoom, startMeeting: startMeetingRoom };
  // For the socket test harness only (sizes of the in-memory maps).
  global.__liveRoomStats = () => ({
    activeVotes: activeVotes.size,
    pendingJoins: pendingJoins.size,
    voteLocks: voteLocks.size,
    closedVotes: closedVotes.size,
    stopsInFlight: stopsInFlight.size,
    sockets: io.of('/').sockets.size,
    rooms: io.of('/').adapter.rooms.size,
  });

  // Handshake auth: every socket has a principal or is refused. 'unavailable' (DB down)
  // tells the client to retry later; 'unauthorized' means the credentials are not valid.
  io.use(async (socket, next) => {
    try {
      const principal = await resolvePrincipal(socket.handshake);
      if (!principal) return next(new Error('unauthorized'));
      socket.data.principal = principal;
      socket.data.access = new Map(); // meetingId -> access (computeAccess), per socket
      next();
    } catch (error) {
      log.error('Socket auth error:', error);
      next(new Error('unavailable'));
    }
  });

  io.on('connection', (socket) => {
    const principal = socket.data.principal;
    log.debug('Client connected:', socket.id, principal.kind === 'staff' ? `(user ${principal.userId} ${principal.role})` : `(invitee ${principal.participantId})`);

    const forbid = (event, roomId) => {
      socket.emit('error:forbidden', { event, roomId: typeof roomId === 'string' ? roomId : null });
      return null;
    };

    // Access of this socket to the meeting behind `roomId` (cached per socket), or null
    // after telling the client 'error:forbidden'. `staff: true` = DEVELOPER or ADMIN of
    // the meeting's company only.
    async function roomAccess(event, roomId, { staff = false } = {}) {
      const meetingId = meetingIdFromRoom(roomId);
      if (!meetingId) return forbid(event, roomId);
      let access = socket.data.access.get(meetingId);
      if (!access) {
        access = await computeAccess(principal, meetingId);
        if (access) socket.data.access.set(meetingId, access);
      }
      if (!access || (staff && !access.staff)) return forbid(event, roomId);
      return access;
    }

    // Wraps a handler: payload always an object, errors logged, never thrown.
    const on = (event, fn) => socket.on(event, async (payload, ack) => {
      try {
        await fn(asObject(payload), typeof ack === 'function' ? ack : () => {});
      } catch (error) {
        log.error(`Error handling ${event}:`, error);
        if (typeof ack === 'function') ack({ ok: false, error: 'server_error' });
      }
    });

    socket.on('join-room', async (roomId) => {
      try {
        const access = await roomAccess('join-room', roomId);
        if (!access) return;
        socket.join(roomId);
        if (access.staff) socket.join(staffRoom(roomId));
        log.debug(`Socket ${socket.id} joined room ${roomId}`);
        await sendRoomState(socket, roomId, access);
      } catch (error) {
        log.error('Error joining room:', error);
      }
    });

    // Personal notification room. The client-supplied email is ignored: a logged-in user
    // only ever joins the room of his own (DB) email, which src/lib/notifications.ts targets.
    socket.on('join-user', () => {
      if (principal.kind !== 'staff' || !principal.email) return;
      socket.join(`user-${principal.email}`);
      log.debug(`Socket ${socket.id} joined personal room of user ${principal.userId}`);
    });

    // ── Lobby (join requests) ────────────────────────────────────────────────
    // Only for meetings that have not started: once STARTED, invitees with a
    // valid token enter directly (REST GET /api/meetings/[id]/live).
    // The participant is always the caller (payload participantId ignored); the request
    // (with socket id) goes to the staff of the room only.
    on('join:request', async ({ roomId, name }) => {
      const access = await roomAccess('join:request', roomId);
      if (!access || access.staff || !access.participantId) return;
      const participantId = access.participantId;
      const meeting = await prisma.meetings.findUnique({ where: { id: access.meetingId }, select: { status: true } });
      if (!meeting || meeting.status === 'STARTED') return; // already admitted

      const displayName = cleanName(name) || principal.email || 'Participant';
      let room = pendingJoins.get(roomId);
      if (!room) pendingJoins.set(roomId, (room = new Map()));
      room.set(participantId, { socketId: socket.id, name: displayName });
      socket.data.pendingJoin = { roomId, participantId };

      io.to(staffRoom(roomId)).emit('join:requested', { participantId, name: displayName, socketId: socket.id });
    });

    // Removes and returns the pending entry; drops the room map once empty.
    function takePending(roomId, pId) {
      const room = pendingJoins.get(roomId);
      const pending = room?.get(pId);
      if (pending) {
        room.delete(pId);
        if (room.size === 0) pendingJoins.delete(roomId);
      }
      return pending;
    }

    // Lobby answer target: the pending socket, else the socket id sent by the staff page,
    // but only if that socket is in the room and speaks for that participant.
    function lobbyTarget(roomId, access, pId, socketId) {
      const pending = takePending(roomId, pId);
      if (pending) return pending.socketId;
      if (typeof socketId !== 'string') return null;
      const other = io.of('/').sockets.get(socketId);
      return other?.rooms.has(roomId) && other.data.access?.get(access.meetingId)?.participantId === pId ? socketId : null;
    }

    on('join:accept', async ({ roomId, participantId, socketId }) => {
      const access = await roomAccess('join:accept', roomId, { staff: true });
      const pId = toId(participantId);
      if (!access || !pId) return;
      const target = lobbyTarget(roomId, access, pId, socketId);
      if (target) io.to(target).emit('join:accepted');
      io.to(staffRoom(roomId)).emit('join:approved', { participantId: pId });
    });

    on('join:reject', async ({ roomId, participantId, socketId }) => {
      const access = await roomAccess('join:reject', roomId, { staff: true });
      const pId = toId(participantId);
      if (!access || !pId) return;
      const target = lobbyTarget(roomId, access, pId, socketId);
      if (target) io.to(target).emit('join:rejected');
      io.to(staffRoom(roomId)).emit('join:cancelled', { participantId: pId });
    });

    // Sent by the creator's page after the REST PUT; the DB status is the proof.
    on('meeting:start', async ({ roomId }) => {
      const access = await roomAccess('meeting:start', roomId, { staff: true });
      if (!access) return;
      const meeting = await prisma.meetings.findUnique({ where: { id: access.meetingId }, select: { status: true } });
      if (meeting?.status !== 'STARTED') return;
      startMeetingRoom(access.meetingId);
    });

    on('meeting:end', async ({ roomId }) => {
      const access = await roomAccess('meeting:end', roomId, { staff: true });
      if (!access) return;
      const meeting = await prisma.meetings.findUnique({ where: { id: access.meetingId }, select: { status: true } });
      if (meeting?.status !== 'FINISHED') return;
      endMeetingRoom(access.meetingId);
    });

    // ── Voting (the server is the source of truth for tallies) ──────────────
    on('vote:start', async ({ roomId, noteId, duration }) => {
      const access = await roomAccess('vote:start', roomId, { staff: true });
      const pointId = toId(noteId);
      if (!access || !pointId) return;

      const point = await loadPoint(access.meetingId, pointId);
      if (!point) return;

      const seconds = clampDuration(duration);
      startVoteTimer(voteKey(roomId, pointId), roomId, access.meetingId, point, seconds);

      io.to(roomId).emit('vote:started', { noteId: pointId, duration: seconds, remaining: seconds, description: point.point });
      // Votes already stored for this point (e.g. a restarted vote) are part of the tally.
      io.to(roomId).emit('vote:update', { noteId: pointId, ...(await tallyVotes(pointId)) });
    });

    // The manager's page still shows a running vote that this process does not know
    // (server restarted mid-vote): re-arm the timer for the time left, keep the votes.
    on('vote:resume', async ({ roomId, noteId, remaining }) => {
      const access = await roomAccess('vote:resume', roomId, { staff: true });
      const pointId = toId(noteId);
      if (!access || !pointId) return;
      const meetingId = access.meetingId;
      const key = voteKey(roomId, pointId);
      if (activeVotes.has(key)) return sendRoomState(socket, roomId, access); // already running
      if (stopsInFlight.has(key)) return; // a Stop is closing it right now: Stop wins
      if (isClosed(roomId, pointId)) {
        // Ended while the manager was away: close it on their side too.
        const point = await loadPoint(meetingId, pointId);
        if (point) socket.emit('vote:ended', { noteId: pointId, ...(await tallyVotes(pointId)), description: point.point });
        return;
      }
      if (!(Number(remaining) > 0)) return stopVote(roomId, pointId); // time ran out meanwhile
      const point = await loadPoint(meetingId, pointId);
      if (!point || activeVotes.has(key) || stopsInFlight.has(key) || isClosed(roomId, pointId)) return;
      const seconds = clampDuration(remaining);
      startVoteTimer(key, roomId, meetingId, point, seconds);
      io.to(roomId).emit('vote:started', { noteId: pointId, duration: seconds, remaining: seconds, description: point.point, resumed: true });
      io.to(roomId).emit('vote:update', { noteId: pointId, ...(await tallyVotes(pointId)) });
    });

    on('vote:stop', async ({ roomId, noteId }) => {
      const access = await roomAccess('vote:stop', roomId, { staff: true });
      const pointId = toId(noteId);
      if (!access || !pointId) return;
      await stopVote(roomId, pointId);
    });

    // The voter is always the caller: invitee -> his participant row; logged-in user ->
    // the participant row of his email in this meeting. payload.participantId is ignored.
    on('vote:submit', async ({ roomId, noteId, vote: rawVote }, reply) => {
      const pointId = toId(noteId);
      const vote = normaliseVote(rawVote);
      if (typeof roomId !== 'string' || !pointId || !vote) return reply({ ok: false, error: 'invalid_vote' });

      const access = await roomAccess('vote:submit', roomId);
      if (!access) return reply({ ok: false, error: 'forbidden' });
      const participantId = access.participantId;
      if (!participantId) return reply({ ok: false, error: 'not_a_participant' });

      const key = voteKey(roomId, pointId);
      if (!activeVotes.has(key)) return reply({ ok: false, error: 'vote_closed' });

      await withVoteLock(`${pointId}:${participantId}`, () => recordVote(pointId, participantId, vote));
      // Always the full tally from the DB, never a delta: clients just display it.
      io.to(roomId).emit('vote:update', { noteId: pointId, ...(await tallyVotes(pointId)) });
      reply({ ok: true });
    });

    // ── Hand raising ─────────────────────────────────────────────────────────
    // Raise: only for yourself (participant row from the principal).
    on('hand:raise', async ({ roomId, name }) => {
      const access = await roomAccess('hand:raise', roomId);
      if (!access) return;
      const participantId = access.participantId;
      if (!participantId) return forbid('hand:raise', roomId);
      await prisma.meetings_turn_requests.create({
        data: { meeting_id: access.meetingId, meetings_participant_id: participantId, status: 'PENDING' },
      });
      io.to(roomId).emit('hand:raised', { participantId, name: cleanName(name) || principal.email || 'Participant' });
    });

    on('hand:accept', async ({ roomId, participantId }) => {
      const access = await roomAccess('hand:accept', roomId, { staff: true });
      const pId = toId(participantId);
      if (!access || !pId) return;
      await prisma.meetings_turn_requests.updateMany({
        where: { meeting_id: access.meetingId, meetings_participant_id: pId, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
      io.to(roomId).emit('hand:accepted', { participantId: pId });
    });

    on('hand:refuse', async ({ roomId, participantId }) => {
      const access = await roomAccess('hand:refuse', roomId, { staff: true });
      const pId = toId(participantId);
      if (!access || !pId) return;
      await prisma.meetings_turn_requests.updateMany({
        where: { meeting_id: access.meetingId, meetings_participant_id: pId, status: 'PENDING' },
        data: { status: 'REJECTED' },
      });
      io.to(roomId).emit('hand:refused', { participantId: pId });
    });

    // End of a turn: staff for anyone, a participant only for himself ("stop my intervention").
    on('hand:mute', async ({ roomId, participantId }) => {
      const access = await roomAccess('hand:mute', roomId);
      const pId = toId(participantId);
      if (!access || !pId) return;
      if (!access.staff && access.participantId !== pId) return forbid('hand:mute', roomId);
      io.to(roomId).emit('hand:muted', { participantId: pId });
    });

    socket.on('disconnect', (reason) => {
      log.debug('Client disconnected:', socket.id, reason);
      const pending = socket.data.pendingJoin;
      if (pending) {
        const room = pendingJoins.get(pending.roomId);
        if (room?.get(pending.participantId)?.socketId === socket.id) {
          room.delete(pending.participantId);
          if (room.size === 0) pendingJoins.delete(pending.roomId);
          io.to(staffRoom(pending.roomId)).emit('join:cancelled', { participantId: pending.participantId });
        }
      }
    });
  });

  async function endVote(key) {
    const entry = activeVotes.get(key);
    if (!entry) return; // already ended (stop + timer race, double stop)
    activeVotes.delete(key);
    clearTimeout(entry.timer);
    markClosed(entry.roomId, entry.pointId);
    const tally = await tallyVotes(entry.pointId);
    io.to(entry.roomId).emit('vote:ended', { noteId: entry.pointId, ...tally, description: entry.description });
  }

  // Stop pressed by the manager. Normal case: the vote is active here. Recovery case:
  // the process restarted mid-vote (timer lost) — close it anyway with the tally from
  // the DB, once, and only for a VOTE point of this meeting.
  async function stopVote(roomId, pointId) {
    const key = voteKey(roomId, pointId);
    if (activeVotes.has(key)) return endVote(key);
    if (isClosed(roomId, pointId) || stopsInFlight.has(key)) return;
    const meetingId = meetingIdFromRoom(roomId);
    if (!meetingId) return;
    stopsInFlight.add(key);
    try {
      const point = await loadPoint(meetingId, pointId);
      if (!point || activeVotes.has(key) || isClosed(roomId, pointId)) return;
      markClosed(roomId, pointId);
      const tally = await tallyVotes(pointId);
      io.to(roomId).emit('vote:ended', { noteId: pointId, ...tally, description: point.point });
    } finally {
      stopsInFlight.delete(key);
    }
  }

  async function withVoteLock(key, fn) {
    const prev = voteLocks.get(key) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    voteLocks.set(key, run);
    try {
      return await run;
    } finally {
      if (voteLocks.get(key) === run) voteLocks.delete(key);
    }
  }

  const PORT = process.env.PORT || 3002;
  // Never use HOSTNAME here: Docker sets it to the container id.
  const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
  // Exit (so Docker restarts us) instead of idling if the port can't be bound.
  const onListenError = (err) => {
    log.error(`> Failed to listen on ${BIND_HOST}:${PORT}:`, err);
    process.exit(1);
  };
  httpServer.once('error', onListenError);
  httpServer.listen(PORT, BIND_HOST, () => {
    httpServer.off('error', onListenError);
    log.info(`> Ready on http://${BIND_HOST}:${PORT}`);
    log.info(`> CORS allow-list: ${[...allowedOrigins].join(', ') || '(none)'}`);
  });
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`> ${signal} received, shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    console.error('> Graceful shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  let exitCode = 0;
  try {
    // Stop accepting new HTTP connections and drop idle keep-alive sockets.
    if (httpServer?.listening) {
      await new Promise((resolve) => {
        httpServer.close((err) => {
          if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') console.error('httpServer.close:', err);
          resolve();
        });
        httpServer.closeIdleConnections?.();
        // Disconnect Socket.IO clients (io.close also tries to close httpServer; ignore that).
        if (io) io.close();
      });
    } else if (io) {
      io.close();
    }
  } catch (err) {
    console.error('Error closing servers:', err);
    exitCode = 1;
  }

  try {
    await prisma.$disconnect();
  } catch (err) {
    console.error('prisma.$disconnect:', err);
    exitCode = 1;
  }

  try {
    await pool.end();
  } catch (err) {
    // pool may already be ended by the adapter
    if (!/more than once/i.test(String(err?.message))) {
      console.error('pool.end:', err);
      exitCode = 1;
    }
  }

  clearTimeout(forceExit);
  console.log('> Shutdown complete');
  process.exit(exitCode);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
