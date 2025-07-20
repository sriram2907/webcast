import React, { useState, useEffect } from "react";
import socket from "./socket";
import ReactPlayer from "react-player";

function App() {
  const [nickname, setNickname] = useState("");
  const [room, setRoom] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [members, setMembers] = useState([]);
  const [joinedRoom, setJoinedRoom] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

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

  const handleCreateRoom = () => {
    const newRoom = Math.random().toString(36).substring(2, 8); // simple random code
    setRoom(newRoom);
    setJoinedRoom(newRoom);
    socket.emit("join-room", { room: newRoom, nickname });
    setInRoom(true);
  };

  const handleJoinRoom = () => {
    if (room && nickname) {
      setJoinedRoom(room);
      socket.emit("join-room", { room, nickname });
      setInRoom(true);
    }
  };

  if (!inRoom) {
    return (
      <div style={{ maxWidth: 400, margin: "100px auto", textAlign: "center" }}>
        <h1>Watch Party</h1>
        <input
          type="text"
          placeholder="Your nickname"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          style={{ width: "100%", marginBottom: 10, padding: 8 }}
        />
        <input
          type="text"
          placeholder="Room code"
          value={room}
          onChange={e => setRoom(e.target.value)}
          style={{ width: "100%", marginBottom: 10, padding: 8 }}
        />
        <div>
          <button
            onClick={handleCreateRoom}
            disabled={!nickname}
            style={{ marginRight: 10, padding: "8px 16px" }}
          >
            Create Room
          </button>
          <button
            onClick={handleJoinRoom}
            disabled={!nickname || !room}
            style={{ padding: "8px 16px" }}
          >
            Join Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", textAlign: "center" }}>
      <h2>Room: {joinedRoom}</h2>
      <p>Welcome, {nickname}!</p>
      <h3>Members in room:</h3>
      <ul>
        {members.map((m) => (
          <li key={m.id}>{m.nickname}</li>
        ))}
      </ul>
      <div style={{ margin: "24px 0" }}>
        <input
          type="text"
          placeholder="Paste video URL (YouTube, Vimeo, MP4...)"
          value={videoUrl}
          onChange={e => {
            setVideoUrl(e.target.value);
            socket.emit("set-video-url", { room: joinedRoom, url: e.target.value });
          }}
          style={{ width: "80%", padding: 8 }}
        />
      </div>
      {videoUrl && (
        <div style={{ margin: "24px 0" }}>
          <ReactPlayer url={videoUrl} controls width="100%" />
        </div>
      )}
    </div>
  );
}

export default App;