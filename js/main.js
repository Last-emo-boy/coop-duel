// coop-duel 主循环 / 输入 / 碰撞 / 渲染
// 只读 window.LEVELS 与 window.difficultyAt()，不写死关卡数值。
(function () {
  "use strict";

  var SUPPORTED_SCHEMA = 1;
  var W = 640;
  var H = 360;
  var PAD = 12;
  var PLAYER_SPEED = 230;
  var BULLET_SPEED = 620;
  var FIRE_CD = 0.22;
  var ENEMY_R = 13;
  var PLAYER_R = 11;
  var BATCHES_PER_WAVE = 5;

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var hud = {
    level: document.getElementById("hud-level"),
    wave: document.getElementById("hud-wave"),
    hp: document.getElementById("hud-hp"),
    score: document.getElementById("hud-score")
  };

  // ---------- 关卡加载：无状态、全量解析，出错返回 {path, code} 不抛异常 ----------
  function loadLevels() {
    var raw = window.LEVELS;
    var errors = [];
    var levels = [];

    if (!Array.isArray(raw)) {
      return { levels: [], errors: [{ path: "LEVELS", code: "NOT_ARRAY" }] };
    }

    raw.forEach(function (lv, i) {
      var base = "LEVELS[" + i + "]";
      if (!lv || typeof lv !== "object") {
        errors.push({ path: base, code: "NOT_OBJECT" });
        return;
      }
      if (typeof lv.id !== "number") {
        errors.push({ path: base + ".id", code: "MISSING_OR_NOT_NUMBER" });
        return;
      }
      if (typeof lv.schemaVersion !== "number") {
        errors.push({ path: base + ".schemaVersion", code: "MISSING" });
        return;
      }
      if (lv.schemaVersion > SUPPORTED_SCHEMA) {
        errors.push({ path: base + ".schemaVersion", code: "UNSUPPORTED_VERSION" });
        return;
      }
      var spawn = lv.spawn || {};
      if (typeof spawn.interval !== "number" || spawn.interval <= 0) {
        errors.push({ path: base + ".spawn.interval", code: "INVALID" });
        return;
      }
      if (typeof spawn.speed !== "number" || spawn.speed <= 0) {
        errors.push({ path: base + ".spawn.speed", code: "INVALID" });
        return;
      }
      if (typeof spawn.count !== "number" || spawn.count < 0) {
        errors.push({ path: base + ".spawn.count", code: "INVALID" });
        return;
      }
      var goal = lv.goal || {};
      if (typeof goal.waves !== "number" || goal.waves <= 0) {
        errors.push({ path: base + ".goal.waves", code: "INVALID" });
        return;
      }
      levels.push(lv);
    });

    return { levels: levels, errors: errors };
  }

  var loaded = loadLevels();
  var LEVELS = loaded.levels;
  if (loaded.errors.length) {
    console.warn("[coop-duel] 关卡加载失败，已跳过：", loaded.errors);
  }

  function difficultyAt(i) {
    var f = window.difficultyAt;
    if (typeof f !== "function") return 1;
    var v = f(i);
    return typeof v === "number" && isFinite(v) && v > 0 ? v : 1;
  }

  // ---------- 状态 ----------
  var state = null;

  function makePlayer(id, x, color) {
    return { id: id, x: x, y: H - 56, r: PLAYER_R, color: color, cd: 0, face: id === 0 ? 1 : -1 };
  }

  function resetRun(startLevel) {
    state = {
      levelIndex: startLevel || 0,
      score: 0,
      hp: 3,
      mode: "play", // play | paused | over | clear
      t: 0,
      last: 0,
      players: [makePlayer(0, W / 2 - 70, "#6fb4ff"), makePlayer(1, W / 2 + 70, "#ffb15e")],
      bullets: [],
      enemies: [],
      sparks: [],
      wave: 0,
      batch: 0,
      spawnTimer: 0,
      toast: "",
      toastT: 0
    };
    prepareLevel();
  }

  var level = null;

  function prepareLevel() {
    if (!LEVELS.length) {
      state.mode = "no-levels";
      return;
    }
    if (state.levelIndex >= LEVELS.length) {
      state.mode = "clear";
      return;
    }
    level = LEVELS[state.levelIndex];
    state.wave = 0;
    state.batch = 0;
    state.spawnTimer = 0.6;
    state.enemies.length = 0;
    state.bullets.length = 0;
    state.mode = "play";
    setToast(level.name ? level.name : "第 " + (state.levelIndex + 1) + " 关");
  }

  function setToast(msg) {
    state.toast = msg;
    state.toastT = 1.6;
  }

  // ---------- 输入 ----------
  var keys = Object.create(null);

  function keyName(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  window.addEventListener("keydown", function (e) {
    var k = keyName(e);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].indexOf(e.key) >= 0) e.preventDefault();
    if (!keys[k]) keys[k] = true;

    if (k === "p" && (state.mode === "play" || state.mode === "paused")) {
      state.mode = state.mode === "play" ? "paused" : "play";
    }
    if (k === "r") resetRun(state.levelIndex);
    if (k === "enter" && state.mode === "over") resetRun(0);
    if (k === "enter" && state.mode === "clear") resetRun(0);
  });

  window.addEventListener("keyup", function (e) {
    keys[keyName(e)] = false;
  });

  function held(list) {
    for (var i = 0; i < list.length; i++) if (keys[list[i]]) return true;
    return false;
  }

  // ---------- 逻辑 ----------
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function updatePlayer(p, dt, left, right, up, down, fireKey) {
    var dx = (held(right) ? 1 : 0) - (held(left) ? 1 : 0);
    var dy = (held(down) ? 1 : 0) - (held(up) ? 1 : 0);
    if (dx || dy) {
      var len = Math.hypot(dx, dy) || 1;
      p.x += (dx / len) * PLAYER_SPEED * dt;
      p.y += (dy / len) * PLAYER_SPEED * dt;
      if (dx) p.face = dx;
    }
    p.x = clamp(p.x, PAD + p.r, W - PAD - p.r);
    p.y = clamp(p.y, PAD + p.r, H - PAD - p.r);

    p.cd -= dt;
    if (p.cd <= 0 && held([fireKey])) {
      p.cd = FIRE_CD;
      state.bullets.push({
        x: p.x,
        y: p.y - p.r - 2,
        vx: 0,
        vy: -BULLET_SPEED,
        owner: p.id,
        r: 3
      });
    }
  }

  function spawnBatch() {
    var spawn = level.spawn;
    var diff = difficultyAt(state.levelIndex) * spawn.speed;
    var n = Math.max(1, Math.round(spawn.count));
    for (var i = 0; i < n; i++) {
      var r = ENEMY_R;
      var hp = state.levelIndex >= 1 ? 2 : 1;
      state.enemies.push({
        x: PAD + r + Math.random() * (W - 2 * PAD - 2 * r),
        y: -r - i * 26,
        r: r,
        vx: (Math.random() < 0.5 ? -1 : 1) * (30 + 20 * Math.random()) * diff,
        vy: (42 + 14 * Math.random()) * diff,
        hp: hp,
        maxHp: hp,
        hit: 0
      });
    }
  }

  function updateWorld(dt) {
    var p1 = state.players[0];
    var p2 = state.players[1];
    updatePlayer(p1, dt, "a", "d", "w", "s", "f");
    updatePlayer(p2, dt, "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ");

    // 子弹
    for (var i = state.bullets.length - 1; i >= 0; i--) {
      var b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -10 || b.y > H + 10) state.bullets.splice(i, 1);
    }

    // 敌人
    for (var j = state.enemies.length - 1; j >= 0; j--) {
      var e = state.enemies[j];
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.x < PAD + e.r) { e.x = PAD + e.r; e.vx = Math.abs(e.vx); }
      if (e.x > W - PAD - e.r) { e.x = W - PAD - e.r; e.vx = -Math.abs(e.vx); }
      if (e.hit > 0) e.hit -= dt;

      // 子弹命中
      for (var k = state.bullets.length - 1; k >= 0; k--) {
        var bb = state.bullets[k];
        if (Math.hypot(bb.x - e.x, bb.y - e.y) <= e.r + bb.r) {
          state.bullets.splice(k, 1);
          e.hp -= 1;
          e.hit = 0.12;
          spark(e.x, e.y, "#ffd479");
          break;
        }
      }
      if (e.hp <= 0) {
        state.enemies.splice(j, 1);
        state.score += 10;
        spark(e.x, e.y, "#ff7d7d", 10);
        continue;
      }

      // 碰到玩家：扣血并移除
      for (var pi = 0; pi < state.players.length; pi++) {
        var p = state.players[pi];
        if (Math.hypot(p.x - e.x, p.y - e.y) <= p.r + e.r) {
          state.enemies.splice(j, 1);
          damage(1, "#ff7d7d");
          break;
        }
      }
      if (state.enemies.indexOf(e) === -1) continue;

      // 漏到底部
      if (e.y - e.r > H + 6) {
        state.enemies.splice(j, 1);
        damage(1, "#ff7d7d");
        if (state.mode !== "play") return;
      }
    }

    // 粒子
    for (var s = state.sparks.length - 1; s >= 0; s--) {
      var sp = state.sparks[s];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.life -= dt;
      if (sp.life <= 0) state.sparks.splice(s, 1);
    }

    if (state.toastT > 0) state.toastT -= dt;

    // 波次推进
    if (state.mode === "play") {
      if (state.batch >= BATCHES_PER_WAVE && state.enemies.length === 0) {
        state.wave += 1;
        state.batch = 0;
        if (state.wave >= level.goal.waves) {
          state.score += 50;
          state.levelIndex += 1;
          prepareLevel();
        } else {
          state.spawnTimer = 0.9;
          setToast("第 " + (state.wave + 1) + " 波");
        }
      } else if (state.batch < BATCHES_PER_WAVE) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          spawnBatch();
          state.batch += 1;
          state.spawnTimer = Math.max(0.35, level.spawn.interval / 1000);
        }
      }
    }
  }

  function damage(n, color) {
    state.hp -= n;
    spark(state.players[0].x, state.players[0].y, color, 12);
    if (state.hp <= 0) {
      state.hp = 0;
      state.mode = "over";
    }
  }

  function spark(x, y, color, count) {
    count = count || 5;
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 40 + Math.random() * 110;
      state.sparks.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.25 + Math.random() * 0.25,
        color: color
      });
    }
  }

  // ---------- 渲染 ----------
  function drawGrid() {
    ctx.fillStyle = "#1a1f2b";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= W; x += 40) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
    }
    for (var y = 0; y <= H; y += 40) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();
    // 底部红线：漏怪线
    ctx.strokeStyle = "rgba(255,90,90,0.22)";
    ctx.beginPath();
    ctx.moveTo(0, H - 4);
    ctx.lineTo(W, H - 4);
    ctx.stroke();
  }

  function drawPlayer(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(0, -p.r);
    ctx.lineTo(p.r, p.r);
    ctx.lineTo(0, p.r * 0.55);
    ctx.lineTo(-p.r, p.r);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.fillStyle = e.hit > 0 ? "#ffffff" : "#ff7d7d";
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();
    if (e.maxHp > 1 && e.hp > 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawOverlayText(lines, color) {
    ctx.save();
    ctx.fillStyle = "rgba(10,13,20,0.72)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = color || "#e8e8e8";
    ctx.font = "600 26px system-ui, sans-serif";
    ctx.fillText(lines[0], W / 2, H / 2 - 12);
    ctx.font = "14px system-ui, sans-serif";
    ctx.globalAlpha = 0.8;
    for (var i = 1; i < lines.length; i++) {
      ctx.fillText(lines[i], W / 2, H / 2 + 18 + (i - 1) * 22);
    }
    ctx.restore();
  }

  function draw() {
    drawGrid();

    state.sparks.forEach(function (sp) {
      ctx.globalAlpha = Math.max(0, sp.life * 2.5);
      ctx.fillStyle = sp.color;
      ctx.fillRect(sp.x - 1.5, sp.y - 1.5, 3, 3);
    });
    ctx.globalAlpha = 1;

    state.enemies.forEach(drawEnemy);

    state.bullets.forEach(function (b) {
      ctx.fillStyle = "#c8f4ff";
      ctx.fillRect(b.x - 1.5, b.y - 6, 3, 10);
    });

    state.players.forEach(drawPlayer);

    if (state.toastT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, state.toastT);
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8e8e8";
      ctx.font = "600 18px system-ui, sans-serif";
      ctx.fillText(state.toast, W / 2, 44);
      ctx.restore();
    }

    if (state.mode === "paused") drawOverlayText(["已暂停", "按 P 继续"]);
    if (state.mode === "over") drawOverlayText(["倒下了", "按 R 重开本关 · 回车从头开始"], "#ff9b9b");
    if (state.mode === "clear") drawOverlayText(["全部通关！", "得分 " + state.score + " · 回车再来一次"], "#7ee0ff");
    if (state.mode === "no-levels") drawOverlayText(["没有可用关卡", "检查 js/levels.js 的 LEVELS", "细节见控制台"], "#ffb15e");
  }

  function syncHud() {
    if (!state) return;
    hud.level.textContent = Math.min(state.levelIndex + 1, LEVELS.length || 1);
    var waves = level && level.goal ? level.goal.waves : 0;
    hud.wave.textContent = (Math.min(state.wave + 1, waves || 1)) + "/" + (waves || 1);
    hud.hp.textContent = state.hp;
    hud.score.textContent = state.score;
  }

  function frame(ts) {
    if (!state.last) state.last = ts;
    var dt = Math.min((ts - state.last) / 1000, 0.05);
    state.last = ts;

    if (state.mode === "play") {
      state.t += dt;
      updateWorld(dt);
    }
    draw();
    syncHud();
    requestAnimationFrame(frame);
  }

  resetRun(0);
  requestAnimationFrame(frame);

  // 供调试/自检使用
  window.__coop = {
    loadLevels: loadLevels,
    getState: function () { return state; },
    getLevels: function () { return LEVELS; },
    errors: loaded.errors
  };
})();
