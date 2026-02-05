import express from "express";
import { Server } from "socket.io";
import http from "http";

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

app.use(express.static("public"));

// Track all connected users
let connectedUsers = {};

io.on("connection", (socket) => {
  console.log("device connected:", socket.id);
  
  // Send existing users to the new joiner
  socket.emit("existing_users", connectedUsers);
  
  // Receive data from clients
  socket.on("data", (data) => {
    // Store this user's latest data
    connectedUsers[socket.id] = {
      ...data,
      timestamp: Date.now()
    };
    
    // Broadcast to ALL other clients
    socket.broadcast.emit("data", {
      id: socket.id,
      ...data
    });
  });

  socket.on("disconnect", () => {
    console.log("device disconnected:", socket.id);
    // Remove user from tracking
    delete connectedUsers[socket.id];
    // Tell everyone else this user left
    io.emit("user_left", socket.id);
  });
});

server.listen(port, () => {
  console.log("Server listening on port: " + port);
});