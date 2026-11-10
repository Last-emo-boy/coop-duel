// 存档 1.x -> 2.0 迁移：按旧 ID -> 新 ID 映射表迁移一次。
// 对不上新关卡的条目不删除，只标记失效；迁移函数纯计算，落盘由 scripts/migrate-save.mjs 负责。
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CoopSave = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var OLD_SAVE_VERSION = 1;
  var NEW_SAVE_VERSION = 2;

  // 旧 ID -> 新 ID。2.0 关卡 ID 以这张表为准，改关卡时同步改这里。
  var ID_MAP = Object.freeze({ 1: 101, 2: 102, 3: 103 });
  var NEW_LEVEL_IDS = Object.freeze(Object.keys(ID_MAP).map(function (key) { return ID_MAP[key]; }));

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // migrateSave 幂等：已是 2.0 的原样返回；坏输入返回空存档并给出问题，不抛异常。
  function migrateSave(input, options) {
    options = options || {};
    var map = options.map || ID_MAP;
    var validIds = options.validIds || NEW_LEVEL_IDS;
    var valid = Object.create(null);
    validIds.forEach(function (id) { valid[String(id)] = true; });

    if (!isObject(input)) {
      return {
        save: { schemaVersion: NEW_SAVE_VERSION, levels: {}, invalid: [], unmatched: {} },
        changed: true,
        migrated: 0,
        invalidated: [],
        unmatched: [],
        problem: "save is not an object"
      };
    }
    if (input.schemaVersion === NEW_SAVE_VERSION) {
      return { save: input, changed: false, migrated: 0, invalidated: [], unmatched: [] };
    }

    var oldLevels = isObject(input.levels) ? input.levels : {};
    var save = {
      schemaVersion: NEW_SAVE_VERSION,
      levels: {},
      invalid: [],
      unmatched: {},
      migratedFrom: isObject(input) ? input : null
    };
    delete save.migratedFrom;
    save.migratedFrom = { version: input.version === undefined ? OLD_SAVE_VERSION : input.version };
    if (input.unlocked !== undefined) save.unlocked = input.unlocked;

    var migrated = 0;
    var invalidated = [];
    var unmatched = [];

    Object.keys(oldLevels).forEach(function (oldId) {
      var entry = oldLevels[oldId];
      var mapped = map[oldId];
      if (mapped === undefined) {
        save.unmatched[oldId] = clone(entry);
        unmatched.push(String(oldId));
        return;
      }
      var newId = String(mapped);
      if (!valid[newId]) {
        save.unmatched[oldId] = clone(entry);
        invalidated.push(newId);
        save.invalid.push(newId);
        return;
      }
      if (save.levels[newId] === undefined) {
        save.levels[newId] = clone(entry);
        migrated += 1;
        return;
      }
      var previous = save.levels[newId];
      save.levels[newId] = {
        cleared: Boolean(previous.cleared || entry.cleared),
        best: Math.max(Number(previous.best) || 0, Number(entry.best) || 0)
      };
      migrated += 1;
    });

    save.invalid.sort();
    return { save: save, changed: true, migrated: migrated, invalidated: invalidated, unmatched: unmatched };
  }

  return {
    OLD_SAVE_VERSION: OLD_SAVE_VERSION,
    NEW_SAVE_VERSION: NEW_SAVE_VERSION,
    ID_MAP: ID_MAP,
    NEW_LEVEL_IDS: NEW_LEVEL_IDS,
    migrateSave: migrateSave
  };
});
