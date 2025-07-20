// server/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Vite default port
    methods: ["GET", "POST"]
  }
});

const roomMembers = {}; // Add this at the top of your file (outside io.on)
const roomVideoUrls = {};
const screenSharers = {}; // room: { hostId: string }

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Server is running!');
});

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
  
    socket.on('join-room', ({ room, nickname }) => {
      socket.join(room);
      socket.data.nickname = nickname;

      // Remove any existing member with the same nickname in this room
      if (!roomMembers[room]) roomMembers[room] = [];
      roomMembers[room] = roomMembers[room].filter(
        (member) => member.nickname !== nickname
      );

      // Add user to roomMembers
      roomMembers[room].push({ id: socket.id, nickname });

      // Broadcast updated member list to the room
      io.to(room).emit('room-members', roomMembers[room]);

      // Send current video URL to the new user
      if (roomVideoUrls[room]) {
        socket.emit('video-url', roomVideoUrls[room]);
      }

      // If someone is sharing in this room, request an offer from the host
      if (screenSharers[room] && screenSharers[room].hostId && screenSharers[room].hostId !== socket.id) {
        io.to(screenSharers[room].hostId).emit('request-offer', { targetId: socket.id, room });
      }

      console.log(`${nickname} joined room: ${room}`);
      socket.to(room).emit('user-joined', { nickname, id: socket.id });
    });
  
    socket.on('disconnect', () => {
      // Remove user from all rooms
      for (const room in roomMembers) {
        roomMembers[room] = roomMembers[room].filter(
          (member) => member.id !== socket.id
        );
        // Broadcast updated member list
        io.to(room).emit('room-members', roomMembers[room]);
        // If the host disconnects, remove screen sharing host and notify viewers
        if (screenSharers[room] && screenSharers[room].hostId === socket.id) {
          io.to(room).emit("stop-sharing");
          delete screenSharers[room];
        }
      }
      console.log('User disconnected:', socket.id);
      // Optionally: broadcast to rooms that user left
    });

    socket.on('set-video-url', ({ room, url }) => {
      roomVideoUrls[room] = url;
      io.to(room).emit('video-url', url);
    });

    // WebRTC signaling for screen sharing (directed by socketId)
    socket.on("webrtc-offer", ({ room, offer, targetId }) => {
      if (targetId) {
        io.to(targetId).emit("webrtc-offer", { offer, fromId: socket.id });
      } else {
        // legacy: broadcast to all others
        socket.to(room).emit("webrtc-offer", { offer, fromId: socket.id });
      }
      // Mark this socket as the host for this room
      screenSharers[room] = { hostId: socket.id };
    });

    socket.on("webrtc-answer", ({ answer, targetId }) => {
      if (targetId) {
        io.to(targetId).emit("webrtc-answer", { answer, fromId: socket.id });
      }
    });

    socket.on("webrtc-ice", ({ candidate, targetId }) => {
      if (targetId) {
        io.to(targetId).emit("webrtc-ice", { candidate, fromId: socket.id });
      }
    });

    socket.on("stop-sharing", ({ room }) => {
      if (screenSharers[room] && screenSharers[room].hostId === socket.id) {
        socket.to(room).emit("stop-sharing");
        delete screenSharers[room];
      }
    });
  });

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});