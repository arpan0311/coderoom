import { useEffect, useRef, useState } from 'react';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * Peer-to-peer video with WebRTC. The server only passes "signal" messages
 * (offer / answer / ICE candidates); the video itself goes directly between browsers.
 *
 * Who calls whom: when a browser is ready it sends "call-ready". Everyone already
 * in the room gets "peer-joined" and sends an offer. So only one side starts each call.
 */
export default function VideoCall({ socket, joinCount }) {
  const localVideo = useRef(null);
  const stream = useRef(null);
  const peers = useRef(new Map()); // socketId -> RTCPeerConnection
  const mediaReady = useRef(null);
  const [remotes, setRemotes] = useState({}); // socketId -> { stream, name }
  const [media, setMedia] = useState('loading');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  // 1) Ask for camera + mic once.
  useEffect(() => {
    mediaReady.current = (async () => {
      // Try camera + mic, then mic only. If both fail we can still watch the other person.
      for (const [constraints, state] of [
        [{ video: { width: 320, height: 240 }, audio: true }, 'on'],
        [{ audio: true }, 'audio'],
      ]) {
        try {
          const s = await navigator.mediaDevices.getUserMedia(constraints);
          stream.current = s;
          if (localVideo.current) localVideo.current.srcObject = s;
          setMedia(state);
          return;
        } catch {
          // try the next option
        }
      }
      setMedia('off');
    })();
    const peerMap = peers.current;
    return () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      peerMap.forEach((pc) => pc.close());
      peerMap.clear();
    };
  }, []);

  // 2) Signaling.
  useEffect(() => {
    if (!socket) return;

    const removePeer = (id) => {
      peers.current.get(id)?.close();
      peers.current.delete(id);
      setRemotes(({ [id]: _gone, ...rest }) => rest);
    };

    const createPeer = (id, name) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc.pendingCandidates = [];
      peers.current.set(id, pc);
      if (stream.current) {
        stream.current.getTracks().forEach((t) => pc.addTrack(t, stream.current));
      } else {
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }
      pc.onicecandidate = (e) => e.candidate && socket.emit('signal', { to: id, data: { candidate: e.candidate } });
      pc.ontrack = (e) =>
        setRemotes((r) => ({ ...r, [id]: { stream: e.streams[0] || new MediaStream([e.track]), name } }));
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') removePeer(id);
      };
      return pc;
    };

    const flushCandidates = async (pc) => {
      for (const c of pc.pendingCandidates.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    };

    const onPeerJoined = async ({ socketId, name }) => {
      await mediaReady.current;
      removePeer(socketId);
      const pc = createPeer(socketId, name);
      await pc.setLocalDescription(await pc.createOffer());
      socket.emit('signal', { to: socketId, data: { description: pc.localDescription } });
    };

    const onSignal = async ({ from, name, data }) => {
      await mediaReady.current;
      let pc = peers.current.get(from);
      if (data.description?.type === 'offer') {
        if (pc) removePeer(from);
        pc = createPeer(from, name);
        await pc.setRemoteDescription(data.description);
        await pc.setLocalDescription(await pc.createAnswer());
        socket.emit('signal', { to: from, data: { description: pc.localDescription } });
        await flushCandidates(pc);
      } else if (data.description?.type === 'answer' && pc) {
        await pc.setRemoteDescription(data.description);
        await flushCandidates(pc);
      } else if (data.candidate && pc) {
        // A candidate can arrive before the offer/answer is applied; keep it until then.
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
        else pc.pendingCandidates.push(data.candidate);
      }
    };

    const onPeerLeft = ({ socketId }) => removePeer(socketId);

    // A failed call setup must never crash the page; just log it.
    const safe = (fn) => (arg) => fn(arg).catch((err) => console.warn('Video call:', err));
    const onPeerJoinedSafe = safe(onPeerJoined);
    const onSignalSafe = safe(onSignal);
    socket.on('peer-joined', onPeerJoinedSafe);
    socket.on('signal', onSignalSafe);
    socket.on('peer-left', onPeerLeft);
    return () => {
      socket.off('peer-joined', onPeerJoinedSafe);
      socket.off('signal', onSignalSafe);
      socket.off('peer-left', onPeerLeft);
    };
  }, [socket]);

  // 3) After every (re)join, tell the room we are ready to be called.
  useEffect(() => {
    if (!socket || !joinCount) return;
    mediaReady.current.then(() => socket.emit('call-ready'));
  }, [socket, joinCount]);

  const toggle = (kind) => {
    const tracks = kind === 'audio' ? stream.current?.getAudioTracks() : stream.current?.getVideoTracks();
    tracks?.forEach((t) => (t.enabled = !t.enabled));
    if (kind === 'audio') setMicOn((v) => !v);
    else setCamOn((v) => !v);
  };

  const remoteList = Object.entries(remotes);
  return (
    <div className="video">
      <div className="video-tile">
        {remoteList.length ? (
          remoteList.map(([id, r]) => <RemoteVideo key={id} stream={r.stream} name={r.name} />)
        ) : (
          <div className="video-empty muted small">Waiting for the other person…</div>
        )}
      </div>
      <div className="video-tile small-tile">
        <video ref={localVideo} autoPlay playsInline muted />
        <span className="video-name">
          You{media === 'off' ? ' (no camera or mic)' : media === 'audio' ? ' (mic only)' : ''}
        </span>
      </div>
      {(media === 'on' || media === 'audio') && (
        <div className="video-controls">
          <button className={`btn small ${micOn ? 'btn-ghost' : 'btn-danger'}`} onClick={() => toggle('audio')}>
            {micOn ? 'Mute' : 'Unmute'}
          </button>
          {media === 'on' && (
            <button className={`btn small ${camOn ? 'btn-ghost' : 'btn-danger'}`} onClick={() => toggle('video')}>
              {camOn ? 'Camera off' : 'Camera on'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RemoteVideo({ stream, name }) {
  const ref = useRef(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream;
    v.muted = false;
    // Browsers may block video with sound until the user clicks. Then play it muted and offer a button.
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {});
      setBlocked(true);
    });
  }, [stream]);

  const unmute = () => {
    ref.current.muted = false;
    ref.current.play().catch(() => {});
    setBlocked(false);
  };

  return (
    <>
      <video ref={ref} autoPlay playsInline />
      <span className="video-name">{name}</span>
      {blocked && (
        <button className="btn small btn-primary video-unmute" onClick={unmute}>
          🔇 Click to hear
        </button>
      )}
    </>
  );
}
