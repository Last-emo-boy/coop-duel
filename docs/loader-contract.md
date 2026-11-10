# 关卡 loader 契约 v1

本文件把 issue #1（校验与错误码）、#2（并发与失败判定）、#3（拆分与流程）里已经确认的口径落到代码。
实现见 `js/errors.js`、`js/loader.js`，用例见 `tests/loader/`。

## 1. 错误码（冻结 8 个）

`js/errors.js` 的 `CODE` 是唯一来源，下游只通过 `makeError(code, field, expected, actual)` 造错误对象。

| code | 含义 |
| --- | --- |
| `bad_value` | 缺字段、类型不对、取值越界，统一用它；靠 `expected` / `actual` 区分 |
| `bad_type` | 只用于敌人 `type` 不在白名单 |
| `not_object` | 关卡条目不是对象 |
| `not_array` | `LEVELS` 或列表字段不是数组 |
| `duplicate_id` | 关卡 `id` 在批次里重复 |
| `unsupported_version` | `schemaVersion` 大版本不同，或高 minor 且遇到未知 `type` |
| `io_error` | 读文件失败（不存在、无权限） |
| `parse_error` | 编码不对或 JSON 结构坏 |

## 2. 校验顺序

- 同一字段只报第一条，顺序固定：缺失 → 类型 → 取值。
- 缺失时 `actual` 记 `undefined`；类型错误时 `expected` 写类型名。
- `path` 相对关卡文件内部（如 `waves[1].hp`），不带 `levels[i]` 前缀；`levels[i]` 由调用方标注。
- 不隐式转换：`"100"`、`[]`、`""` 都是 `bad_value`。

## 3. 版本

- `schemaVersion` 只比 major；只兼容当前 major（1）。
- minor 更高照常读取，未知字段写一条 warning 后继续。
- 两种报 `unsupported_version`：major 不同；或 minor 更高且遇到不认识的 `type`。
- 旧 major 靠迁移脚本升级，不同时支持多个旧 major。

## 4. 数值口径

- 墙越界按 `arena.w` / `arena.h` 判，`x + w == arena.w` 不算越界。
- `spawn.speed` 统一保留两位小数，四舍五入只记 warning，不影响 `ok`。
- 缺字段不另造 `bad_schema`，一律 `bad_value` + `actual: undefined`。

## 5. 并发与失败

- loader 无状态、不持有句柄、不缓存；热更新单关直接 `loadAll([path])`。
- 读取可以并发，结果一律按 `paths` 下标回填，与完成顺序无关。
- 并发度走 `options.concurrency`，默认 8；超出排队，不判失败、不返回并发错误。
- 读盘失败不重试，该项记 `io_error`；整批结果没有 `status` 字段，调用方只看逐项 `ok`。
- `io_error` 项只带 `path` / `code` / `message`；成功项只给 `data`，不带 `errors`。
- 错误日志固定带：关卡 `id`、`schemaVersion`、出错字段 `path`、`code`、文件 mtime。

## 6. 运行期

- loader 不在运行期兜底；上层捕获异常后退回选关界面，提示一句原因，不弹阻塞报错窗口。

## 7. Gate

- 合 main 的硬门槛：`tests/loader/` 对拍全过（当前 13/13）。
- 单条 10 秒超时；超时或崩溃只记这一条失败，其余跑完再汇总；一条不过就卡合 main。
- 坏样本只断言 `path` + `code`；好样本比对完整输出。
- `tools/` 下的关卡自检只打印难度曲线，不参与 gate。
