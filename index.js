const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 배포 시엔 보안을 위해 특정 도메인으로 제한하는 게 좋습니다
    methods: ["GET", "POST"],
  },
});

const failedMap = {};
const completedMap = {};
const activeMissionMap = {};
const failureTriggers = {}; // ✅ 추가

const buildPath = path.join(__dirname, "../client/build");
app.use(express.static(buildPath));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

io.on("connection", (socket) => {
  console.log("✅ 연결됨:", socket.id);

  socket.on("mission-start", (missionId) => {
    if (!activeMissionMap[socket.id]) activeMissionMap[socket.id] = [];
    if (!activeMissionMap[socket.id].includes(missionId)) {
      activeMissionMap[socket.id].push(missionId);
    }
    io.emit("admin-mission-activate", missionId);
  });

  socket.on("check-failure", (missionId) => {
    const key = `mission_${missionId}_${socket.id}`;
    const isFailed = !!failedMap[key];
    socket.emit("failure-status", { missionId, isFailed });
  });

  socket.on("mark-failed", (missionId) => {
    const key = `mission_${missionId}_${socket.id}`;
    failedMap[key] = true;
    failureTriggers[missionId] = 1; // ✅ 트리거 활성화
    console.log(`❌ 실패 기록: ${key}`);

    emitGlobalStatus();
  });

  socket.on("clear-failure-trigger", (missionId) => {
    failureTriggers[missionId] = 0; // ✅ 트리거 제거
    console.log(`✅ 트리거 초기화: 미션 ${missionId}`);
    emitGlobalStatus();
  });

  socket.on("request-global-status", () => {
    emitGlobalStatus(socket);
  });

  socket.on("admin-reset-mission", (missionId) => {
    Object.keys(failedMap).forEach((key) => {
      if (key.startsWith(`mission_${missionId}_`)) delete failedMap[key];
    });
    Object.keys(activeMissionMap).forEach((id) => {
      activeMissionMap[id] = activeMissionMap[id].filter((m) => m !== missionId);
    });
    failureTriggers[missionId] = 0; // ✅ 리셋 시 트리거도 제거
    console.log(`🧼 미션 ${missionId} 초기화`);
    io.emit("participant-reset", missionId);
  });

  socket.on("admin-reset-all", () => {
    Object.keys(failedMap).forEach((key) => delete failedMap[key]);
    Object.keys(activeMissionMap).forEach((id) => (activeMissionMap[id] = []));
    Object.keys(failureTriggers).forEach((id) => (failureTriggers[id] = 0));
    console.log("🧼 전체 초기화");
    io.emit("participant-reset", -1);
    emitGlobalStatus();
  });

  socket.on("mission-complete", (missionId) => {
    if (!completedMap[socket.id]) completedMap[socket.id] = [];
    if (!completedMap[socket.id].includes(missionId)) {
      completedMap[socket.id].push(missionId);
    }

    Object.keys(failedMap).forEach((key) => {
      if (key.startsWith(`mission_${missionId}_`)) delete failedMap[key];
    });
    failureTriggers[missionId] = 0; // ✅ 완료 시 트리거 제거

    console.log(`🏁 미션 ${missionId} 완료`);
    io.emit("mission-complete", missionId);
    emitGlobalStatus();
  });

  socket.on("disconnect", () => {
    delete activeMissionMap[socket.id];
    console.log("❎ 연결 종료:", socket.id);
  });

  function emitGlobalStatus(toSocket = null) {
    const running = Object.entries(activeMissionMap)
      .flatMap(([sid, ids]) => ids.filter((id) => !completedMap[sid]?.includes(id)));

    const failed = Object.keys(failedMap)
      .map((k) => Number(k.split("_")[1]))
      .filter((v, i, a) => a.indexOf(v) === i);

    const completed = Object.values(completedMap).flat();

    const status = {
      running,
      failed,
      completed,
      failureTriggers,
    };

    if (toSocket) {
      toSocket.emit("global-status", status);
    } else {
      io.emit("global-status", status);
    }
  }
});

server.listen(4000, () => {
  console.log("🚀 서버 실행 중 (http://localhost:4000)");
});
