// coop-duel 关卡 loader（契约 v1）：无状态、不缓存、全量解析、不抛异常。
// 浏览器里用 window.CoopLoader，Node 里 require 同一个文件，验证运行器复用这份解析逻辑。
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./errors.js"));
  } else {
    root.CoopLoader = factory(root.CoopErrors);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (E) {
  "use strict";

  var CODE = E.CODE;
  var makeError = E.makeError;
  var SUPPORTED_MAJOR = 1;
  var SUPPORTED_MINOR = 0;
  var ENEMY_TYPES = ["grunt", "runner", "tank"];
  var DEFAULT_CONCURRENCY = 8;
  var LEVEL_FIELDS = ["schemaVersion", "id", "name", "spawn", "goal", "arena", "walls", "spawnPoints", "waves", "hpPerWave"];

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function versionOf(value) {
    var major = Math.trunc(value);
    var minor = Math.round((value - major) * 10);
    return { major: major, minor: minor, minorHigher: major === SUPPORTED_MAJOR && minor > SUPPORTED_MINOR };
  }

  function typeError(context) {
    return context.minorHigher ? CODE.UNSUPPORTED_VERSION : CODE.BAD_TYPE;
  }

  // validateLevel 返回 { ok, level, errors, warnings }；同一字段只报第一条，缺失→类型→取值。
  function validateLevel(raw, index) {
    var errors = [];
    var warnings = [];
    var reject = false;
    function fail(code, path, expected, actual, message) {
      reject = true;
      var error = makeError(code, path, expected, actual);
      if (message) E.withMessage(error, message);
      errors.push(error);
      return error;
    }

    if (!isObject(raw)) {
      fail(CODE.NOT_OBJECT, "", "object", raw === null ? null : typeof raw);
      return { ok: false, level: null, errors: errors, warnings: warnings };
    }

    if (!has(raw, "schemaVersion")) {
      fail(CODE.BAD_VALUE, "schemaVersion", "number", undefined);
      return { ok: false, level: null, errors: errors, warnings: warnings };
    }
    if (typeof raw.schemaVersion !== "number" || !isFinite(raw.schemaVersion)) {
      fail(CODE.BAD_VALUE, "schemaVersion", "number", raw.schemaVersion);
      return { ok: false, level: null, errors: errors, warnings: warnings };
    }
    var version = versionOf(raw.schemaVersion);
    if (version.major !== SUPPORTED_MAJOR) {
      fail(CODE.UNSUPPORTED_VERSION, "schemaVersion", "major " + SUPPORTED_MAJOR, raw.schemaVersion);
      return { ok: false, level: null, errors: errors, warnings: warnings };
    }
    if (version.minorHigher) {
      warnings.push({ path: "schemaVersion", message: "future minor " + raw.schemaVersion + " read as " + SUPPORTED_MAJOR + "." + SUPPORTED_MINOR });
    }
    var context = { minorHigher: version.minorHigher };

    if (!has(raw, "id")) {
      fail(CODE.BAD_VALUE, "id", "number", undefined);
    } else if (typeof raw.id !== "number" || !isFinite(raw.id)) {
      fail(CODE.BAD_VALUE, "id", "number", raw.id);
    }

    if (has(raw, "name") && typeof raw.name !== "string") {
      fail(CODE.BAD_VALUE, "name", "string", raw.name);
    }

    var arena = null;
    if (has(raw, "arena")) {
      if (!isObject(raw.arena)) {
        fail(CODE.BAD_VALUE, "arena", "object", raw.arena);
      } else {
        arena = raw.arena;
        if (typeof arena.w !== "number" || !isFinite(arena.w) || arena.w <= 0) {
          fail(CODE.BAD_VALUE, "arena.w", "number > 0", arena.w);
          arena = null;
        } else if (typeof arena.h !== "number" || !isFinite(arena.h) || arena.h <= 0) {
          fail(CODE.BAD_VALUE, "arena.h", "number > 0", arena.h);
          arena = null;
        }
      }
    }

    if (!has(raw, "spawn")) {
      fail(CODE.BAD_VALUE, "spawn", "object", undefined);
    } else if (!isObject(raw.spawn)) {
      fail(CODE.BAD_VALUE, "spawn", "object", raw.spawn);
    }

    if (!has(raw, "goal")) {
      fail(CODE.BAD_VALUE, "goal", "object", undefined);
    } else if (!isObject(raw.goal)) {
      fail(CODE.BAD_VALUE, "goal", "object", raw.goal);
    }

    if (isObject(raw.spawn)) {
      var spawn = raw.spawn;
      if (!has(spawn, "interval")) {
        fail(CODE.BAD_VALUE, "spawn.interval", "number", undefined);
      } else if (typeof spawn.interval !== "number" || !isFinite(spawn.interval)) {
        fail(CODE.BAD_VALUE, "spawn.interval", "number", spawn.interval);
      } else if (spawn.interval <= 0) {
        fail(CODE.BAD_VALUE, "spawn.interval", "number > 0", spawn.interval);
      }

      if (!has(spawn, "speed")) {
        fail(CODE.BAD_VALUE, "spawn.speed", "number", undefined);
      } else if (typeof spawn.speed !== "number" || !isFinite(spawn.speed)) {
        fail(CODE.BAD_VALUE, "spawn.speed", "number", spawn.speed);
      } else if (spawn.speed <= 0) {
        fail(CODE.BAD_VALUE, "spawn.speed", "number > 0", spawn.speed);
      }

      if (!has(spawn, "count")) {
        fail(CODE.BAD_VALUE, "spawn.count", "integer >= 0", undefined);
      } else if (typeof spawn.count !== "number" || !isFinite(spawn.count)) {
        fail(CODE.BAD_VALUE, "spawn.count", "integer >= 0", spawn.count);
      } else if (!Number.isInteger(spawn.count) || spawn.count < 0) {
        fail(CODE.BAD_VALUE, "spawn.count", "integer >= 0", spawn.count);
      }
    }

    if (isObject(raw.goal)) {
      if (!has(raw.goal, "waves")) {
        fail(CODE.BAD_VALUE, "goal.waves", "integer > 0", undefined);
      } else if (typeof raw.goal.waves !== "number" || !isFinite(raw.goal.waves)) {
        fail(CODE.BAD_VALUE, "goal.waves", "integer > 0", raw.goal.waves);
      } else if (!Number.isInteger(raw.goal.waves) || raw.goal.waves <= 0) {
        fail(CODE.BAD_VALUE, "goal.waves", "integer > 0", raw.goal.waves);
      }
    }

    validateWalls(raw, arena, fail);
    validatePoints(raw, "spawnPoints", arena, context, fail);
    validateWaves(raw, context, fail);

    Object.keys(raw).forEach(function (key) {
      if (LEVEL_FIELDS.indexOf(key) === -1) warnings.push({ path: key, message: "unknown field ignored" });
    });

    if (reject) return { ok: false, level: null, errors: errors, warnings: warnings };

    var level = {};
    LEVEL_FIELDS.forEach(function (key) {
      if (!has(raw, key)) return;
      level[key] = raw[key];
    });
    if (isObject(raw.spawn)) {
      level.spawn = {};
      Object.keys(raw.spawn).forEach(function (key) { level.spawn[key] = raw.spawn[key]; });
      var rounded = round2(level.spawn.speed);
      if (rounded !== level.spawn.speed) {
        warnings.push({ path: "spawn.speed", message: "clamped " + level.spawn.speed + " -> " + rounded });
        level.spawn.speed = rounded;
      }
    }
    return { ok: true, level: level, errors: errors, warnings: warnings };
  }

  function validateWalls(raw, arena, fail) {
    if (!has(raw, "walls")) return;
    if (!Array.isArray(raw.walls)) {
      fail(CODE.NOT_ARRAY, "walls", "array", raw.walls);
      return;
    }
    raw.walls.forEach(function (wall, i) {
      var base = "walls[" + i + "]";
      if (!isObject(wall)) {
        fail(CODE.BAD_VALUE, base, "object", wall);
        return;
      }
      ["x", "y", "w", "h"].forEach(function (key) {
        var value = wall[key];
        if (typeof value !== "number" || !isFinite(value)) {
          fail(CODE.BAD_VALUE, base + "." + key, "number", value);
        } else if (value < 0 || (key === "w" || key === "h") && value === 0) {
          fail(CODE.BAD_VALUE, base + "." + key, key === "w" || key === "h" ? "number > 0" : "number >= 0", value);
        }
      });
      if (!arena || typeof wall.x !== "number" || typeof wall.y !== "number" || typeof wall.w !== "number" || typeof wall.h !== "number") return;
      if (wall.x + wall.w > arena.w) fail(CODE.BAD_VALUE, base + ".x", "x + w <= arena.w", wall.x + wall.w);
      if (wall.y + wall.h > arena.h) fail(CODE.BAD_VALUE, base + ".y", "y + h <= arena.h", wall.y + wall.h);
    });
  }

  function checkType(value, path, context, fail) {
    if (typeof value !== "string") {
      fail(CODE.BAD_VALUE, path, "string", value);
      return;
    }
    if (ENEMY_TYPES.indexOf(value) === -1) {
      fail(typeError(context), path, ENEMY_TYPES.join(" | "), value);
    }
  }

  function validatePoints(raw, key, arena, context, fail) {
    if (!has(raw, key)) return;
    if (!Array.isArray(raw[key])) {
      fail(CODE.NOT_ARRAY, key, "array", raw[key]);
      return;
    }
    raw[key].forEach(function (point, i) {
      var base = key + "[" + i + "]";
      if (!isObject(point)) {
        fail(CODE.BAD_VALUE, base, "object", point);
        return;
      }
      ["x", "y"].forEach(function (axis) {
        if (typeof point[axis] !== "number" || !isFinite(point[axis]) || point[axis] < 0) {
          fail(CODE.BAD_VALUE, base + "." + axis, "number >= 0", point[axis]);
        }
      });
      if (arena && typeof point.x === "number" && typeof point.y === "number") {
        if (point.x > arena.w) fail(CODE.BAD_VALUE, base + ".x", "x <= arena.w", point.x);
        if (point.y > arena.h) fail(CODE.BAD_VALUE, base + ".y", "y <= arena.h", point.y);
      }
      if (has(point, "type")) checkType(point.type, base + ".type", context, fail);
    });
  }

  function validateWaves(raw, context, fail) {
    if (!has(raw, "waves")) return;
    if (!Array.isArray(raw.waves)) {
      fail(CODE.NOT_ARRAY, "waves", "array", raw.waves);
      return;
    }
    raw.waves.forEach(function (wave, i) {
      var base = "waves[" + i + "]";
      if (!isObject(wave)) {
        fail(CODE.BAD_VALUE, base, "object", wave);
        return;
      }
      if (!has(wave, "hp") || wave.hp === null || wave.hp === undefined) {
        fail(CODE.BAD_VALUE, base + ".hp", "number", undefined);
      } else if (typeof wave.hp !== "number" || !isFinite(wave.hp) || wave.hp < 0) {
        fail(CODE.BAD_VALUE, base + ".hp", "number >= 0", wave.hp);
      }
      if (has(wave, "atMs") && (typeof wave.atMs !== "number" || !isFinite(wave.atMs) || wave.atMs < 0)) {
        fail(CODE.BAD_VALUE, base + ".atMs", "number >= 0", wave.atMs);
      }
      if (has(wave, "count") && (typeof wave.count !== "number" || !Number.isInteger(wave.count) || wave.count < 0)) {
        fail(CODE.BAD_VALUE, base + ".count", "integer >= 0", wave.count);
      }
      if (has(wave, "type")) checkType(wave.type, base + ".type", context, fail);
    });
  }

  // validateAll 解析内存里的 LEVELS 数组；结果按输入下标回填，重复 id 的后者判失败。
  function validateAll(rawLevels, options) {
    options = options || {};
    if (!Array.isArray(rawLevels)) {
      return {
        ok: false,
        results: [],
        levels: [],
        errors: [makeError(CODE.NOT_ARRAY, "", "array", rawLevels)],
        warnings: []
      };
    }
    var results = new Array(rawLevels.length);
    var levels = [];
    var errors = [];
    var warnings = [];
    var seen = Object.create(null);

    rawLevels.forEach(function (raw, i) {
      var path = "LEVELS[" + i + "]";
      var checked = validateLevel(raw, i);
      if (checked.ok) {
        var id = checked.level.id;
        if (seen[id]) {
          var duplicate = makeError(CODE.DUPLICATE_ID, "id", "unique", id);
          checked.ok = false;
          checked.errors = [duplicate];
          checked.level = null;
        } else {
          seen[id] = true;
          levels.push(checked.level);
        }
      }
      warnings = warnings.concat(checked.warnings);
      checked.errors.forEach(function (error) {
        errors.push({ path: path, code: error.code, field: error.path, expected: error.expected, actual: error.actual, message: error.message });
      });
      results[i] = {
        index: i,
        path: path,
        ok: checked.ok,
        code: checked.ok ? undefined : checked.errors[0].code,
        errors: checked.ok ? undefined : checked.errors,
        warnings: checked.warnings.length ? checked.warnings : undefined,
        data: checked.ok ? checked.level : undefined
      };
    });

    return {
      ok: levels.length === rawLevels.length && errors.length === 0,
      results: results,
      levels: levels,
      errors: errors,
      warnings: warnings
    };
  }

  // loadAll 供验证运行器使用：并发读取、按下标回填、读盘/解析失败不重试也不判整批。
  async function loadAll(inputs, options) {
    options = options || {};
    var concurrency = Math.max(1, Math.min(options.concurrency || DEFAULT_CONCURRENCY, inputs.length || 1));
    var read = options.read;
    var results = new Array(inputs.length);
    var cursor = 0;

    async function one(input) {
      var path = typeof input === "string" ? input : input.path;
      var data = typeof input === "string" ? undefined : input.data;
      var mtime = typeof input === "string" ? undefined : input.mtime;

      if (data === undefined) {
        if (typeof read !== "function") {
          return { ok: false, path: path, code: CODE.IO_ERROR, message: "no reader for " + path, mtime: mtime };
        }
        try {
          var loaded = await read(path);
          if (typeof loaded === "string") {
            data = loaded;
          } else if (loaded && typeof loaded === "object") {
            data = loaded.text;
            mtime = loaded.mtime;
          }
        } catch (error) {
          return { ok: false, path: path, code: CODE.IO_ERROR, message: String((error && error.message) || error), mtime: mtime };
        }
      }

      var parsed = data;
      if (typeof data === "string") {
        try {
          parsed = JSON.parse(data);
        } catch (error) {
          var actual = (error && error.message) || String(error);
          return { ok: false, path: path, code: CODE.PARSE_ERROR, expected: "json", actual: actual, mtime: mtime };
        }
      }

      var checked = validateLevel(parsed, undefined);
      var result = {
        ok: checked.ok,
        path: path,
        code: checked.ok ? undefined : checked.errors[0].code,
        errors: checked.ok ? undefined : checked.errors,
        warnings: checked.warnings.length ? checked.warnings : undefined,
        data: checked.ok ? checked.level : undefined,
        mtime: mtime
      };
      return result;
    }

    async function worker() {
      while (cursor < inputs.length) {
        var index = cursor++;
        results[index] = await one(inputs[index]);
      }
    }

    var runners = [];
    for (var i = 0; i < concurrency; i++) runners.push(worker());
    await Promise.all(runners);

    var seen = Object.create(null);
    results.forEach(function (result) {
      if (!result || !result.ok) return;
      var id = result.data.id;
      if (seen[id]) {
        result.ok = false;
        result.code = CODE.DUPLICATE_ID;
        result.errors = [makeError(CODE.DUPLICATE_ID, "id", "unique", id)];
        result.data = undefined;
      } else {
        seen[id] = true;
      }
    });
    return results;
  }

  return {
    CODE: CODE,
    CODES: E.CODES,
    SUPPORTED_MAJOR: SUPPORTED_MAJOR,
    SUPPORTED_MINOR: SUPPORTED_MINOR,
    ENEMY_TYPES: ENEMY_TYPES,
    DEFAULT_CONCURRENCY: DEFAULT_CONCURRENCY,
    validateLevel: validateLevel,
    validateAll: validateAll,
    loadAll: loadAll,
    round2: round2
  };
});
