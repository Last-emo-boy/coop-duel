// loader 契约 v1 的错误码表与错误工厂
// 下游只通过 makeError 造错误对象，不手拼对象，保证 path/code 口径一致。
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CoopErrors = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CODE = Object.freeze({
    BAD_VALUE: "bad_value",
    BAD_TYPE: "bad_type",
    NOT_OBJECT: "not_object",
    NOT_ARRAY: "not_array",
    DUPLICATE_ID: "duplicate_id",
    UNSUPPORTED_VERSION: "unsupported_version",
    IO_ERROR: "io_error",
    PARSE_ERROR: "parse_error"
  });

  var CODES = Object.freeze(Object.keys(CODE).map(function (k) { return CODE[k]; }));

  // makeError(code, field, expected, actual) -> { path, code, expected, actual[, message] }
  // 缺失字段时 actual 为 undefined；类型错误时 expected 写类型名。
  function makeError(code, field, expected, actual) {
    if (CODES.indexOf(code) === -1) throw new Error("unknown loader code: " + code);
    return { path: field, code: code, expected: expected, actual: actual };
  }

  function withMessage(error, message) {
    error.message = message;
    return error;
  }

  return { CODE: CODE, CODES: CODES, makeError: makeError, withMessage: withMessage };
});
