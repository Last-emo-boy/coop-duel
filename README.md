# coop-duel

双人合作对打小游戏（单页，无构建）。

## 运行

直接用浏览器打开 `index.html`。选关界面用 `↑↓` 选择、`Enter` 开始；游戏中 `P` 暂停、`R` 重开本关、`L` 回到选关。

## 目录结构

```
index.html            页面与 HUD
js/errors.js          loader 冻结的 8 个错误码与 makeError 工厂
js/loader.js          无状态关卡校验 + loadAll（并发、下标回填、io/parse）
js/levels.js          关卡数据与 difficultyAt()
js/save.js            1.x -> 2.0 存档迁移（纯计算）
js/main.js            输入 / 逻辑 / 碰撞 / 渲染 / 选关
scripts/migrate-save.mjs   存档迁移 CLI（临时文件 + rename）
tests/loader/         用例、清单与逐条运行器
docs/loader-contract.md    loader 契约 v1
docs/collaboration-report.md   协作记录报告
```

## 约定

- `main.js` 只读取 `window.LEVELS` 和 `window.difficultyAt()`，不写死关卡数值。
- 关卡加载一律走 `js/loader.js`：无状态、不缓存、全量解析，出错返回 `path` + `code` 而不抛异常。
- 选关界面里加载失败的关卡置灰：主行写原因，下一行小字写 `path · code`。
- 错误码、校验顺序与版本口径见 `docs/loader-contract.md`。

## 验证

```bash
node tests/loader/run.mjs --self-check
```

单条用例 10 秒超时；超时或崩溃只记这一条失败，其余跑完再汇总；一条不过退出码为 1（卡合 main）。
当前 gate 用例 13 条。

## 存档迁移

```bash
node scripts/migrate-save.mjs save.json [out.json] [--map]
```

按 `js/save.js` 的 `ID_MAP`（旧 ID → 新 ID）迁移一次；对不上新关卡的旧条目标失效、不删除，读不出来的部分保留原样。
