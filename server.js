const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = new Map();
const WORLD = { width: 900, height: 600 };
const MAX_PLAYERS = 2;

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function publicState(room) {
  const players = {};
  for (const [id, p] of room.players) {
    players[id] = {
      id,
      slot: p.slot,
      x: p.x,
      y: p.y,
      angle: p.angle,
      hp: p.hp,
      score: p.score,
      alive: p.alive
    };
  }
  return {
    players,
    bullets: room.bullets.map(b => ({
      x: b.x, y: b.y, vx: b.vx, vy: b.vy
    })),
    status: room.status
  };
}

function resetPlayer(p) {
  if (p.slot === 1) {
    p.x = 120; p.y = WORLD.height / 2;
  } else {
    p.x = WORLD.width - 120; p.y = WORLD.height / 2;
  }
  p.hp = 100;
  p.alive = true;
  p.angle = p.slot === 1 ? 0 : Math.PI;
}

function startRoom(room) {
  room.status = "playing";
  room.bullets = [];
  for (const p of room.players.values()) {
    resetPlayer(p);
  }
}

function endRoom(room, winner) {
  room.status = "finished";
  if (winner) winner.score += 1;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

io.on("connection", socket => {
  socket.on("createRoom", () => {
    if (socket.data.roomCode) return;

    const code = makeRoomCode();
    const room = {
      players: new Map(),
      bullets: [],
      status: "waiting",
      lastTick: Date.now()
    };

    room.players.set(socket.id, {
      id: socket.id,
      slot: 1,
      x: 120,
      y: WORLD.height / 2,
      angle: 0,
      hp: 100,
      score: 0,
      alive: true,
      input: { up:false, down:false, left:false, right:false },
      shoot: false,
      lastShot: 0
    });

    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.join(code);
    socket.emit("roomCreated", { code });
    io.to(code).emit("state", publicState(room));
  });

  socket.on("joinRoom", rawCode => {
    const code = String(rawCode || "").trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) return socket.emit("errorMessage", "Room không tồn tại.");
    if (room.players.size >= MAX_PLAYERS) return socket.emit("errorMessage", "Room đã đủ 2 người.");
    if (socket.data.roomCode) return;

    room.players.set(socket.id, {
      id: socket.id,
      slot: 2,
      x: WORLD.width - 120,
      y: WORLD.height / 2,
      angle: Math.PI,
      hp: 100,
      score: 0,
      alive: true,
      input: { up:false, down:false, left:false, right:false },
      shoot: false,
      lastShot: 0
    });

    socket.data.roomCode = code;
    socket.join(code);

    startRoom(room);
    io.to(code).emit("gameStarted");
    io.to(code).emit("state", publicState(room));
  });

  socket.on("input", data => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    const p = room?.players.get(socket.id);
    if (!p) return;

    const input = data?.input || {};
    p.input = {
      up: !!input.up,
      down: !!input.down,
      left: !!input.left,
      right: !!input.right
    };

    if (Number.isFinite(data?.angle)) p.angle = data.angle;
    p.shoot = !!data?.shoot;
  });

  socket.on("restart", () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.players.size < 2) return;

    startRoom(room);
    io.to(code).emit("gameStarted");
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;

    room.players.delete(socket.id);
    room.bullets = [];
    room.status = room.players.size === 1 ? "waiting" : "finished";

    io.to(code).emit("opponentLeft");
    io.to(code).emit("state", publicState(room));

    if (room.players.size === 0) rooms.delete(code);
  });
});

function gameTick() {
  const now = Date.now();
  const dt = Math.min((now - gameTick.last) / 1000, 0.05);
  gameTick.last = now;

  for (const [code, room] of rooms) {
    if (room.status !== "playing") continue;

    for (const p of room.players.values()) {
      if (!p.alive) continue;

      const speed = 260;
      let dx = 0, dy = 0;
      if (p.input.up) dy -= 1;
      if (p.input.down) dy += 1;
      if (p.input.left) dx -= 1;
      if (p.input.right) dx += 1;

      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        p.x += (dx / len) * speed * dt;
        p.y += (dy / len) * speed * dt;
      }

      p.x = clamp(p.x, 30, WORLD.width - 30);
      p.y = clamp(p.y, 30, WORLD.height - 30);

      if (p.shoot && now - p.lastShot >= 220) {
        p.lastShot = now;
        const bulletSpeed = 650;
        room.bullets.push({
          owner: p.id,
          x: p.x + Math.cos(p.angle) * 24,
          y: p.y + Math.sin(p.angle) * 24,
          vx: Math.cos(p.angle) * bulletSpeed,
          vy: Math.sin(p.angle) * bulletSpeed
        });
      }
    }

    const nextBullets = [];
    for (const b of room.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < -20 || b.x > WORLD.width + 20 || b.y < -20 || b.y > WORLD.height + 20) {
        continue;
      }

      let hit = false;
      for (const p of room.players.values()) {
        if (p.id === b.owner || !p.alive) continue;

        if (distance(b.x, b.y, p.x, p.y) < 22) {
          p.hp -= 25;
          hit = true;

          if (p.hp <= 0) {
            p.hp = 0;
            p.alive = false;
            const shooter = room.players.get(b.owner);
            endRoom(room, shooter);
          }
          break;
        }
      }

      if (!hit) nextBullets.push(b);
    }

    room.bullets = nextBullets;
    io.to(code).emit("state", publicState(room));
  }

  setTimeout(gameTick, 50);
}
gameTick.last = Date.now();
gameTick();

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running on port " + (process.env.PORT || 3000));
});
