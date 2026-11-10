# coop-duel 协作记录报告

- 项目仓库：https://github.com/Verayi2007/coop-duel
- 交付时间：2026-11-10 22:00 前
- 牵头：w33d（本工单）
- 需求人：孙欣怡
- 参与：飞飞（主循环 / 渲染）、Tickey（关卡 JSON / 难度曲线 / loader 口径）、陈予谦、张正明

## 1. 分工

| 角色 | 负责 | 产出 |
| --- | --- | --- |
| 飞飞 | 主循环、渲染、选关与置灰交互口径 | `js/main.js` 主循环；交接三项待办 |
| Tickey | 关卡数据、难度曲线、loader 契约口径 | 关卡数值与版本 / 并发 / 失败判定口径；`levels/` 与自检脚本规划 |
| w33d（本工单） | 整合落地 | loader 模块、选关与失败置灰、存档迁移、验证运行器、文档 |
| 孙欣怡 | 需求与验收 | 硬性截止与交付物 |
| 张正明 | 合并与发版 | 合并口径、发版流程（待定） |

## 2. 已确认的关键口径

来源为群会话与 issue #1~#3，已固化到 `docs/loader-contract.md`：

1. 错误码冻结 8 个；同一字段只报第一条，顺序 缺失 → 类型 → 取值。
2. `path` 相对关卡文件内部，不带 `levels[i]`。
3. 版本只比 major；高 minor 照常读取、未知字段告警；只有 major 不同或高 minor + 未知 `type` 报 `unsupported_version`。
4. 墙越界按 `arena.w/h` 判，`x + w == arena.w` 不算越界；`speed` 保留两位小数；缺字段报 `bad_value` + `actual: undefined`。
5. loader 无状态、不缓存；`loadAll([path])` 支持单关热更新。
6. 并发读取、按下标回填；并发度默认 8，超出排队；读盘失败不重试，记 `io_error`。
7. 存档 1.x → 2.0 迁移一次，带旧 ID → 新 ID 映射表；对不上新关卡的条目标失效、不删除。
8. 验证运行器单条超时 10 秒；超时或崩溃只记该条并继续；一条不过卡合 main。
9. 坏样本只断言 `path` + `code`，好样本比对完整输出；gate 只认 `tests/loader/`。

## 3. 本次交付

- `js/errors.js`：8 个错误码与 `makeError` 工厂。
- `js/loader.js`：无状态校验与 `loadAll`（并发、下标回填、io/parse 分类、重复 id）。
- `js/main.js`：接入 loader；新增选关界面，坏关卡置灰，主行写原因，下一行小字写 `path · code`；运行期异常退回选关。
- `js/save.js` + `scripts/migrate-save.mjs`：存档迁移，临时文件 + rename 原子替换；无映射条目原样保留，对不上新关卡的标失效。
- `tests/loader/`：用例清单 + 逐条子进程运行器；单条 10 秒超时，超时/崩溃只记该条。
- `docs/loader-contract.md`：契约文档。
- `README.md`：目录、运行、验证与口径说明。

## 4. 验证

- `node tests/loader/run.mjs --self-check`：13/13 通过；自检覆盖 `not_array`、并发顺序、超时归类、崩溃归类。
- 存档迁移：旧档 3 条迁移成功、无映射条目保留、重复迁移幂等。
- 选关渲染：用应用自身的绘制代码在 Node canvas 上渲染，见 `docs/images/`。

## 5. 待定与风险

- 合 main 权限与发版流程仍等张正明确认；本工单只产出本地 patch，不推送、不开 PR。
- 2.0 关卡 JSON（`levels/index.json`、难度曲线）由 Tickey 的 PR 落地；本工单的迁移映射表 `1→101, 2→102, 3→103` 需与那份 PR 对齐，如不一致改 `js/save.js` 的 `ID_MAP` 一处即可。
- `tools/check-levels.mjs` 只做关卡自检、不参与 gate；gate 只认 `tests/loader/`。
- 选关界面为 canvas 绘制；截图由应用代码在无头 canvas 上渲染，未使用真实浏览器截图。

## 6. 时间线（2026-11-10）

- 19:xx–20:18：飞飞与 Tickey 对齐 loader 契约、并发/失败判定、存档与运行器口径；飞飞交接三项待办。
- 20:24：孙欣怡要求牵头丰富整个项目，22:00 前交付仓库地址与协作记录报告。
- 20:26：陈予谦要求直接提 PR（本工单无 GitHub 写权限，按本地 patch 交付）。
- 20:27–21:xx：w33d 完成 loader、选关、存档迁移、运行器与文档，本地验证通过。
