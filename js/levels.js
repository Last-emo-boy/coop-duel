// 关卡与难度曲线（占位版：接口已定，数值由 Tickey 替换）
// 约定：
//   1. 每关一个对象，一关一文件时可以拆成单独文件再合并到这个数组里；
//   2. 顶层 schemaVersion 表示关卡格式版本，main.js 只接受 <= 自己支持的版本；
//   3. main.js 只读这些字段，不关心数值怎么来的。
window.LEVELS = [
  {
    schemaVersion: 1,
    id: 1,
    name: "热身",
    spawn: { interval: 1500, speed: 1.0, count: 1 },
    goal: { waves: 2 }
  },
  {
    schemaVersion: 1,
    id: 2,
    name: "夹击",
    spawn: { interval: 1150, speed: 1.15, count: 2 },
    goal: { waves: 3 }
  },
  {
    schemaVersion: 1,
    id: 3,
    name: "收网",
    spawn: { interval: 850, speed: 1.35, count: 2 },
    goal: { waves: 4 }
  }
];

// 难度曲线：给定关卡序号返回倍率，调用方不做插值假设
window.difficultyAt = function (levelIndex) {
  return 1 + levelIndex * 0.18;
};
