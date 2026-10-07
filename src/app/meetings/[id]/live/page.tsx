'use client';

import { useEffect, useState, useRef, useCallback, memo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import {
  LiveKitRoom,
  VideoConference,
  useRoomContext,
} from '@livekit/components-react';
import { ConnectionState, DisconnectReason, ParticipantEvent, RoomEvent, VideoPresets, type RoomOptions } from 'livekit-client';
import '@livekit/components-styles';
import './live-view.css';
import { useAuth } from '@/components/context/AuthContext';
import { Meeting, ApiResponse } from '@/lib/types';
import { VoteModal, useSecondsLeft } from '@/components/VoteModal';
import {
  Users,
  ListTodo,
  Hand,
  Vote as VoteIcon,
  Shield,
  MicOff,
  VideoOff,
  LogOut,
  Play,
  CalendarDays,
  FileText,
  Download,
  Check,
  X,
  Bell,
  BarChart3,
  Clock,
  ExternalLink,
  Plus,
  ArrowLeft,
  Upload,
  Loader2
} from 'lucide-react';
import { Modal } from '@/components/ui/modals';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typographys';
import { Badge } from '@/components/ui/badges';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { isSafeDocumentUrl } from '@/lib/safe-url';
import { cn } from '@/lib/utils';

type VoteResults = { oui: number; non: number; neutre: number };
type ActiveVote = { noteId: number; description: string; endsAt: number };

// Module-level so its identity never changes: LiveKitRoom recreates the Room when
// the serialized options change.
const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true, // subscribe at the rendered size; hidden/offscreen tiles are paused, not decoded
  dynacast: true,       // publishers stop encoding simulcast layers nobody watches
  videoCaptureDefaults: { resolution: VideoPresets.h540.resolution },
  publishDefaults: {
    simulcast: true,
    videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
    videoEncoding: VideoPresets.h540.encoding,
    dtx: true,
    red: true,
  },
  disconnectOnPageLeave: true,
};

const VOTE_TO_ENUM = { Oui: 'OUI', Non: 'NON', Neutre: 'NEUTRE' } as const;

function toVoteResults(value: any): VoteResults | null {
  if (!value || typeof value !== 'object') return null;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
  return { oui: n(value.oui), non: n(value.non), neutre: n(value.neutre) };
}

export default function LiveMeetingPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'agenda' | 'participants' | 'documents'>('agenda');
  const [isJoined, setIsJoined] = useState(false);
  const [joinRequests, setJoinRequests] = useState<{ participantId: number; name: string; socketId: string }[]>([]);
  // Running vote (server truth); endsAt is local time derived from the server's remaining seconds.
  const [activeVote, setActiveVote] = useState<ActiveVote | null>(null);
  // Participant: the vote they already answered (hides the modal, also after a resume).
  const [votedNoteId, setVotedNoteId] = useState<number | null>(null);
  const [finishedVotes, setFinishedVotes] = useState<Record<number, { oui: number; non: number; neutre: number }>>({});
  const [showResultsOverlay, setShowResultsOverlay] = useState<{ results: any, description: string } | null>(null);
  const [raisedHands, setRaisedHands] = useState<{ participantId: number; name: string; status: 'PENDING' | 'ACCEPTED' }[]>([]);
  const [meetingStatus, setMeetingStatus] = useState<string>('SCHEDULED');
  const [isStarting, setIsStarting] = useState(false);
  const [isEndConfirmModalOpen, setIsEndConfirmModalOpen] = useState(false);
  const [isEndingMeeting, setIsEndingMeeting] = useState(false);
  const [isMeetingEndedModalOpen, setIsMeetingEndedModalOpen] = useState(false);
  const [socketState, setSocketState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const t = useTranslations('LiveMeeting');
  const tc = useTranslations('Common');
  const tv = useTranslations('VoteModal');
  const tconn = useTranslations('LiveMeeting.connection');

  const [voteResults, setVoteResults] = useState({ oui: 0, non: 0, neutre: 0 });

  // Add Document Modal State
  const [isAddDocModalOpen, setIsAddDocModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocFile, setNewDocFile] = useState<File | null>(null);

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  // Stable primitives for effects: the auth context may hand out a new user object
  // for the same person, which must not re-run the whole init (token, socket, fetch).
  const userId = user?.id ?? null;
  const userRole = user?.role ?? null;
  const isAdminOrDev = userRole === 'ADMIN' || userRole === 'DEVELOPER';

  // Refs read inside socket handlers / callbacks (state would be stale there).
  const socketRef = useRef<Socket | null>(null);
  const activeVoteRef = useRef<ActiveVote | null>(null);
  const stopRequestedRef = useRef<number | null>(null); // manager pressed Stop for this point
  const participantIdRef = useRef<number | null>(null);
  const identityRef = useRef('');
  const meetingStatusRef = useRef<string>('SCHEDULED');
  const selfAdmittedRef = useRef(false);          // participant: accepted or meeting started
  const admittedIdsRef = useRef<Set<number>>(new Set()); // admin: participants already let in
  const joinRequestsRef = useRef(joinRequests);
  const userRef = useRef(user);
  const tRef = useRef(t);
  const tcRef = useRef(tc);
  const tconnRef = useRef(tconn);
  const routerRef = useRef(router);

  useEffect(() => {
    userRef.current = user;
    tRef.current = t;
    tcRef.current = tc;
    tconnRef.current = tconn;
    routerRef.current = router;
  });

  useEffect(() => {
    meetingStatusRef.current = meetingStatus;
  }, [meetingStatus]);

  useEffect(() => {
    joinRequestsRef.current = joinRequests;
  }, [joinRequests]);

  // Results overlay closes after 5 s (timer cleared if a new one replaces it or on unmount).
  useEffect(() => {
    if (!showResultsOverlay) return;
    const timer = setTimeout(() => setShowResultsOverlay(null), 5000);
    return () => clearTimeout(timer);
  }, [showResultsOverlay]);

  const liveUrl = useCallback(
    () => `/api/meetings/${id}/live${token ? `?token=${token}&email=${encodeURIComponent(email || '')}` : ''}`,
    [id, token, email]
  );

  // Invitee credentials as headers (read by readInviteeCredentials on the server).
  const inviteeHeaders = useCallback((): Record<string, string> => (
    token && email ? { 'x-participant-token': token, 'x-participant-email': email } : {}
  ), [token, email]);

  // Fresh LiveKit token (initial join and every video rejoin, so a rejoin never uses an expired one).
  // Room, identity and display name are derived by the server from the session / invitee token.
  const requestLkToken = useCallback(async (): Promise<string | null> => {
    const res = await fetch(`/api/livekit?meetingId=${encodeURIComponent(String(id))}`, { headers: inviteeHeaders() });
    const data = await res.json().catch(() => ({}));
    return data?.data?.token ?? data?.token ?? null;
  }, [id, inviteeHeaders]);

  const leaveRoom = useCallback(() => {
    routerRef.current.push(userRef.current ? '/meetings' : '/');
  }, []);

  const applyActiveVote = useCallback((vote: ActiveVote | null) => {
    activeVoteRef.current = vote;
    setActiveVote(vote);
  }, []);

  useEffect(() => {
    // Wait for /api/auth/me: before it answers user is null and an admin would be
    // treated as an invitee (401 -> redirect) and the init would run twice.
    if (authLoading) return;
    let isMounted = true;
    const roomId = `meeting-${id}`;
    const isStaff = userRole === 'ADMIN' || userRole === 'DEVELOPER';
    const tt = (key: string, values?: any) => tRef.current(key as any, values);

    // Meeting data -> state. Used at init and to re-sync after a reconnect.
    const applyMeeting = (data: any) => {
      setMeeting(data);
      const status = data.status || 'SCHEDULED';
      setMeetingStatus(status);
      meetingStatusRef.current = status;
      if (status === 'STARTED') selfAdmittedRef.current = true;
      if (status === 'STARTED' || isStaff) setIsJoined(true);

      if (data.meetings_points) {
        const finished: Record<number, VoteResults> = {};
        data.meetings_points.forEach((p: any) => {
          if (p.id === activeVoteRef.current?.noteId) return; // still running
          if (p.meetings_votes && p.meetings_votes.length > 0) {
            const counts = { oui: 0, non: 0, neutre: 0 };
            p.meetings_votes.forEach((v: any) => {
              if (v.vote === 'OUI') counts.oui++;
              else if (v.vote === 'NON') counts.non++;
              else if (v.vote === 'NEUTRE') counts.neutre++;
            });
            finished[p.id] = counts;
          } else if (p.is_voted) {
            finished[p.id] = { oui: p.vote_oui || 0, non: p.vote_non || 0, neutre: p.vote_neutre || 0 };
          }
        });
        setFinishedVotes(finished);
      }

      if (data.meetings_turn_requests) {
        // The API returns PENDING requests only: keep hands already given the floor.
        setRaisedHands(prev => {
          const pending = data.meetings_turn_requests.map((r: any) => {
            const participant = data.meetings_participants?.find((p: any) => p.id === r.meetings_participant_id);
            const known = prev.find(h => h.participantId === r.meetings_participant_id);
            return {
              participantId: r.meetings_participant_id,
              name: known?.name || participant?.email || 'Participant',
              status: known?.status || 'PENDING',
            };
          });
          const accepted = prev.filter(h => h.status === 'ACCEPTED' && !pending.some((p: any) => p.participantId === h.participantId));
          return [...pending, ...accepted];
        });
      }
    };

    const showEnded = () => {
      meetingStatusRef.current = 'FINISHED';
      setMeetingStatus('FINISHED');
      setIsMeetingEndedModalOpen(true);
    };

    // After a reconnect: refresh meeting data (status, documents, results, hands).
    const resync = async () => {
      try {
        const res = await fetch(liveUrl());
        const result = await res.json();
        if (!isMounted) return;
        if (result.status) applyMeeting(result.data);
        else if (res.status === 403 && !(result as any).requireAcceptance) showEnded(); // invitee: meeting ended
      } catch {
        // offline again: the next reconnect retries
      }
    };

    let s: Socket | null = null;
    let clearRetry = () => {};
    const onOnline = () => {
      if (s && !s.connected) s.connect();
    };

    const init = async () => {
      try {
        const res = await fetch(liveUrl());
        const result: ApiResponse<any> = await res.json();

        if (!isMounted) return;

        if (!result.status) {
          if ((result as any).requireAcceptance) {
            toast.error(tt('toasts.requireAcceptance'));
            routerRef.current.push(`/meetings/${id}/join?token=${token}&email=${email}`);
          } else {
            toast.error(result.message || tt('toasts.unauthorized'));
            routerRef.current.push(userId ? '/meetings' : '/');
          }
          return;
        }

        const currentPartId: number | null = (result as any).participantId ?? null;
        participantIdRef.current = currentPartId;
        if (currentPartId) setParticipantId(currentPartId);
        applyMeeting(result.data);

        const u = userRef.current;
        identityRef.current = u ? (u.fullname || u.username || 'Admin') : (email || '');

        const lk = await requestLkToken().catch(() => null);
        if (!isMounted) return;
        if (lk) {
          setLkToken(lk);
        } else {
          setLkToken('not-configured');
          toast(tt('toasts.livekitUnavailable'), { duration: 6000 });
        }

        // Reconnects forever with backoff; every (re)connect re-joins the room and
        // the server answers with room:state.
        // Socket auth: the invite link (meetingId + token + email) wins over the session
        // cookie, like the REST API. Re-sent on every reconnect (handshake).
        s = io(window.location.origin, {
          forceNew: true,
          withCredentials: true,
          auth: token && email ? { meetingId: Number(id), token, email } : {},
          timeout: 10000,
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 10000,
          randomizationFactor: 0.5,
        });
        const sock = s;
        socketRef.current = sock;
        setSocket(sock);
        let connectedOnce = false;
        let authRetries = 0;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        const retryLater = (ms: number) => {
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            retryTimer = null;
            if (isMounted && !sock.connected) sock.connect();
          }, ms);
        };
        clearRetry = () => { if (retryTimer) clearTimeout(retryTimer); };

        sock.on('connect', () => {
          authRetries = 0;
          setSocketState('connected');
          sock.emit('join-room', roomId);
          // Lobby only while the meeting has not started and we were not let in yet.
          // (A STARTED meeting is entered directly, so asking again would show the
          // admin Accept/Decline for someone who is already inside.)
          if (!isStaff && currentPartId && meetingStatusRef.current !== 'STARTED' && !selfAdmittedRef.current) {
            sock.emit('join:request', { roomId, participantId: currentPartId, name: identityRef.current });
          }
          if (connectedOnce) resync();
          connectedOnce = true;
        });

        sock.on('disconnect', (reason) => {
          setSocketState('reconnecting');
          // The server closed us on purpose: the client does not retry by itself.
          if (reason === 'io server disconnect') sock.connect();
        });
        sock.on('connect_error', (err: Error) => {
          setSocketState('reconnecting');
          // Transport errors: Socket.IO keeps retrying by itself.
          if (sock.active) return;
          // Refused by the server's auth middleware: Socket.IO does not retry, we do.
          if (err?.message !== 'unauthorized') {
            retryLater(5000); // 'unavailable' (server/DB busy): try again, forever
            return;
          }
          // 'unauthorized': ask the API whether our access is really gone (session expired,
          // invitation withdrawn) before leaving; a passing glitch just retries a few times.
          fetch(liveUrl())
            .then(r => r.json().catch(() => ({})))
            .then((result: any) => {
              if (!isMounted) return;
              if (result?.status && authRetries < 3) {
                authRetries += 1;
                retryLater(2000 * authRetries);
              } else {
                toast.error(tt('toasts.unauthorized'));
                routerRef.current.push(userId ? '/meetings' : '/');
              }
            })
            .catch(() => retryLater(5000)); // offline: keep trying
        });
        sock.on('error:forbidden', ({ event }: { event?: string } = {}) => {
          console.warn('Socket action refused by the server:', event);
          if (event === 'join-room') toast.error(tt('toasts.unauthorized'));
        });
        window.addEventListener('online', onOnline);

        // Full room state for this socket (initial join and every reconnect).
        sock.on('room:state', (state: any) => {
          if (!state || state.roomId !== roomId) return;
          if (state.meetingStatus === 'FINISHED') {
            showEnded();
            return;
          }
          if (state.meetingStatus === 'STARTED' && meetingStatusRef.current !== 'STARTED') {
            meetingStatusRef.current = 'STARTED';
            selfAdmittedRef.current = true;
            setMeetingStatus('STARTED');
            setIsJoined(true);
            setJoinRequests([]);
          }

          const av = state.activeVote;
          if (av && Number.isInteger(Number(av.noteId))) {
            const noteId = Number(av.noteId);
            if (activeVoteRef.current?.noteId !== noteId) setVotedNoteId(null);
            applyActiveVote({ noteId, description: av.description || '', endsAt: Date.now() + Math.max(0, Number(av.remaining) || 0) * 1000 });
            const tally = toVoteResults(av.results);
            if (tally) setVoteResults(tally);
            setFinishedVotes(prev => {
              if (!(noteId in prev)) return prev;
              const next = { ...prev };
              delete next[noteId];
              return next;
            });
          } else if (activeVoteRef.current) {
            const local = activeVoteRef.current;
            if (isStaff) {
              // The server lost the vote (restart): re-arm it for the time left, unless
              // Stop was pressed meanwhile (that buffered stop closes it with the DB tally).
              if (stopRequestedRef.current !== local.noteId) {
                const remaining = Math.ceil((local.endsAt - Date.now()) / 1000);
                sock.emit('vote:resume', { roomId, noteId: local.noteId, remaining });
              }
            } else {
              applyActiveVote(null); // reopened by vote:started if the manager resumes it
            }
          }

          if (isStaff && Array.isArray(state.pendingJoins) && meetingStatusRef.current !== 'STARTED') {
            setJoinRequests(state.pendingJoins.filter((r: any) => !admittedIdsRef.current.has(r.participantId)));
          }
        });

        sock.on('vote:started', ({ noteId, duration, remaining, description, resumed }) => {
          const secs = Number(remaining ?? duration) || 0;
          if (!resumed || activeVoteRef.current?.noteId !== noteId) {
            setVoteResults({ oui: 0, non: 0, neutre: 0 });
          }
          if (!resumed) setVotedNoteId(null);
          stopRequestedRef.current = null;
          applyActiveVote({ noteId, description: description || 'Vote sur le point en cours', endsAt: Date.now() + secs * 1000 });
        });

        // The server sends the full tally from the DB (never a delta): just display it.
        sock.on('vote:update', ({ noteId, results }) => {
          const tally = toVoteResults(results);
          if (!tally) return;
          if (activeVoteRef.current?.noteId === noteId) setVoteResults(tally);
          // A point that already has final results (e.g. vote via REST) stays in sync.
          setFinishedVotes(prev => (noteId in prev ? { ...prev, [noteId]: tally } : prev));
        });

        sock.on('vote:ended', ({ results, noteId, description }) => {
          const wasActive = activeVoteRef.current?.noteId === noteId;
          if (wasActive) applyActiveVote(null);
          if (stopRequestedRef.current === noteId) stopRequestedRef.current = null;
          const safeResults = toVoteResults(results) || { oui: 0, non: 0, neutre: 0 };
          if (noteId) {
            setFinishedVotes(prev => ({ ...prev, [noteId]: safeResults }));
          }
          setVoteResults(safeResults);
          setShowResultsOverlay({ results: safeResults, description });
          if (isStaff) toast.success(tt('toasts.voteEnded'));
        });

        sock.on('hand:raised', ({ participantId, name }) => {
          setRaisedHands(prev => {
            if (prev.find(h => h.participantId === participantId)) return prev;
            return [...prev, { participantId, name, status: 'PENDING' }];
          });
          if (isStaff) toast(tt('toasts.handRaised', { name }), { icon: '✋' });
        });

        sock.on('hand:accepted', ({ participantId }) => {
          setRaisedHands(prev => prev.map(h => h.participantId === participantId ? { ...h, status: 'ACCEPTED' } : h));
          if (currentPartId === participantId) toast.success(tt('toasts.wordGranted'));
        });

        sock.on('hand:refused', ({ participantId: pId }) => {
          setRaisedHands(prev => prev.filter(h => h.participantId !== pId));
          if (currentPartId === pId) toast.error(tt('toasts.wordRefused'));
        });

        sock.on('hand:muted', ({ participantId: pId }) => {
          setRaisedHands(prev => prev.filter(h => h.participantId !== pId));
          if (currentPartId === pId) toast.info(tt('toasts.wordEnded'));
        });

        sock.on('join:requested', ({ participantId, name, socketId }) => {
          if (!isStaff) return;
          if (meetingStatusRef.current === 'STARTED' || admittedIdsRef.current.has(participantId)) return;
          const isNew = !joinRequestsRef.current.some(r => r.participantId === participantId);
          setJoinRequests(prev => {
            if (prev.some(r => r.participantId === participantId)) {
              // Same participant again (reload / new tab): keep one row, target the latest socket.
              return prev.map(r => r.participantId === participantId ? { ...r, name, socketId } : r);
            }
            return [...prev, { participantId, name, socketId }];
          });
          if (isNew) toast.info(tt('toasts.joinRequested', { name }));
        });

        sock.on('join:cancelled', ({ participantId }) => {
          setJoinRequests(prev => prev.filter(req => req.participantId !== participantId));
        });

        sock.on('join:accepted', () => {
          selfAdmittedRef.current = true;
          setIsJoined(true);
          toast.success(tt('toasts.joinAccepted'));
        });

        sock.on('join:rejected', () => {
          toast.error(tt('toasts.joinRejected'));
          routerRef.current.push('/');
        });

        sock.on('meeting:started', () => {
          const already = meetingStatusRef.current === 'STARTED';
          meetingStatusRef.current = 'STARTED';
          selfAdmittedRef.current = true;
          setJoinRequests([]); // everyone waiting is in now
          setMeetingStatus('STARTED');
          setIsJoined(true);
          if (!already) toast.info(tt('toasts.meetingStarted'));
        });

        sock.on('join:approved', ({ participantId }) => {
          admittedIdsRef.current.add(participantId);
          setJoinRequests(prev => prev.filter(req => req.participantId !== participantId));
        });

        sock.on('meeting:ended', showEnded);
      } catch (error) {
        console.error('Init error:', error);
        if (isMounted) toast.error(tcRef.current('error'));
      }
    };

    init();

    return () => {
      isMounted = false;
      clearRetry();
      window.removeEventListener('online', onOnline);
      if (s) {
        s.removeAllListeners();
        s.disconnect();
      }
      if (socketRef.current === s) socketRef.current = null;
    };
  }, [id, authLoading, userId, userRole, email, token, liveUrl, requestLkToken, applyActiveVote]);

  const startMeeting = async () => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const res = await fetch(`/api/meetings/${id}/live`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', status: 'STARTED' }),
      });
      const result = await res.json();
      if (result.status) {
        setMeetingStatus('STARTED');
        meetingStatusRef.current = 'STARTED';
        setJoinRequests([]);
        socket?.emit('meeting:start', { roomId: `meeting-${id}` });
        toast.success(t('toasts.meetingStartedAdmin'));
        if (result.expiredToken) {
          const msg = result.pushMessage ? `Notification Push: ${result.pushMessage}` : "Notification Push: Jeton expiré.";
          toast.warning(msg, { duration: 10000 });
        }
      } else {
        toast.error(result.message || tc('error'));
      }
    } catch {
      toast.error(tc('error'));
    } finally {
      setIsStarting(false);
    }
  };

  // Stable (refs only) so the vote modal never restarts its effects on page re-renders.
  const handleVote = useCallback((vote: 'Oui' | 'Non' | 'Neutre') => {
    const s = socketRef.current;
    const current = activeVoteRef.current;
    const pid = participantIdRef.current;
    if (!s || !current || !pid) {
      if (!pid) toast.error(tRef.current('toasts.notRegistered'));
      return;
    }
    setVotedNoteId(current.noteId);
    // Server stores the meetings_votes_response enum: OUI / NON / NEUTRE.
    // The voter is the authenticated socket (invite link or session), never a payload id.
    s.timeout(8000).emit('vote:submit', {
      roomId: `meeting-${id}`,
      noteId: current.noteId,
      vote: VOTE_TO_ENUM[vote]
    }, (err: Error | null, res?: { ok: boolean; error?: string }) => {
      if (!err && res?.ok) {
        toast.success(tRef.current('toasts.voteRecorded'));
      } else if (res?.error !== 'vote_closed') {
        // Not saved (offline, server restarting): show the modal again while the vote runs.
        toast.error(tconnRef.current('voteNotSaved'));
        setVotedNoteId(prev => (prev === current.noteId ? null : prev));
      }
    });
  }, [id]);

  const stopVote = (noteId: number) => {
    stopRequestedRef.current = noteId;
    // Buffered by Socket.IO while offline and sent right after the reconnect.
    socket?.emit('vote:stop', { roomId: `meeting-${id}`, noteId });
  };

  const raiseHand = () => {
    if (!socket || !meeting || !participantId) {
      if (!participantId) toast.error(t('toasts.notAuthorizedWord'));
      return;
    }
    const name = user?.fullname || email || tc('participant');
    socket.emit('hand:raise', {
      roomId: `meeting-${id}`,
      participantId: participantId,
      name
    });
    toast.success(t('toasts.handRaisedSuccess'));
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocFile) {
      toast.error(tc('selectRequired'));
      return;
    }

    setIsUploading(true);
    try {
      // 1. Upload the file
      const formData = new FormData();
      formData.append('file', newDocFile);
      formData.append('meetingId', String(id));

      const uploadRes = await fetch(`/api/upload?meetingId=${encodeURIComponent(String(id))}`, {
        method: 'POST',
        headers: inviteeHeaders(),
        body: formData,
      });
      const uploadResult = await uploadRes.json();

      if (!uploadResult.status) {
        throw new Error(uploadResult.message || 'Upload failed');
      }

      // 2. Link the document to the meeting
      const linkRes = await fetch(`/api/meetings/${id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_title: newDocTitle || newDocFile.name,
          file_path: uploadResult.data.file_path,
        }),
      });
      const linkResult = await linkRes.json();

      if (linkResult.status) {
        toast.success(t('toasts.docAdded'));
        setIsAddDocModalOpen(false);
        setNewDocTitle('');
        setNewDocFile(null);

        // Refresh meeting data to show new document
        const res = await fetch(`/api/meetings/${id}/live${token ? `?token=${token}&email=${encodeURIComponent(email || '')}` : ''}`);
        const result = await res.json();
        if (result.status) setMeeting(result.data);
      } else {
        throw new Error(linkResult.message || 'Linking failed');
      }
    } catch (error: any) {
      console.error('Error adding document:', error);
      toast.error(error.message || tc('error'));
    } finally {
      setIsUploading(false);
    }
  };

  if (!meeting) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0B1120] gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent shadow-[0_0_20px_rgba(59,130,246,0.3)]"></div>
        <Typography variant="label" className="text-slate-400">{t('loading.preparing')}</Typography>
      </div>
    );
  }

  if (!isAdminOrDev && meetingStatus === 'SCHEDULED') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1120] p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full p-10 bg-slate-900/50 backdrop-blur-2xl rounded-2xl border border-white/5 text-center relative overflow-hidden shadow-2xl"
        >
          <div className="absolute inset-0 opacity-[0.03] bg-radial-white-medium" />
          <div className="w-20 h-20 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-pulse shadow-[0_0_50px_rgba(59,130,246,0.2)] border border-blue-500/20">
            <CalendarDays size={40} />
          </div>
          <Typography variant="h2" className="text-white mb-3 text-xl font-semibold">{t('status.soon.title')}</Typography>
          <Typography variant="p" className="text-slate-400 mb-8 leading-relaxed text-sm">
            {t('status.soon.message')}
          </Typography>
          <div className="flex items-center justify-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]"></div>
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]"></div>
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce"></div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1120] p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full p-10 bg-slate-900/50 backdrop-blur-2xl rounded-2xl border border-white/5 text-center shadow-2xl"
        >
          <div className="w-20 h-20 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_rgba(59,130,246,0.2)] border border-blue-500/20">
            <Shield size={40} />
          </div>
          {socketState === 'reconnecting' && <ReconnectingBadge label={tconn('reconnecting')} className="mx-auto mb-4 w-fit" />}
          <Typography variant="h2" className="text-white mb-3 text-xl font-semibold">{t('status.waiting.title')}</Typography>
          <Typography variant="p" className="text-slate-400 mb-8 text-sm">{t('status.waiting.message')}</Typography>
          <div className="flex items-center justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]"></div>
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]"></div>
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce"></div>
          </div>
          <Button variant="ghost" className="mt-10 text-slate-500 hover:text-white uppercase font-semibold text-xs" onClick={() => router.push('/')}>
            {t('status.waiting.cancel')}
          </Button>
        </motion.div>
      </div>
    );
  }

  const myHandAccepted = raisedHands.some(h => h.participantId === participantId && h.status === 'ACCEPTED');

  return (
    <div className="flex h-screen flex-col bg-[#020617] overflow-hidden font-sans text-slate-200">
      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b border-white/5 bg-[#0B1120]/80 backdrop-blur-xl px-6 z-30 shadow-2xl">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/meetings')} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white transition-all border border-white/5">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#002B5B] shadow-[0_0_20px_rgba(0,43,91,0.3)] text-white border border-white/10">
              <Shield size={18} />
            </div>
            <div>
              <Typography variant="h3" className="text-white leading-none text-base font-semibold">{meeting.subject}</Typography>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="outline" className="text-[9px] py-0 px-2 border-white/10 text-slate-500 font-semibold uppercase">{meeting.type}</Badge>
                <span className="text-[9px] text-slate-600 font-semibold uppercase">•</span>
                <div className="flex items-center gap-1.5 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                  <div className="h-1 w-1 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.6)]"></div>
                  <span className="text-[9px] font-semibold text-green-400 uppercase">{t('header.statusLive')}</span>
                </div>
                {socketState === 'reconnecting' && <ReconnectingBadge label={tconn('reconnecting')} />}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdminOrDev && meetingStatus === 'STARTED' && (
            <Button
              variant="destructive"
              className="h-10 rounded-xl px-6 text-[10px] font-semibold uppercase bg-red-600/10 text-red-500 border border-red-500/20 hover:bg-red-600 hover:text-white transition-all shadow-xl shadow-red-900/10"
              onClick={() => setIsEndConfirmModalOpen(true)}
            >
              {t('header.endButton')}
            </Button>
          )}

          <Button variant="ghost" size="icon" className="w-10 h-10 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white" onClick={() => router.push('/meetings')}>
            <LogOut size={18} />
          </Button>
        </div>
      </header>

      {/* Start Meeting Banner for Admin */}
      {isAdminOrDev && meetingStatus === 'SCHEDULED' && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="bg-blue-600/20 border-b border-blue-500/20 px-6 py-3 flex items-center justify-between text-white shadow-inner z-20 backdrop-blur-xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/30 flex items-center justify-center shadow-lg border border-blue-500/20">
              <Play size={16} className="text-blue-400 ml-0.5" fill="currentColor" />
            </div>
            <div>
              <Typography variant="large" className="text-white uppercase text-[10px] font-semibold">{t('banner.ready')}</Typography>
              <Typography variant="small" className="text-blue-200/70 mt-0.5 text-[10px]">{t('banner.desc')}</Typography>
            </div>
          </div>
          <Button
            disabled={isStarting}
            onClick={startMeeting}
            className="h-10 bg-blue-600 text-white hover:bg-blue-500 font-semibold px-6 rounded-xl shadow-[0_10px_20px_rgba(37,99,235,0.2)] transition-all hover:scale-105 active:scale-95 border border-blue-500/50 text-[10px] uppercase"
          >
            {isStarting ? t('banner.starting') : t('banner.start')}
          </Button>
        </motion.div>
      )}

      {/* Main Content */}
      <main className="flex flex-1 flex-col lg:flex-row overflow-hidden relative w-full">
        {/* Video Area */}
        <div className="flex-1 bg-[#020617] relative flex flex-col p-4 md:p-6">
          <div className="flex-1 rounded-2xl overflow-hidden border border-white/10 bg-[#080d1a] relative shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)]">
            {lkToken && lkToken !== 'not-configured' && isJoined && meetingStatus === 'STARTED' ? (
              <LiveVideo
                token={lkToken}
                isAdmin={isAdminOrDev}
                handAccepted={myHandAccepted}
                onLeave={leaveRoom}
                onRequestToken={requestLkToken}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-white/40 gap-5">
                <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner mb-4">
                  <Shield size={40} className="text-white/20" />
                </div>
                <div className="text-center space-y-3 max-w-md px-6">
                  <Typography variant="h3" className="text-white uppercase font-semibold text-sm">{t('video.livekitConnectivity')}</Typography>
                  <Typography variant="p" className="text-slate-500 font-medium leading-relaxed">
                    {meetingStatus === 'SCHEDULED'
                      ? (isAdminOrDev ? t('video.waitingAdmin') : t('video.waiting'))
                      : t('video.preparing')}
                  </Typography>
                  {isAdminOrDev && meetingStatus === 'SCHEDULED' && (
                    <div className="pt-4">
                      <Button
                        onClick={startMeeting}
                        disabled={isStarting}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 h-11 rounded-xl shadow-2xl shadow-blue-900/50 uppercase text-xs"
                      >
                        {isStarting ? t('banner.starting') : t('banner.start')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-[400px] h-[45vh] lg:h-full border-t lg:border-t-0 lg:border-l border-white/5 bg-[#0B1120] flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.3)] z-20 relative">

          {/* Tabs */}
          <div className="flex p-3 gap-2 border-b border-white/5 bg-white/[0.02]">
            <button
              onClick={() => setActiveTab('agenda')}
              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 text-[10px] font-semibold uppercase transition-all rounded-xl border ${activeTab === 'agenda' ? 'bg-[#002B5B] text-white border-white/10 shadow-xl shadow-blue-900/20' : 'text-slate-500 border-transparent hover:bg-white/5 hover:text-slate-300'}`}
            >
              <ListTodo size={16} />
              {t('tabs.agenda')}
            </button>
            <button
              onClick={() => setActiveTab('participants')}
              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 text-[10px] font-semibold uppercase transition-all rounded-xl border relative ${activeTab === 'participants' ? 'bg-[#002B5B] text-white border-white/10 shadow-xl shadow-blue-900/20' : 'text-slate-500 border-transparent hover:bg-white/5 hover:text-slate-300'}`}
            >
              <div className="relative">
                <Users size={16} />
                {(joinRequests.length + raisedHands.length) > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-semibold text-white shadow-[0_0_10px_rgba(239,68,68,0.4)] animate-pulse border-2 border-[#0B1120]">
                    {joinRequests.length + raisedHands.length}
                  </span>
                )}
              </div>
              {t('tabs.participants')}
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 text-[10px] font-semibold uppercase transition-all rounded-xl border ${activeTab === 'documents' ? 'bg-[#002B5B] text-white border-white/10 shadow-xl shadow-blue-900/20' : 'text-slate-500 border-transparent hover:bg-white/5 hover:text-slate-300'}`}
            >
              <FileText size={16} />
              {t('tabs.documents')}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            <AnimatePresence mode="wait">
              {/* AGENDA TAB */}
              {activeTab === 'agenda' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

                  {/* Creator Live Vote Dashboard */}
                  {isAdminOrDev && activeVote && (
                    <div className="bg-linear-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse"></div>
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                            <BarChart3 size={16} />
                          </div>
                          <Typography variant="label" className="text-white uppercase text-[10px] font-semibold">{t('agenda.voteInProgress')}</Typography>
                        </div>
                        <Badge className="bg-slate-900/80 text-blue-400 border-white/5 h-8 px-3 flex items-center gap-2 text-sm font-semibold">
                          <Clock size={14} />
                          <VoteCountdown endsAt={activeVote.endsAt} />
                        </Badge>
                      </div>
                      <Typography variant="p" className="text-slate-300 mb-5 leading-relaxed italic text-xs">{activeVote.description}</Typography>

                      <div className="space-y-3 mb-6">
                        {[
                          { label: t('agenda.voteTypes.for'), value: voteResults.oui, color: 'bg-green-500', text: 'text-green-400' },
                          { label: t('agenda.voteTypes.against'), value: voteResults.non, color: 'bg-red-500', text: 'text-red-400' },
                          { label: t('agenda.voteTypes.neutral'), value: voteResults.neutre, color: 'bg-slate-500', text: 'text-slate-400' },
                        ].map((v) => (
                          <div key={v.label} className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] font-semibold uppercase">
                              <span className={v.text}>{v.label}</span>
                              <span className="text-white">{v.value}</span>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(v.value / Math.max(1, (voteResults.oui + voteResults.non + voteResults.neutre))) * 100}%` }}
                                className={cn("h-full transition-all duration-1000", v.color)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <Button
                        variant="outline"
                        className="w-full h-11 border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded-xl font-semibold uppercase text-[10px]"
                        onClick={() => stopVote(activeVote.noteId)}
                      >
                        {t('agenda.stopVote')}
                      </Button>
                    </div>
                  )}

                  <div className="space-y-4">
                    {(meeting as any).meetings_points?.map((point: any, idx: number) => {
                      const result = finishedVotes[point.id] || (point.id ? finishedVotes[Number(point.id)] : null);
                      return (
                        <div key={point.id} className="p-5 rounded-2xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-all group">
                          <div className="flex items-start gap-4">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs font-semibold text-slate-400 border border-white/5 shadow-inner transition-colors group-hover:bg-[#002B5B] group-hover:text-white group-hover:border-white/10">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <div className="flex-1 min-w-0">
                              <Typography variant="large" className="text-white text-sm font-semibold">{point.point}</Typography>

                              {result ? (
                                <div className="mt-4 p-4 bg-slate-900/50 rounded-xl border border-emerald-500/20 shadow-2xl shadow-emerald-900/5 space-y-3">
                                  <div className="flex items-center justify-between text-[9px] font-semibold uppercase text-emerald-400 mb-1">
                                    <div className="flex items-center gap-2">
                                      <BarChart3 size={12} />
                                      <span>{t('overlays.voteResults.title')}</span>
                                    </div>
                                    <Badge className="bg-emerald-500 text-white border-none h-4 px-1.5 rounded-full text-[7px]">{t('status.finished')}</Badge>
                                  </div>
                                  <div className="flex gap-4 pt-2">
                                    <div className="flex-1">
                                      <div className="flex justify-between text-[9px] mb-1 font-bold">
                                        <span className="text-emerald-400/80">{t('agenda.voteTypes.for')}</span>
                                        <span className="text-white">{result.oui}</span>
                                      </div>
                                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ width: `${(result.oui / Math.max(1, result.oui + result.non + result.neutre)) * 100}%` }} />
                                      </div>
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex justify-between text-[9px] mb-1 font-bold">
                                        <span className="text-rose-400/80">{t('agenda.voteTypes.against')}</span>
                                        <span className="text-white">{result.non}</span>
                                      </div>
                                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]" style={{ width: `${(result.non / Math.max(1, result.oui + result.non + result.neutre)) * 100}%` }} />
                                      </div>
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex justify-between text-[9px] mb-1 font-bold">
                                        <span className="text-slate-400/80">{t('agenda.voteTypes.neutral')}</span>
                                        <span className="text-white">{result.neutre}</span>
                                      </div>
                                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-slate-400" style={{ width: `${(result.neutre / Math.max(1, result.oui + result.non + result.neutre)) * 100}%` }} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : point.type === 'VOTE' ? (
                                <div className="mt-5 flex items-center justify-between gap-4">
                                  <Badge variant="outline" className="h-6 border-blue-500/20 bg-blue-500/5 text-blue-400 font-semibold uppercase text-[8px] px-2 rounded-md flex items-center gap-1.5">
                                    <div className="w-1 h-1 rounded-full bg-blue-500"></div>
                                    {t('agenda.submittedToVote')}
                                  </Badge>

                                  {isAdminOrDev && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={!!activeVote}
                                      className="h-9 px-4 text-[9px] uppercase font-semibold border-blue-500/20 bg-blue-500/10 text-white hover:bg-blue-600 hover:text-white hover:border-blue-500 transition-all rounded-lg shadow-lg shadow-blue-900/10"
                                      onClick={() => {
                                        socket?.emit('vote:start', {
                                          roomId: `meeting-${id}`,
                                          noteId: point.id,
                                          description: point.point,
                                          duration: 60
                                        });
                                      }}
                                    >
                                      {t('agenda.launchVote')}
                                    </Button>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* PARTICIPANTS TAB */}
              {activeTab === 'participants' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">

                  {/* Join Requests */}
                  {isAdminOrDev && meetingStatus !== 'STARTED' && joinRequests.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-2">
                        <Typography variant="label" className="text-slate-500 uppercase text-[10px] font-semibold">{t('participants.requests')}</Typography>
                        <Badge className="bg-blue-600 text-white rounded-full h-5 min-w-[20px] border-none font-semibold text-[10px]">{joinRequests.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {joinRequests.map((req) => (
                          <div key={req.socketId} className="flex items-center justify-between p-4 bg-blue-600/10 border border-blue-500/20 rounded-xl shadow-lg shadow-blue-900/50">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white border border-white/10">
                                <Users size={16} />
                              </div>
                              <Typography variant="large" className="text-blue-100 text-sm font-semibold">{req.name}</Typography>
                            </div>
                            <div className="flex gap-2">
                              <Button size="icon" className="h-9 w-9 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow-lg shadow-emerald-900/20" onClick={() => socket?.emit('join:accept', { roomId: `meeting-${id}`, participantId: req.participantId, socketId: req.socketId })}>
                                <Check size={16} />
                              </Button>
                              <Button size="icon" variant="outline" className="h-9 w-9 border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded-lg" onClick={() => socket?.emit('join:reject', { roomId: `meeting-${id}`, participantId: req.participantId, socketId: req.socketId })}>
                                <X size={16} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hand Raises */}
                  {raisedHands.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-2">
                        <Typography variant="label" className="text-slate-500 uppercase text-[10px] font-semibold">{t('participants.handRaises')}</Typography>
                        <Badge className="bg-amber-500 text-white rounded-full h-5 min-w-[20px] border-none font-semibold text-[10px]">{raisedHands.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {raisedHands.map((hand) => (
                          <div key={hand.participantId} className={cn(
                            "flex items-center justify-between p-4 border rounded-xl relative overflow-hidden transition-all",
                            hand.status === 'ACCEPTED' ? 'bg-emerald-600/10 border-emerald-500/30 shadow-emerald-900/10' : 'bg-amber-600/10 border-amber-500/30 shadow-amber-900/10'
                          )}>
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${hand.status === 'ACCEPTED' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                            <div className="flex items-center gap-3 ml-1">
                              <div className={cn(
                                "h-9 w-9 rounded-lg flex items-center justify-center border",
                                hand.status === 'ACCEPTED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              )}>
                                {hand.status === 'ACCEPTED' ? <MicOff size={16} /> : <Hand size={16} />}
                              </div>
                              <Typography variant="large" className={cn("text-sm font-semibold", hand.status === 'ACCEPTED' ? 'text-emerald-100' : 'text-amber-100')}>{hand.name}</Typography>
                            </div>
                            {isAdminOrDev && (
                              <div className="flex gap-2">
                                {hand.status === 'PENDING' ? (
                                  <>
                                    <Button size="icon" className="h-9 w-9 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow-lg shadow-emerald-900/20" onClick={() => socket?.emit('hand:accept', { roomId: `meeting-${id}`, participantId: hand.participantId })}>
                                      <Check size={16} />
                                    </Button>
                                    <Button size="icon" variant="outline" className="h-9 w-9 border-white/10 text-slate-400 hover:bg-white/10 rounded-lg" onClick={() => socket?.emit('hand:refuse', { roomId: `meeting-${id}`, participantId: hand.participantId })}>
                                      <X size={16} />
                                    </Button>
                                  </>
                                ) : (
                                  <Button size="icon" className="h-9 w-9 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-lg shadow-red-900/20" onClick={() => socket?.emit('hand:mute', { roomId: `meeting-${id}`, participantId: hand.participantId })}>
                                    <MicOff size={16} />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <Typography variant="label" className="text-slate-500 uppercase text-[10px] font-semibold px-2">{t('participants.all')}</Typography>
                    <div className="space-y-2">
                      {(meeting as any).meetings_participants?.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between p-3.5 bg-white/[0.02] hover:bg-white/[0.05] rounded-xl transition-all border border-transparent hover:border-white/5 group">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-semibold text-slate-400 border border-white/5 shadow-inner uppercase group-hover:bg-[#002B5B] group-hover:text-white transition-all">
                              {p.email[0]}
                            </div>
                            <Typography variant="large" className="text-xs text-slate-400 group-hover:text-white transition-colors truncate max-w-[200px]">{p.email}</Typography>
                          </div>
                          <div className="flex gap-2 text-slate-500">
                            {isAdminOrDev && p.email === user?.email && (
                              <Badge variant="primary" className="bg-blue-600/10 text-blue-400 border-blue-500/20 text-[8px] font-semibold uppercase">Host</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!isAdminOrDev && (
                    <div className="mt-6 pt-6 border-t border-white/5">
                      <div className="p-6 bg-slate-900/50 rounded-2xl border border-white/5 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="relative flex flex-col items-center text-center">
                          <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                            <Hand size={24} />
                          </div>
                          <Typography variant="h4" className="text-white mb-1.5 text-base font-semibold">{t('actions.requestWord')}</Typography>
                          <Typography variant="small" className="text-slate-400 mb-5 text-[10px]">{t('permissions.muteNote')}</Typography>

                          {raisedHands.find(h => h.participantId === participantId)?.status === 'PENDING' ? (
                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-5 py-1.5 rounded-lg uppercase text-[9px] font-semibold">{t('actions.requestPending')}</Badge>
                          ) : raisedHands.find(h => h.participantId === participantId)?.status === 'ACCEPTED' ? (
                            <div className="flex flex-col items-center gap-2">
                              <Badge className="bg-emerald-500 text-white border-none px-5 py-1.5 rounded-lg uppercase text-[9px] font-semibold">{t('actions.permissionGranted')}</Badge>
                              <Button variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded-lg h-7 text-[8px] uppercase font-semibold" onClick={() => socket?.emit('hand:mute', { roomId: `meeting-${id}`, participantId: participantId })}>{t('actions.stopIntervention')}</Button>
                            </div>
                          ) : (
                            <Button
                              className="w-full h-10 bg-blue-600 hover:bg-blue-500 text-white font-semibold uppercase text-[10px] rounded-xl shadow-xl shadow-blue-900/20"
                              onClick={() => {
                                const identity = user?.fullname || user?.username || email || 'Participant';
                                socket?.emit('hand:raise', { roomId: `meeting-${id}`, participantId: participantId, name: identity });
                              }}
                            >
                              {t('actions.requestWord')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* DOCUMENTS TAB */}
              {activeTab === 'documents' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  {isAdminOrDev && (
                    <motion.div
                      whileHover={{ y: -2 }}
                      className="p-6 rounded-2xl bg-linear-to-br from-blue-600/10 to-indigo-600/10 border border-blue-500/20 mb-2 group hover:bg-blue-600/20 transition-all cursor-pointer text-center relative overflow-hidden"
                      onClick={() => setIsAddDocModalOpen(true)}
                    >
                      <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center mx-auto mb-3 text-blue-400 group-hover:scale-110 group-hover:rotate-6 transition-transform border border-blue-500/20">
                        <Plus size={24} />
                      </div>
                      <Typography variant="large" className="text-blue-400 uppercase text-[10px] font-semibold">{t('documents.add')}</Typography>
                    </motion.div>
                  )}

                  <div className="space-y-4">
                    {!(meeting as any).meetings_documents?.length && (
                      <div className="text-center py-16 opacity-20 flex flex-col items-center">
                        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-slate-400">
                          <FileText size={32} />
                        </div>
                        <Typography variant="label" className="uppercase text-[10px] font-semibold">{t('documents.empty')}</Typography>
                      </div>
                    )}

                    {(meeting as any).meetings_documents?.map((doc: any) => (
                      <div key={doc.id} className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-blue-500/30 transition-all group shadow-xl">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:bg-[#002B5B] group-hover:text-white transition-all shadow-inner">
                            <FileText size={18} className="text-slate-500 group-hover:text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <Typography variant="large" className="text-white truncate block text-sm font-semibold">{doc.file_title || 'Document'}</Typography>
                            <Typography variant="small" className="text-slate-600 mt-0.5 uppercase text-[9px] font-semibold">{t('documents.fileDocument')}</Typography>
                          </div>
                        </div>
                        <div className="mt-6 flex gap-3">
                          <Button
                            variant="outline"
                            className="flex-1 h-10 text-[10px] font-semibold uppercase border-white/5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl"
                            onClick={() => {
                              if (!isSafeDocumentUrl(doc.file_path)) { toast.error(tc('error')); return; }
                              window.open(doc.file_path, '_blank', 'noopener,noreferrer');
                            }}
                          >
                            <ExternalLink size={14} className="mr-2" /> {t('documents.open')}
                          </Button>
                          <Button
                            className="flex-1 h-10 text-[10px] font-semibold uppercase bg-[#002B5B] hover:bg-blue-600 text-white shadow-xl shadow-blue-900/10 rounded-xl border border-white/10"
                            onClick={() => {
                              if (!isSafeDocumentUrl(doc.file_path)) { toast.error(tc('error')); return; }
                              const link = document.createElement('a');
                              link.href = doc.file_path;
                              link.rel = 'noopener noreferrer';
                              link.download = doc.file_title;
                              link.click();
                            }}
                          >
                            <Download size={14} className="mr-2" /> {t('documents.download')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom Actions */}
          {!isAdminOrDev && (
            <div className="p-4 border-t border-white/5 bg-[#0B1120]/80 backdrop-blur-xl shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
              <Button
                className="w-full h-12 rounded-xl bg-[#002B5B] hover:bg-blue-700 text-white font-semibold uppercase text-[10px] shadow-[0_15px_30px_rgba(0,43,91,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] border border-white/10"
                onClick={raiseHand}
              >
                <Hand size={16} className="mr-2" />
                {t('actions.requestWord')}
              </Button>
            </div>
          )}
        </aside>
      </main>

      {/* End Meeting Confirmation Modal (Admin) */}
      <Modal
        isOpen={isEndConfirmModalOpen}
        onClose={() => setIsEndConfirmModalOpen(false)}
        title={t('modals.endConfirm.title')}
        size="md"
      >
        <div className="space-y-5 text-center py-2">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LogOut size={32} />
          </div>
          <Typography variant="h3" className="text-white uppercase font-semibold text-base">{t('modals.endConfirm.title')}</Typography>
          <Typography variant="p" className="text-slate-400 text-sm">{t('modals.endConfirm.desc')} {t('modals.endConfirm.irreversible')}</Typography>
          
          <div className="flex gap-4 pt-2">
            <Button variant="ghost" className="flex-1 h-11 rounded-xl text-slate-400 font-semibold uppercase text-[10px]" onClick={() => setIsEndConfirmModalOpen(false)}>{tc('cancel')}</Button>
            <Button 
              className="flex-1 h-11 bg-red-600 hover:bg-red-500 text-white font-semibold uppercase text-[10px] rounded-xl shadow-xl shadow-red-900/20"
              onClick={async () => {
                setIsEndConfirmModalOpen(false);
                setIsEndingMeeting(true);
                try {
                  const res = await fetch(`/api/meetings/${id}/live`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'update_status', status: 'FINISHED' }),
                  });
                  const result = await res.json();
                  if (result.status) {
                    socket?.emit('meeting:end', { roomId: `meeting-${id}` });
                    toast.success(t('toasts.finishedSuccess'));
                    router.push('/meetings');
                  } else {
                    toast.error(result.message || t('toasts.finishedError'));
                    setIsEndingMeeting(false);
                  }
                } catch { 
                  toast.error(t('toasts.finishedError')); 
                  setIsEndingMeeting(false);
                }
              }}
            >
              {tc('confirm')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Meeting Ended Modal (Everyone) */}
      <Modal
        isOpen={isMeetingEndedModalOpen}
        onClose={() => {}}
        title={t('modals.meetingOver.title')}
        size="md"
      >
        <div className="space-y-5 text-center py-2">
          <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-bounce">
            <Shield size={32} />
          </div>
          <Typography variant="h3" className="text-white uppercase font-semibold text-base">{t('modals.meetingOver.title')}</Typography>
          <Typography variant="p" className="text-slate-400 text-sm">{t('modals.meetingOver.desc')}</Typography>
          
          <div className="pt-4">
            <Button 
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-semibold uppercase text-[10px] rounded-xl shadow-xl shadow-blue-900/20"
              onClick={() => router.push(user ? '/meetings' : '/')}
            >
              {t('modals.meetingOver.backHome')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Loading Overlay for Admin Ending Meeting */}
      <AnimatePresence>
        {isEndingMeeting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-[#020617] flex flex-col items-center justify-center text-center p-8"
          >
            <div className="relative mb-8">
               <div className="w-20 h-20 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center">
                  <Shield size={28} className="text-blue-600 animate-pulse" />
               </div>
            </div>
            <Typography variant="h2" className="text-white uppercase font-semibold mb-3 text-lg">{t('overlays.ending.title')}</Typography>
            <Typography variant="p" className="text-slate-500 max-w-sm mx-auto leading-relaxed text-sm">
              {t('overlays.ending.desc')}
            </Typography>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vote Modal for Participants (Admins see the inline dashboard) */}
      {!isAdminOrDev && activeVote && votedNoteId !== activeVote.noteId && (
        <VoteModal
          key={`${activeVote.noteId}-${activeVote.endsAt}`}
          description={activeVote.description}
          endsAt={activeVote.endsAt}
          onVote={handleVote}
        />
      )}

      {/* 5-Second Results Overlay */}
      <AnimatePresence>
        {showResultsOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-8 max-w-xl w-full shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600"></div>
              <div className="text-center mb-8">
                <Badge className="mb-3 bg-blue-600/10 text-blue-400 border-blue-500/20 px-3 py-1 uppercase text-[10px] font-semibold">{t('overlays.voteResults.title')}</Badge>
                <Typography variant="h3" className="text-white leading-tight mb-2 text-lg font-semibold">{showResultsOverlay.description}</Typography>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                  { label: tv('options.yes'), value: showResultsOverlay.results?.oui || 0, color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30' },
                  { label: tv('options.no'), value: showResultsOverlay.results?.non || 0, color: 'text-rose-400', bg: 'bg-rose-500/20', border: 'border-rose-500/30' },
                  { label: tv('options.neutral'), value: showResultsOverlay.results?.neutre || 0, color: 'text-slate-400', bg: 'bg-slate-500/20', border: 'border-slate-500/30' },
                ].map(r => (
                  <div key={r.label} className={cn("p-5 rounded-xl border text-center", r.bg, r.border)}>
                    <Typography variant="small" className={cn("uppercase font-semibold mb-1.5 block text-[10px]", r.color)}>{r.label}</Typography>
                    <Typography variant="h2" className="text-white font-semibold text-xl">{r.value}</Typography>
                  </div>
                ))}
              </div>

              <div className="flex justify-center">
                <div className="flex items-center gap-2 text-slate-500 text-[10px] uppercase font-semibold">
                  <Clock size={12} className="animate-spin" />
                  {t('overlays.voteResults.autoClose')}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Document Modal */}
      <Modal
        isOpen={isAddDocModalOpen}
        onClose={() => !isUploading && setIsAddDocModalOpen(false)}
        title={tc('modals.addDocument.title')}
        size="md"
      >
        <form onSubmit={handleAddDocument} className="space-y-6">
          <div className="space-y-2">
            <Typography variant="label" className="text-slate-500 uppercase text-[10px] font-semibold">{tc('modals.addDocument.fileTitle')}</Typography>
            <input
              type="text"
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              placeholder={tc('modals.addDocument.fileTitle')}
              className="w-full h-11 px-4 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-hidden transition-all font-medium text-slate-900 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Typography variant="label" className="text-slate-500 uppercase text-[10px] font-semibold">{tc('modals.addDocument.upload')}</Typography>
            <div
              className={cn(
                "relative group cursor-pointer",
                isUploading && "opacity-50 cursor-not-allowed"
              )}
            >
              <input
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setNewDocFile(file);
                    if (!newDocTitle) setNewDocTitle(file.name.split('.')[0]);
                  }
                }}
                disabled={isUploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
              />
              <div className={cn(
                "border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center transition-all group-hover:border-blue-500 group-hover:bg-blue-50/50",
                newDocFile && "border-blue-500 bg-blue-50/30"
              )}>
                <div className="w-14 h-14 bg-blue-500/10 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                  {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                </div>
                {newDocFile ? (
                  <div className="space-y-1">
                    <Typography variant="large" className="text-blue-700 block truncate max-w-[250px] mx-auto">{newDocFile.name}</Typography>
                    <Typography variant="small" className="text-slate-500">{(newDocFile.size / 1024 / 1024).toFixed(2)} MB</Typography>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Typography variant="p" className="text-slate-600 font-medium">{tc('modals.addDocument.drop')}</Typography>
                    <Typography variant="small" className="text-slate-400">{tc('modals.addDocument.allowedTypes')}</Typography>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={isUploading}
              onClick={() => setIsAddDocModalOpen(false)}
              className="flex-1 h-11 rounded-xl border-slate-100 hover:bg-slate-50 transition-all font-semibold text-slate-500 uppercase text-[10px]"
            >
              {tc('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isUploading || !newDocFile}
              className="flex-1 h-11 rounded-xl bg-[#002B5B] hover:bg-blue-800 text-white shadow-xl shadow-blue-900/10 transition-all font-semibold uppercase text-[10px]"
            >
              {isUploading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {tc('modals.addDocument.uploading')}
                </div>
              ) : (
                tc('modals.addDocument.submit')
              )}
            </Button>
          </div>
        </form>
      </Modal>
      <style jsx global>{`
        /* ... existing CSS ... */
      `}</style>
    </div>
  );
}

// Small "reconnecting…" pill (socket or video).
function ReconnectingBadge({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex items-center gap-1.5 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30", className)}>
      <Loader2 size={10} className="animate-spin text-amber-400" />
      <span className="text-[9px] font-semibold text-amber-300 uppercase">{label}</span>
    </div>
  );
}

// Own component so the countdown re-renders itself, not the whole page.
function VoteCountdown({ endsAt }: { endsAt: number }) {
  const left = useSecondsLeft(endsAt);
  return <>{left}s</>;
}

type LkState = 'connecting' | 'connected' | 'reconnecting' | 'stopped';

// Video area. Memoized with primitive / stable props so socket events (votes,
// hands, lobby) never re-render LiveKit. Recovers from network loss on its own:
// LiveKit first retries internally; if it gives up, we rejoin with a fresh token
// (exponential backoff, indefinitely). Leaves only on an explicit Leave.
const LiveVideo = memo(function LiveVideo({
  token,
  isAdmin,
  handAccepted,
  onLeave,
  onRequestToken,
}: {
  token: string;
  isAdmin: boolean;
  handAccepted: boolean;
  onLeave: () => void;
  onRequestToken: () => Promise<string | null>;
}) {
  const tconn = useTranslations('LiveMeeting.connection');
  const [session, setSession] = useState({ token, key: 0 });
  const [state, setState] = useState<LkState>('connecting');
  const retries = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const rejoinRef = useRef<(immediate?: boolean) => void>(() => {});
  const rejoin = useCallback((immediate = false) => {
    if (!mounted.current) return;
    if (timer.current) {
      if (!immediate) return; // one pending retry at a time
      clearTimeout(timer.current);
      timer.current = null;
    }
    setState('reconnecting');
    const delay = immediate ? 0 : Math.min(30_000, 1000 * 2 ** Math.min(retries.current, 5));
    retries.current += 1;
    timer.current = setTimeout(async () => {
      timer.current = null;
      if (!mounted.current) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return rejoinRef.current(); // wait for the network
      const next = await onRequestToken().catch(() => null);
      if (!mounted.current) return;
      if (!next) return rejoinRef.current();
      setSession(s => ({ token: next, key: s.key + 1 })); // remount LiveKitRoom with a fresh token
    }, delay);
  }, [onRequestToken]);
  useEffect(() => {
    rejoinRef.current = rejoin;
  }, [rejoin]);

  // Network back: retry now instead of waiting for the backoff.
  useEffect(() => {
    const onOnline = () => {
      if (timer.current) {
        retries.current = 0;
        rejoinRef.current(true);
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const onConnected = useCallback(() => {
    retries.current = 0;
    setState('connected');
  }, []);

  const onDisconnected = useCallback((reason?: DisconnectReason) => {
    switch (reason) {
      case DisconnectReason.CLIENT_INITIATED: // the Leave button
        onLeave();
        return;
      case DisconnectReason.DUPLICATE_IDENTITY: // same identity joined elsewhere: no ping-pong
        setState('stopped');
        toast(tconn('duplicateTab'), { duration: 8000 });
        return;
      case DisconnectReason.PARTICIPANT_REMOVED:
      case DisconnectReason.ROOM_DELETED:
        setState('stopped');
        return;
      default: // network loss after LiveKit's own retries, server restart, signal close...
        rejoin();
    }
  }, [onLeave, rejoin, tconn]);

  // Stable: LiveKitRoom re-runs room.connect() when onError changes.
  const onError = useCallback(() => rejoin(), [rejoin]);

  const canPublish = isAdmin || handAccepted;

  return (
    <div className="absolute inset-0 flex flex-col">
      {state === 'stopped' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-white/50">
          <VideoOff size={32} />
          <Button
            onClick={() => { retries.current = 0; rejoin(true); }}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 h-10 rounded-xl uppercase text-[10px]"
          >
            {tconn('rejoinVideo')}
          </Button>
        </div>
      ) : (
        <LiveKitRoom
          key={session.key}
          // Participants publish only once they have the floor (the controller below
          // would turn the camera off immediately anyway).
          video={canPublish}
          audio={isAdmin}
          token={session.token}
          serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
          connect={true}
          options={ROOM_OPTIONS}
          onConnected={onConnected}
          onDisconnected={onDisconnected}
          onError={onError}
          className={cn(
            "flex-1 flex flex-col custom-livekit-theme overflow-hidden",
            isAdmin ? "role-admin" : "role-participant",
            handAccepted && "hand-accepted"
          )}
        >
          <VideoConference />
          <SpeakPermissionsController isAdmin={isAdmin} isHandAccepted={handAccepted} />
          <LiveKitConnectionWatcher onChange={setState} />
        </LiveKitRoom>
      )}
      {state === 'reconnecting' && (
        <ReconnectingBadge label={tconn('videoReconnecting')} className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-slate-900/80" />
      )}
    </div>
  );
});

// LiveKit's own (internal) reconnect attempts -> indicator.
function LiveKitConnectionWatcher({ onChange }: { onChange: (s: LkState) => void }) {
  const room = useRoomContext();
  useEffect(() => {
    const reconnecting = () => onChange('reconnecting');
    const reconnected = () => onChange('connected');
    room
      .on(RoomEvent.Reconnecting, reconnecting)
      .on(RoomEvent.SignalReconnecting, reconnecting)
      .on(RoomEvent.Reconnected, reconnected);
    return () => {
      room
        .off(RoomEvent.Reconnecting, reconnecting)
        .off(RoomEvent.SignalReconnecting, reconnecting)
        .off(RoomEvent.Reconnected, reconnected);
    };
  }, [room, onChange]);
  return null;
}

// 'Request to speak': without the floor a participant keeps mic, camera and screen
// share off. Event-driven (a track gets published or unmuted) instead of polling.
function SpeakPermissionsController({ isAdmin, isHandAccepted }: { isAdmin: boolean; isHandAccepted: boolean }) {
  const room = useRoomContext();

  // Floor granted: turn the microphone and camera on automatically (the browser asks for
  // permission first; a refusal just leaves that device off). LiveKitRoom's `video` prop only applies at connect.
  useEffect(() => {
    if (isAdmin || !isHandAccepted) return;
    const lp = room.localParticipant;
    const enable = () => {
      if (!lp.isMicrophoneEnabled) {
        lp.setMicrophoneEnabled(true).catch((err) => console.warn('Microphone not enabled:', err));
      }
      if (!lp.isCameraEnabled) {
        lp.setCameraEnabled(true).catch((err) => console.warn('Camera not enabled:', err));
      }
    };
    if (room.state === ConnectionState.Connected) enable();
    room.on(RoomEvent.Connected, enable);
    return () => {
      room.off(RoomEvent.Connected, enable);
    };
  }, [isAdmin, isHandAccepted, room]);

  useEffect(() => {
    if (isAdmin || isHandAccepted) return;
    const lp = room.localParticipant;
    let running = false;
    let again = false;

    const enforce = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          try {
            if (lp.isMicrophoneEnabled) await lp.setMicrophoneEnabled(false);
            if (lp.isCameraEnabled) await lp.setCameraEnabled(false);
            if (lp.isScreenShareEnabled) await lp.setScreenShareEnabled(false);
          } catch (err) {
            console.error('Failed to enforce speak permissions:', err);
          }
        } while (again);
      } finally {
        running = false;
      }
    };

    enforce();
    lp.on(ParticipantEvent.LocalTrackPublished, enforce).on(ParticipantEvent.TrackUnmuted, enforce);
    room.on(RoomEvent.Connected, enforce);
    return () => {
      lp.off(ParticipantEvent.LocalTrackPublished, enforce).off(ParticipantEvent.TrackUnmuted, enforce);
      room.off(RoomEvent.Connected, enforce);
    };
  }, [isAdmin, isHandAccepted, room]);

  return null;
}
