const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const missionStatus = {};
const TOTAL_MISSIONS = 7;

for (let i = 1; i <= TOTAL_MISSIONS; i++) {
  missionStatus[i] = {
    reset: false,
    success: false,
    failed: false,
    inProgress: false,
  };
}

io.on("connection", (socket) => {
  console.log("✅ 연결됨:", socket.id);

  socket.on("request-global-status", () => {
    socket.emit("global-status", missionStatus);
  });

  socket.on("admin-reset-mission", (missionId) => {
    if (missionStatus[missionId]) {
      missionStatus[missionId] = {
        reset: true,
        success: false,
        failed: false,
        inProgress: false,
      };
      io.emit("participant-reset", missionId);
      setTimeout(() => {
        missionStatus[missionId].reset = false;
        io.emit("global-status", missionStatus);
      }, 100);
    }
  });

  socket.on("admin-reset-all", () => {
    for (let i = 1; i <= TOTAL_MISSIONS; i++) {
      missionStatus[i] = {
        reset: true,
        success: false,
        failed: false,
        inProgress: false,
      };
    }
    io.emit("participant-reset", -1);
    setTimeout(() => {
      for (let i = 1; i <= TOTAL_MISSIONS; i++) {
        missionStatus[i].reset = false;
      }
      io.emit("global-status", missionStatus);
    }, 100);
  });

  socket.on("mission-start", (missionId) => {
    for (let i = 1; i <= TOTAL_MISSIONS; i++) {
      if (i !== missionId && missionStatus[i].inProgress) return;
    }
    if (missionStatus[missionId]) {
      missionStatus[missionId].inProgress = true;
      io.emit("admin-mission-activate", missionId);
      io.emit("global-status", missionStatus);
    }
  });

  socket.on("mark-failed", (missionId) => {
    if (missionStatus[missionId]) {
      missionStatus[missionId].failed = true;
      missionStatus[missionId].inProgress = false;
      io.emit("global-status", missionStatus);
    }
  });

  socket.on("mission-complete", (missionId) => {
    if (missionStatus[missionId]) {
      if (missionStatus[missionId].success) return; // ✅ 중복 성공 방지
      missionStatus[missionId].success = true;
      missionStatus[missionId].failed = false;
      missionStatus[missionId].inProgress = false;
      io.emit("mission-complete", missionId);
      io.emit("global-status", missionStatus);
    }
  });

  socket.on("disconnect", () => {
    console.log("❎ 연결 종료:", socket.id);
  });
});

server.listen(4000, () => {
  console.log("🚀 서버 실행 중 (http://localhost:4000)");
});
