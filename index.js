const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const TOTAL_MISSIONS = 7;
const missionDurations = {
  1: 8,
  2: 300,
  3: 300,
  4: 300,
  5: 300,
  6: 30,
  7: 5,
};

const missionStatus = {};
for (let i = 1; i <= TOTAL_MISSIONS; i++) {
  missionStatus[i] = {
    reset: false,
    success: false,
    failed: false,
    inProgress: false,
    startTime: null,
    duration: missionDurations[i],
  };
}

const getRemainingTime = (m) => {
  if (!m.inProgress || !m.startTime) return m.duration;
  const elapsed = Math.floor((Date.now() - m.startTime) / 1000);
  const remain = Math.max(m.duration - elapsed, 0);
  if (remain === 0) {
    m.failed = true;
    m.inProgress = false;
    m.startTime = null;
  }
  return remain;
};

io.on("connection", (socket) => {
  console.log("✅ 연결됨:", socket.id);

  socket.on("request-global-status", () => {
    const running = [], failed = [], completed = [], durations = {};
    for (let i = 1; i <= TOTAL_MISSIONS; i++) {
      const m = missionStatus[i];
      durations[i] = getRemainingTime(m);
      if (m.inProgress) running.push(i);
      if (m.failed) failed.push(i);
      if (m.success) completed.push(i);
    }
    socket.emit("global-status", {
      running,
      failed,
      completed,
      durations,
    });
  });

  socket.on("mission-start", (missionId) => {
    const otherRunning = Object.entries(missionStatus).some(
      ([id, m]) => Number(id) !== missionId && m.inProgress
    );
    const hasFailure = Object.values(missionStatus).some((m) => m.failed);

    if (otherRunning || hasFailure) return;

    if (missionStatus[missionId]) {
      const m = missionStatus[missionId];
      m.inProgress = true;
      m.startTime = Date.now();
      m.failed = false;
      io.emit("admin-mission-activate", missionId);
      io.emit("global-status", generateGlobalStatus());
    }
  });

  socket.on("mark-failed", (missionId) => {
    const m = missionStatus[missionId];
    if (m) {
      m.failed = true;
      m.inProgress = false;
      m.startTime = null;
      io.emit("global-status", generateGlobalStatus());
    }
  });

  socket.on("mission-complete", (missionId) => {
    const m = missionStatus[missionId];
    if (m && !m.success) {
      m.success = true;
      m.failed = false;
      m.inProgress = false;
      m.startTime = null;
      io.emit("mission-complete", missionId);
      io.emit("global-status", generateGlobalStatus());
    }
  });

  socket.on("admin-reset-mission", (missionId) => {
    if (missionStatus[missionId]) {
      missionStatus[missionId] = {
        reset: true,
        success: false,
        failed: false,
        inProgress: false,
        startTime: null,
        duration: missionDurations[missionId],
      };
      io.emit("participant-reset", missionId);
      setTimeout(() => {
        missionStatus[missionId].reset = false;
        io.emit("global-status", generateGlobalStatus());
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
        startTime: null,
        duration: missionDurations[i],
      };
    }
    io.emit("participant-reset", -1);
    setTimeout(() => {
      for (let i = 1; i <= TOTAL_MISSIONS; i++) {
        missionStatus[i].reset = false;
      }
      io.emit("global-status", generateGlobalStatus());
    }, 100);
  });

  socket.on("disconnect", () => {
    console.log("❎ 연결 종료:", socket.id);
  });
});

const generateGlobalStatus = () => {
  const running = [], failed = [], completed = [], durations = {};
  for (let i = 1; i <= TOTAL_MISSIONS; i++) {
    const m = missionStatus[i];
    durations[i] = getRemainingTime(m);
    if (m.inProgress) running.push(i);
    if (m.failed) failed.push(i);
    if (m.success) completed.push(i);
  }
  return { running, failed, completed, durations };
};

server.listen(4000, () => {
  console.log("🚀 서버 실행 중 (http://localhost:4000)");
});
