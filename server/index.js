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

      // Add user to roomMembers
      if (!roomMembers[room]) roomMembers[room] = [];
      roomMembers[room].push({ id: socket.id, nickname });

      // Broadcast updated member list to the room
      io.to(room).emit('room-members', roomMembers[room]);
      console.log(`${nickname} joined room: ${room}`);
      // Notify others in the room (optional)
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
      }
      console.log('User disconnected:', socket.id);
      // Optionally: broadcast to rooms that user left
    });
  });

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});