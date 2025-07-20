import React, { useState, useEffect, useRef } from "react";
import socket from "./socket";
import ReactPlayer from "react-player";

function App() {
  const [nickname, setNickname] = useState("");
  const [room, setRoom] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [members, setMembers] = useState([]);
  const [joinedRoom, setJoinedRoom] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoStream, setVideoStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isSharing, setIsSharing] = useState(false);
  const peerConnectionRef = useRef(null);
  const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

  // Add state for hover/focus effects
  const [hoveredBtn, setHoveredBtn] = useState("");
  const [focusedInput, setFocusedInput] = useState("");

  // Clean up peer connection and streams
  const cleanupWebRTC = () => {
    Object.values(peerConnections).forEach(pc => {
      if (pc) pc.close();
    });
    setPeerConnections({});
    setRemoteStream(null);
    setVideoStream(null);
    setIsSharing(false);
  };

  const [peerConnections, setPeerConnections] = useState({}); // { [socketId]: RTCPeerConnection }
  const [mySocketId, setMySocketId] = useState("");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const remoteVideoRef = useRef(null);

  const [suggestedMovies, setSuggestedMovies] = useState([]);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [movieError, setMovieError] = useState("");

  const OMDB_API_KEY = "30b1777f";
  // Recent 2024/2025 releases (update as needed)
  const recentMovieIds = [
    "tt15398776", // Oppenheimer (2023)
    "tt6791350", // Guardians of the Galaxy Vol. 3 (2023)
    "tt1517268", // Barbie (2023)
    "tt9362722", // Spider-Man: Across the Spider-Verse (2023)
    "tt10640346", // The Marvels (2023)
    "tt1745564", // John Wick: Chapter 4 (2023)
    "tt15239678", // Killers of the Flower Moon (2023)
    "tt5537002", // Kill Boksoon (2023)
    "tt14230458", // The Creator (2023)
    "tt7322224", // The Equalizer 3 (2023)
    "tt21044508", // Argylle (2024)
    "tt29425208", // The Beekeeper (2024)
    "tt14849194", // Madame Web (2024)
    "tt14537248", // Dune: Part Two (2024)
    "tt10671440", // Poor Things (2023)
    "tt5535276", // Napoleon (2023)
    "tt10268488", // The Holdovers (2023)
    "tt15239678", // Killers of the Flower Moon (2023)
    "tt11813216", // The Zone of Interest (2023)
    "tt1517268", // Barbie (2023)
    "tt6791350", // Guardians of the Galaxy Vol. 3 (2023)
    "tt21044508", // Argylle (2024)
    "tt29425208", // The Beekeeper (2024)
    "tt14849194", // Madame Web (2024)
    "tt14537248", // Dune: Part Two (2024)
    "tt10671440", // Poor Things (2023)
    "tt5535276", // Napoleon (2023)
    "tt10268488", // The Holdovers (2023)
    "tt11813216", // The Zone of Interest (2023)
  ];

  // Fetch movies from OMDb for 2025, refresh once per day
  useEffect(() => {
    setLoadingMovies(true);
    setMovieError("");
    Promise.all(
      recentMovieIds.map(id =>
        fetch(`https://www.omdbapi.com/?i=${id}&apikey=${OMDB_API_KEY}`)
          .then(res => res.json())
      )
    )
      .then(movies => {
        setSuggestedMovies(movies.filter(m => m.Response === "True" && m.Poster && m.Poster !== "N/A"));
        setLoadingMovies(false);
      })
      .catch(() => {
        setMovieError("Could not fetch movie suggestions.");
        setLoadingMovies(false);
      });
  }, []);

  const fetchTrailerAndSet = (movie) => {
    // Try to find a trailer on YouTube by title
    const query = encodeURIComponent(`${movie.Title} trailer`);
    window.open(`https://www.youtube.com/results?search_query=${query}`, "_blank");
  };

  useEffect(() => {
    const savedNickname = localStorage.getItem("nickname");
    const savedRoom = localStorage.getItem("room");
    if (savedNickname && savedRoom) {
      setNickname(savedNickname);
      setRoom(savedRoom);
      setJoinedRoom(savedRoom);
      socket.emit("join-room", { room: savedRoom, nickname: savedNickname });
      setInRoom(true);
    }
  }, []);

  useEffect(() => {
    socket.on("room-members", (members) => {
      setMembers(members);
    });

    socket.on("video-url", (url) => {
      setVideoUrl(url);
    });

    return () => {
      socket.off("room-members");
      socket.off("video-url");
    };
  }, []);

  useEffect(() => {
    socket.on("connect", () => {
      setMySocketId(socket.id);
    });
  }, []);

  const handleCreateRoom = () => {
    const newRoom = Math.random().toString(36).substring(2, 8); // simple random code
    setRoom(newRoom);
    setJoinedRoom(newRoom);
    socket.emit("join-room", { room: newRoom, nickname });
    setInRoom(true);
    localStorage.setItem("nickname", nickname);
    localStorage.setItem("room", newRoom);
  };

  const handleJoinRoom = () => {
    if (room && nickname) {
      setJoinedRoom(room);
      socket.emit("join-room", { room, nickname });
      setInRoom(true);
      localStorage.setItem("nickname", nickname);
      localStorage.setItem("room", room);
    }
  };

  const startScreenShare = async () => {
    cleanupWebRTC();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      setVideoStream(stream);
      setIsSharing(true);

      // For each member (except self), create a peer connection and send offer
      members.filter(m => m.id !== mySocketId).forEach(async (member) => {
        const pc = new window.RTCPeerConnection(config);
        setPeerConnections(prev => ({ ...prev, [member.id]: pc }));
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        pc.onicecandidate = event => {
          if (event.candidate) {
            socket.emit("webrtc-ice", { candidate: event.candidate, targetId: member.id });
          }
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc-offer", { room: joinedRoom, offer, targetId: member.id });
      });
    } catch (err) {
      alert("Screen share error: " + err.message);
      setIsSharing(false);
    }
  };

  // Listen for request-offer (from new viewers)
  useEffect(() => {
    socket.on("request-offer", async ({ targetId }) => {
      if (!videoStream) return;
      const pc = new window.RTCPeerConnection(config);
      setPeerConnections(prev => ({ ...prev, [targetId]: pc }));
      videoStream.getTracks().forEach(track => pc.addTrack(track, videoStream));
      pc.onicecandidate = event => {
        if (event.candidate) {
          socket.emit("webrtc-ice", { candidate: event.candidate, targetId });
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc-offer", { room: joinedRoom, offer, targetId });
    });
    return () => socket.off("request-offer");
  }, [videoStream, joinedRoom]);

  // Handle offers (for viewers)
  useEffect(() => {
    socket.on("webrtc-offer", async ({ offer, fromId }) => {
      const pc = new window.RTCPeerConnection(config);
      setPeerConnections(prev => ({ ...prev, [fromId]: pc }));
      pc.ontrack = event => {
        setRemoteStream(event.streams[0]);
      };
      pc.onicecandidate = event => {
        if (event.candidate) {
          socket.emit("webrtc-ice", { candidate: event.candidate, targetId: fromId });
        }
      };
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", { answer, targetId: fromId });
    });
    return () => socket.off("webrtc-offer");
  }, [joinedRoom]);

  // Handle answers (for host)
  useEffect(() => {
    socket.on("webrtc-answer", async ({ answer, fromId }) => {
      const pc = peerConnections[fromId];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });
    return () => socket.off("webrtc-answer");
  }, [peerConnections]);

  // Handle ICE candidates
  useEffect(() => {
    socket.on("webrtc-ice", async ({ candidate, fromId }) => {
      const pc = peerConnections[fromId];
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error("Error adding received ice candidate", e);
        }
      }
    });
    return () => socket.off("webrtc-ice");
  }, [peerConnections]);

  const stopScreenShare = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
    }
    cleanupWebRTC();
    socket.emit("stop-sharing", { room: joinedRoom });
  };

  // Listen for stop-sharing event (for viewers)
  useEffect(() => {
    socket.on("stop-sharing", () => {
      setRemoteStream(null);
    });
    return () => socket.off("stop-sharing");
  }, []);

  const handleFullScreen = () => {
    const video = remoteVideoRef.current;
    if (!video) return;
    if (!isFullScreen) {
      if (video.requestFullscreen) video.requestFullscreen();
      else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
      else if (video.mozRequestFullScreen) video.mozRequestFullScreen();
      else if (video.msRequestFullscreen) video.msRequestFullscreen();
      setIsFullScreen(true);
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
      setIsFullScreen(false);
    }
  };

  useEffect(() => {
    const onFullScreenChange = () => {
      const fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
      setIsFullScreen(!!fsElement);
    };
    document.addEventListener('fullscreenchange', onFullScreenChange);
    document.addEventListener('webkitfullscreenchange', onFullScreenChange);
    document.addEventListener('mozfullscreenchange', onFullScreenChange);
    document.addEventListener('MSFullscreenChange', onFullScreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullScreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullScreenChange);
      document.removeEventListener('mozfullscreenchange', onFullScreenChange);
      document.removeEventListener('MSFullscreenChange', onFullScreenChange);
    };
  }, []);

  // Re-add Google Fonts link for DotGothic16
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=DotGothic16&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  const animatedBgStyle = {
    minHeight: "100vh",
    width: "100vw",
    fontFamily: 'DotGothic16, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#222",
    transition: "background 0.3s",
    position: "relative",
    overflow: "auto",
    margin: 0,
    padding: 0,
    background: "linear-gradient(270deg, #e0eaff, #b3cfff, #6ea8fe, #e0eaff)",
    backgroundSize: "600% 600%",
    animation: "gradientMove 16s ease infinite"
  };

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `@keyframes gradientMove {
      0% {background-position: 0% 50%;}
      50% {background-position: 100% 50%;}
      100% {background-position: 0% 50%;}
    }`;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Add keyframes for ball movement
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes ball1move {
        0% { transform: translate(0, 0) scale(1); }
        50% { transform: translate(60vw, 20vh) scale(1.15); }
        100% { transform: translate(0, 0) scale(1); }
      }
      @keyframes ball2move {
        0% { transform: translate(0, 0) scale(1); }
        50% { transform: translate(-40vw, 30vh) scale(0.9); }
        100% { transform: translate(0, 0) scale(1); }
      }
      @keyframes ball3move {
        0% { transform: translate(0, 0) scale(1); }
        50% { transform: translate(20vw, -30vh) scale(1.2); }
        100% { transform: translate(0, 0) scale(1); }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Add keyframes for movie bar scrolling
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes movieBarScroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Add this useEffect to inject CSS for hiding scrollbars on the main card
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .no-scrollbar {
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .no-scrollbar::-webkit-scrollbar {
        display: none;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

    return (
    <div style={animatedBgStyle}>
      {/* Animated 3D balls */}
      <div style={{
        position: "absolute",
        top: "10vh",
        left: "5vw",
        width: 180,
        height: 180,
        borderRadius: "50%",
        background: "radial-gradient(circle at 30% 30%, #6ea8fe 0%, #b3cfff 80%, transparent 100%)",
        filter: "blur(16px)",
        opacity: 0.7,
        zIndex: 0,
        animation: "ball1move 18s ease-in-out infinite"
      }} />
      <div style={{
        position: "absolute",
        bottom: "8vh",
        right: "10vw",
        width: 140,
        height: 140,
        borderRadius: "50%",
        background: "radial-gradient(circle at 60% 60%, #3b6eea 0%, #b3cfff 80%, transparent 100%)",
        filter: "blur(18px)",
        opacity: 0.6,
        zIndex: 0,
        animation: "ball2move 22s ease-in-out infinite"
      }} />
      <div style={{
        position: "absolute",
        top: "60vh",
        left: "60vw",
        width: 110,
        height: 110,
        borderRadius: "50%",
        background: "radial-gradient(circle at 50% 50%, #a0c4ff 0%, #e0eaff 80%, transparent 100%)",
        filter: "blur(14px)",
        opacity: 0.5,
        zIndex: 0,
        animation: "ball3move 26s ease-in-out infinite"
      }} />
      <div
        className="no-scrollbar"
        style={{
          background: "rgba(255, 255, 255, 0.25)",
          borderRadius: 24,
          boxShadow: "0 4px 24px 0 rgba(0,0,0,0.10)",
          padding: 40,
          minWidth: 340,
          maxWidth: 420,
          width: "100%",
          margin: 0,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          border: "1.5px solid rgba(255,255,255,0.35)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          zIndex: 10,
          fontFamily: 'DotGothic16, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          position: "relative",
          maxHeight: "calc(100vh - 300px)",
          overflowY: "auto"
        }}
      >
        {/* Mac style dots */}
        <div style={{
          position: "absolute",
          top: 18,
          left: 24,
          display: "flex",
          gap: 8,
          zIndex: 2
        }}>
          <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#ff5f56", border: "1.5px solid #e0443e" }} />
          <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#ffbd2e", border: "1.5px solid #dea123" }} />
          <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#27c93f", border: "1.5px solid #13a10e" }} />
        </div>
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ marginBottom: 16 }}
        >
          <circle cx="24" cy="24" r="22" stroke="#111" strokeWidth="4" fill="none" />
          <text x="50%" y="60%" textAnchor="middle" fill="#111" fontSize="28" fontFamily="DotGothic16, monospace" fontWeight="bold" dominantBaseline="middle">W</text>
        </svg>
        <h1 style={{ fontFamily: 'DotGothic16, monospace', fontWeight: 400, fontSize: 32, marginBottom: 8, letterSpacing: 2, textShadow: '0 2px 8px #b3cfff' }}>Webcast</h1>
        {!inRoom ? (
          <>
        <input
          type="text"
          placeholder="Your nickname"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
              onFocus={() => setFocusedInput("nickname")}
              onBlur={() => setFocusedInput("")}
              style={{
                width: "100%",
                marginBottom: 16,
                padding: 12,
                borderRadius: 12,
                border: focusedInput === "nickname" ? "1.5px solid #007aff" : "1px solid #333",
                fontSize: 16,
                background: "#fff",
                boxShadow: focusedInput === "nickname" ? "0 2px 8px 0 rgba(0,122,255,0.10)" : undefined,
                transition: "border 0.2s, box-shadow 0.2s"
              }}
        />
        <input
          type="text"
          placeholder="Room code"
          value={room}
          onChange={e => setRoom(e.target.value)}
              onFocus={() => setFocusedInput("room")}
              onBlur={() => setFocusedInput("")}
              style={{
                width: "100%",
                marginBottom: 16,
                padding: 12,
                borderRadius: 12,
                border: focusedInput === "room" ? "1.5px solid #007aff" : "1px solid #333",
                fontSize: 16,
                background: "#fff",
                boxShadow: focusedInput === "room" ? "0 2px 8px 0 rgba(0,122,255,0.10)" : undefined,
                transition: "border 0.2s, box-shadow 0.2s"
              }}
            />
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 8 }}>
          <button
            onClick={handleCreateRoom}
            disabled={!nickname}
                onMouseEnter={() => setHoveredBtn("create")}
                onMouseLeave={() => setHoveredBtn("")}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 12,
                  border: "none",
                  background: !nickname
                    ? "#007aff"
                    : hoveredBtn === "create"
                      ? "#005ecb"
                      : "#007aff",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: nickname ? "pointer" : "not-allowed",
                  opacity: nickname ? 1 : 0.5,
                  transition: "background 0.2s, box-shadow 0.2s",
                  boxShadow: hoveredBtn === "create" && nickname ? "0 2px 8px 0 rgba(0,122,255,0.10)" : undefined
                }}
          >
            Create Room
          </button>
          <button
            onClick={handleJoinRoom}
            disabled={!nickname || !room}
                onMouseEnter={() => setHoveredBtn("join")}
                onMouseLeave={() => setHoveredBtn("")}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 12,
                  border: "none",
                  background: !nickname || !room
                    ? "#f2f2f7"
                    : hoveredBtn === "join"
                      ? "#e0e0e0"
                      : "#f2f2f7",
                  color: !nickname || !room
                    ? "#222"
                    : "#222",
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: nickname && room ? "pointer" : "not-allowed",
                  opacity: nickname && room ? 1 : 0.5,
                  transition: "background 0.2s, box-shadow 0.2s",
                  boxShadow: hoveredBtn === "join" && nickname && room ? "0 2px 8px 0 rgba(0,0,0,0.08)" : undefined
                }}
          >
            Join Room
          </button>
        </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.5 }}>Room: <span style={{ color: "#007aff" }}>{joinedRoom}</span></div>
              <div style={{ color: "#888", fontSize: 15, marginTop: 2 }}>Welcome, {nickname}!</div>
            </div>
            <div style={{ textAlign: "left", marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Members in room:</div>
              <ul style={{ paddingLeft: 18, color: "#444", fontSize: 15, margin: 0 }}>
                {members.map((m) => (
                  <li key={m.id} style={{ marginBottom: 2 }}>{m.nickname}</li>
                ))}
              </ul>
            </div>
            <div style={{ margin: "24px 0" }}>
              <input
                type="text"
                placeholder="Paste video URL (YouTube, Vimeo, MP4...)"
                value={videoUrl}
                onChange={e => {
                  setVideoUrl(e.target.value);
                  socket.emit("set-video-url", { room: joinedRoom, url: e.target.value });
                }}
                onFocus={() => setFocusedInput("videoUrl")}
                onBlur={() => setFocusedInput("")}
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: focusedInput === "videoUrl" ? "1.5px solid #007aff" : "1px solid #333",
                  fontSize: 16,
                  background: "#fff",
                  boxShadow: focusedInput === "videoUrl" ? "0 2px 8px 0 rgba(0,122,255,0.10)" : undefined,
                  transition: "border 0.2s, box-shadow 0.2s"
                }}
              />
            </div>
            <button
              onClick={startScreenShare}
              onMouseEnter={() => setHoveredBtn("share")}
              onMouseLeave={() => setHoveredBtn("")}
              style={{
                marginTop: 8,
                padding: "12px 0",
                borderRadius: 12,
                border: "none",
                background: isSharing
                  ? "#e0e0e0"
                  : hoveredBtn === "share"
                    ? "#005ecb"
                    : "#007aff",
                color: isSharing
                  ? "#888"
                  : "#fff",
                fontWeight: 600,
                fontSize: 16,
                cursor: isSharing ? "not-allowed" : "pointer",
                opacity: isSharing ? 0.7 : 1,
                width: "100%",
                transition: "background 0.2s, box-shadow 0.2s",
                boxShadow: hoveredBtn === "share" && !isSharing ? "0 2px 8px 0 rgba(0,122,255,0.10)" : undefined
              }}
              disabled={isSharing}
            >
              Share Screen
            </button>
            {isSharing && (
              <button
                onClick={stopScreenShare}
                style={{
                  marginTop: 8,
                  padding: "12px 0",
                  borderRadius: 12,
                  border: "none",
                  background: "#ff3b30",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: "pointer",
                  width: "100%",
                  transition: "background 0.2s, box-shadow 0.2s"
                }}
              >
                Stop Screen Sharing
              </button>
            )}
            {videoStream && (
              <video
                id="screen-video"
                autoPlay
                playsInline
                muted
                style={{ width: "100%", marginTop: 16, borderRadius: 16, boxShadow: "0 2px 12px 0 rgba(0,0,0,0.04)" }}
                ref={video => video && (video.srcObject = videoStream)}
              />
            )}
            {remoteStream && (
              <>
                <video
                  id="remote-video"
                  autoPlay
                  playsInline
                  style={{ width: "100%", marginTop: 16, borderRadius: 16, boxShadow: "0 2px 12px 0 rgba(0,0,0,0.04)" }}
                  ref={video => {
                    remoteVideoRef.current = video;
                    if (video) video.srcObject = remoteStream;
                  }}
                />
                <button
                  onClick={handleFullScreen}
                  style={{
                    marginTop: 8,
                    padding: "10px 0",
                    borderRadius: 12,
                    border: "none",
                    background: isFullScreen ? "#e0e0e0" : "#007aff",
                    color: isFullScreen ? "#222" : "#fff",
                    fontWeight: 600,
                    fontSize: 16,
                    cursor: "pointer",
                    width: "100%",
                    transition: "background 0.2s, box-shadow 0.2s"
                  }}
                >
                  {isFullScreen ? "Exit Full Screen" : "View Full Screen"}
                </button>
              </>
            )}
            <button
              onClick={() => {
                localStorage.removeItem("nickname");
                localStorage.removeItem("room");
                setInRoom(false);
                setNickname("");
                setRoom("");
                setJoinedRoom("");
                setMembers([]);
                setVideoUrl("");
              }}
              onMouseEnter={() => setHoveredBtn("leave")}
              onMouseLeave={() => setHoveredBtn("")}
              style={{
                marginTop: 24,
                padding: "10px 0",
                borderRadius: 12,
                border: "none",
                background: !inRoom
                  ? "#f2f2f7"
                  : hoveredBtn === "leave"
                    ? "#e0e0e0"
                    : "#f2f2f7",
                color: !inRoom
                  ? "#222"
                  : "#222",
                fontWeight: 500,
                fontSize: 15,
                width: "100%",
                cursor: "pointer",
                transition: "background 0.2s, box-shadow 0.2s",
                boxShadow: hoveredBtn === "leave" && inRoom ? "0 2px 8px 0 rgba(0,0,0,0.08)" : undefined
              }}
            >
              Leave Room
            </button>
          </>
        )}
      </div>
      {/* Movie suggestion bar */}
      <div style={{
        position: "fixed",
        left: 0,
        bottom: 0,
        width: "100vw",
        zIndex: 20,
        boxShadow: "0 -8px 32px 0 rgba(0,0,0,0.10)",
        margin: 0,
        padding: "24px 0 0 0",
        borderTop: "1.5px solid #e0e0e0",
        background: "rgba(255,255,255,0.16)",
        borderRadius: "0 0 24px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        maxHeight: 260,
        overflow: "auto"
      }}>
        <div style={{ fontSize: 16, color: "#888", marginBottom: 12, textAlign: "center" }}>Recent 2024/2025 Movies</div>
        {loadingMovies ? (
          <div style={{ color: "#888", fontSize: 16, textAlign: "center" }}>Loading...</div>
        ) : movieError ? (
          <div style={{ color: "#e0443e", fontSize: 16, textAlign: "center" }}>{movieError}</div>
        ) : suggestedMovies.length > 0 ? (
          <div style={{
            width: "100%",
            overflow: "hidden",
            position: "relative",
            height: 220,
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <div style={{
              display: "flex",
              gap: 32,
              alignItems: "center",
              height: 220,
              animation: suggestedMovies.length > 8 ? "movieBarScroll 80s linear infinite" : undefined,
              willChange: "transform"
            }}>
              {[...suggestedMovies, ...suggestedMovies].slice(0, 40).map(movie => (
                <img
                  key={movie.imdbID + Math.random()}
                  src={movie.Poster}
                  alt={movie.Title}
                  title={movie.Title}
                  style={{
                    width: 120,
                    height: 180,
                    borderRadius: 16,
                    objectFit: "cover",
                    cursor: "pointer",
                    boxShadow: "0 4px 16px 0 rgba(0,0,0,0.13)",
                    border: "2px solid #eee",
                    transition: "transform 0.18s, box-shadow 0.18s",
                    margin: "0 0.5px",
                    display: "block"
                  }}
                  onClick={() => fetchTrailerAndSet(movie)}
                  onMouseOver={e => {
                    e.currentTarget.style.transform = "scale(1.13)";
                    e.currentTarget.style.boxShadow = "0 8px 32px 0 rgba(0,0,0,0.18)";
                    e.currentTarget.style.zIndex = 2;
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "0 4px 16px 0 rgba(0,0,0,0.13)";
                    e.currentTarget.style.zIndex = 1;
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default App;