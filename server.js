const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// --- Game constants ---
const COLS = 30, ROWS = 24, TICK = 120, FOOD_COUNT = 3;
const COLORS = ['#32c832','#e03232','#3264e0','#e0c832','#c832c8','#32c8c8'];
const STARTS = [[5,5],[25,5],[5,18],[25,18],[15,5],[15,18]];
const UP=[0,-1], DOWN=[0,1], LEFT=[-1,0], RIGHT=[1,0];

let leaderboard = []; // { name, score, date } top 20 all-time

function opp(a,b){ return a[0]===-b[0] && a[1]===-b[1]; }

function randomPos(excluded) {
  let pos;
  do { pos = [Math.floor(Math.random()*COLS), Math.floor(Math.random()*ROWS)]; }
  while (excluded.has(`${pos[0]},${pos[1]}`));
  return pos;
}

function allCells(players) {
  const s = new Set();
  for (const p of Object.values(players))
    for (const [x,y] of p.snake) s.add(`${x},${y}`);
  return s;
}

// --- Room ---
class Room {
  constructor(id) {
    this.id = id;
    this.players = {};
    this.food = [];
    this.loop = null;
    this.started = false;
  }

  addPlayer(sid, name) {
    const idx = Object.keys(this.players).length % COLORS.length;
    this.players[sid] = {
      id: sid, name,
      color: COLORS[idx],
      snake: [STARTS[idx % STARTS.length].slice()],
      dir: RIGHT, nextDir: RIGHT,
      score: 0, alive: true, recorded: false,
    };
  }

  removePlayer(sid) {
    delete this.players[sid];
    if (Object.keys(this.players).length === 0) this.stop();
  }

  spawnFood() {
    const occ = allCells(this.players);
    this.food.forEach(([x,y]) => occ.add(`${x},${y}`));
    while (this.food.length < FOOD_COUNT) this.food.push(randomPos(occ));
  }

  start() {
    this.started = true;
    Object.values(this.players).forEach((p, i) => {
      p.snake = [STARTS[i % STARTS.length].slice()];
      p.dir = RIGHT; p.nextDir = RIGHT;
      p.score = 0; p.alive = true; p.recorded = false;
    });
    this.food = [];
    this.spawnFood();
    clearInterval(this.loop);
    this.loop = setInterval(() => this.tick(), TICK);
  }

  stop() {
    clearInterval(this.loop);
    this.loop = null;
    this.started = false;
  }

  tick() {
    const ps = Object.values(this.players);

    // Compute next heads
    for (const p of ps) {
      if (!p.alive) continue;
      p.dir = p.nextDir;
      p.nextHead = [p.snake[0][0]+p.dir[0], p.snake[0][1]+p.dir[1]];
    }

    // Build current occupied cells (tails will vacate, heads will arrive)
    const occ = allCells(this.players);

    // Check each alive player's next head
    for (const p of ps) {
      if (!p.alive) continue;
      const [hx,hy] = p.nextHead;
      if (hx<0||hx>=COLS||hy<0||hy>=ROWS) { p.alive=false; continue; }
      // Self: check against own body minus tail (tail will move)
      if (p.snake.slice(1,-1).some(([x,y])=>x===hx&&y===hy)) { p.alive=false; continue; }
      // Other snakes
      for (const o of ps) {
        if (o.id===p.id||!o.alive) continue;
        if (o.snake.some(([x,y])=>x===hx&&y===hy)) { p.alive=false; break; }
      }
    }

    // Apply movement
    for (const p of ps) {
      if (!p.alive) continue;
      p.snake.unshift(p.nextHead);
      const fi = this.food.findIndex(([fx,fy])=>fx===p.nextHead[0]&&fy===p.nextHead[1]);
      if (fi !== -1) { p.score += 10; this.food.splice(fi,1); }
      else p.snake.pop();
    }

    this.spawnFood();

    // Record dead players into leaderboard
    for (const p of ps) {
      if (!p.alive && !p.recorded) {
        p.recorded = true;
        leaderboard.push({ name: p.name, score: p.score, date: new Date().toLocaleDateString() });
        leaderboard.sort((a,b)=>b.score-a.score);
        if (leaderboard.length > 20) leaderboard.length = 20;
      }
    }

    // Broadcast state
    io.to(this.id).emit('state', {
      players: ps.map(p=>({ id:p.id, name:p.name, color:p.color, snake:p.snake, score:p.score, alive:p.alive })),
      food: this.food,
      lb: leaderboard.slice(0,10),
    });

    // Round over?
    const alive = ps.filter(p=>p.alive);
    if (ps.length > 1 && alive.length <= 1) {
      this.stop();
      setTimeout(() => {
        if (Object.keys(this.players).length > 0) {
          io.to(this.id).emit('round_end', { lb: leaderboard.slice(0,10) });
          setTimeout(() => { if (Object.keys(this.players).length>0) this.start(); }, 4000);
        }
      }, 500);
    }
  }
}

const rooms = {};
function getRoom(id) {
  if (!rooms[id]) rooms[id] = new Room(id);
  return rooms[id];
}

io.on('connection', socket => {
  let room = null;

  socket.on('join', ({ roomId, name }) => {
    if (room) { room.removePlayer(socket.id); socket.leave(room.id); }
    room = getRoom(roomId || 'main');
    socket.join(room.id);
    room.addPlayer(socket.id, (name||'Player').substring(0,16));
    io.to(room.id).emit('msg', `${room.players[socket.id].name} joined`);
    socket.emit('joined', { color: room.players[socket.id].color, lb: leaderboard.slice(0,10) });
    if (!room.started) room.start();
  });

  socket.on('dir', d => {
    if (!room) return;
    const p = room.players[socket.id];
    if (p && p.alive && Array.isArray(d) && !opp(d, p.dir)) p.nextDir = d;
  });

  socket.on('disconnect', () => {
    if (room) {
      const name = room.players[socket.id]?.name;
      room.removePlayer(socket.id);
      if (name) io.to(room.id).emit('msg', `${name} left`);
      if (Object.keys(room.players).length === 0) delete rooms[room.id];
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Sneak server on port ${PORT}`));
