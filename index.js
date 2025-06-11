const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 실패 기록: { "mission_1_socketId": true }
const failedMap = {};

const completedMap = {};      // ✅ 추가: { socket.id: [1, 2] }

// 현재 실행 중인 미션: { socket.id: [1, 2] }
const activeMissionMap = {};

const buildPath = path.join(__dirname, "../client/build");
app.use(express.static(buildPath));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

io.on("connection", (socket) => {
  console.log("✅ 연결됨:", socket.id);

  // 🔄 미션 시작
  socket.on("mission-start", (missionId) => {
    if (!activeMissionMap[socket.id]) {
      activeMissionMap[socket.id] = [];
    }
    if (!activeMissionMap[socket.id].includes(missionId)) {
      activeMissionMap[socket.id].push(missionId);
    }

    io.emit("admin-mission-activate", missionId); // 관리자 동기화
  });

  // ✅ 실패 여부 체크
  socket.on("check-failure", (missionId) => {
    const key = `mission_${missionId}_${socket.id}`;
    const isFailed = !!failedMap[key];
    socket.emit("failure-status", { missionId, isFailed });
  });

  // ❌ 실패 기록
  socket.on("mark-failed", (missionId) => {
  const key = `mission_${missionId}_${socket.id}`;
  failedMap[key] = true;
  console.log(`❌ 실패 기록: ${key}`);

  // 완료된 미션 제거된 running 목록 생성
  const filteredRunning = Object.entries(activeMissionMap)
    .flatMap(([sid, ids]) =>
      ids.filter((id) => !completedMap[sid]?.includes(id))
    );

  const failedList = Object.keys(failedMap)
    .map((k) => Number(k.split("_")[1]))
    .filter((v, i, a) => a.indexOf(v) === i);

  const completedList = Object.values(completedMap).flat();

  io.emit("global-status", {
    running: filteredRunning,
    failed: failedList,
    completed: completedList,
  });
});

  // 🌐 상태 요청 (참가자 페이지에서 요청)
  socket.on("request-global-status", () => {
    const running = Object.entries(activeMissionMap)
    .flatMap(([sid, ids]) =>
      ids.filter((id) => !completedMap[sid]?.includes(id))
    );

  const failed = Object.keys(failedMap)
    .map((k) => Number(k.split("_")[1]))
    .filter((v, i, a) => a.indexOf(v) === i);

  const completed = Object.values(completedMap).flat();

  socket.emit("global-status", {
    running,
    failed,
    completed,
  });
  });

  // 🔄 단일 미션 초기화
  socket.on("admin-reset-mission", (missionId) => {
    Object.keys(failedMap).forEach((key) => {
      if (key.startsWith(`mission_${missionId}_`)) delete failedMap[key];
    });
    Object.keys(activeMissionMap).forEach((id) => {
      activeMissionMap[id] = activeMissionMap[id].filter((m) => m !== missionId);
    });
    console.log(`🧼 미션 ${missionId} 실패 초기화`);
    io.emit("participant-reset", missionId);
  });

  // 🔄 전체 초기화
  socket.on("admin-reset-all", () => {
    Object.keys(failedMap).forEach((key) => delete failedMap[key]);
    Object.keys(activeMissionMap).forEach((id) => (activeMissionMap[id] = []));
    console.log("🧼 전체 실패 초기화");
    io.emit("participant-reset", -1);
  });

  socket.on("mission-complete", (missionId) => {
  if (!completedMap[socket.id]) completedMap[socket.id] = [];
  if (!completedMap[socket.id].includes(missionId)) {
    completedMap[socket.id].push(missionId);
  }
  console.log(`🏁 미션 ${missionId} 완료`);
  io.emit("mission-complete", missionId);

  // ✅ global-status 재전송
  io.emit("global-status", {
    running: Object.values(activeMissionMap).flat(),
    failed: Object.keys(failedMap)
      .map((k) => Number(k.split("_")[1]))
      .filter((v, i, a) => a.indexOf(v) === i),
    completed: Object.values(completedMap).flat(),
  });
});

  
  socket.on("disconnect", () => {
    delete activeMissionMap[socket.id];
    console.log("❎ 연결 종료:", socket.id);
  });
});

server.listen(4000, () => {
  console.log("🚀 서버 실행 중 (http://localhost:4000)");
});
