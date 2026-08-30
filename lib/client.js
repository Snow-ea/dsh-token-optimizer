window.__ModuleLoader__.load({
  id: 'dsh-token-optimizer',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/client.js
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  cacheHitPercent: () => cacheHitPercent,
  contextPressureText: () => contextPressureText,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var React = __toESM(require("react"), 1);
var inject = ["slots"];
function cacheHitPercent(usage) {
  if (usage === void 0)
    return "--";
  const total = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  if (total <= 0)
    return "--";
  return `${(usage.cacheReadTokens / total * 100).toFixed(1)}%`;
}
function compactTokens(value) {
  const count = Math.max(0, Math.round(value));
  if (count < 1e3)
    return String(count);
  if (count < 1e6) {
    const scaled2 = count / 1e3;
    return `${scaled2 >= 100 ? Math.round(scaled2) : Math.round(scaled2 * 10) / 10}K`;
  }
  const scaled = count / 1e6;
  return `${scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10}M`;
}
function contextPressureText(pressure) {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens;
  if (usedTokens === void 0)
    return "--";
  if (pressure?.contextWindow === void 0 || pressure.contextWindow <= 0) {
    return `~${compactTokens(usedTokens)}`;
  }
  const percent = Math.min(100, usedTokens / pressure.contextWindow * 100).toFixed(1);
  return `${compactTokens(usedTokens)} / ${compactTokens(pressure.contextWindow)} (${percent}%)`;
}
function integer(value) {
  return Math.max(0, Math.round(value)).toLocaleString();
}
function Metric({ label, value, title }) {
  return React.createElement("span", {
    ...title === void 0 ? {} : { title },
    style: {
      display: "inline-flex",
      alignItems: "baseline",
      gap: 4,
      whiteSpace: "nowrap"
    }
  }, React.createElement("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 11 } }, label), React.createElement("strong", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: 11, fontWeight: 600 } }, value));
}
function TokenOptimizerDashboard(props) {
  const projected = props.useProjection("tokenOptimizer");
  const usage = props.useProjection("tokenUsage");
  const pressure = props.useProjection("contextPressure");
  const values = {
    optimizer: projected ?? {
      originalChars: 0,
      retainedChars: 0,
      savedChars: 0,
      savedTokens: 0,
      compressedResults: 0,
      spilledResults: 0,
      compactionCount: 0,
      compactedTokens: 0
    },
    usage,
    pressure,
    fallback: projected === void 0
  };
  const savedTokens = values.optimizer.savedTokens + values.optimizer.compactedTokens;
  const suffix = values.fallback ? " (\u7B49\u5F85\u4F1A\u8BDD\u6295\u5F71)" : "";
  return React.createElement("div", {
    "data-dsh-token-optimizer": "dashboard",
    title: "dsh-token-optimizer metrics",
    style: {
      boxSizing: "border-box",
      width: "calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance))",
      maxWidth: "var(--dsh-composer-card-max-width)",
      margin: "4px auto 0",
      padding: "0 4px",
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      gap: "4px 12px",
      lineHeight: "18px"
    }
  }, React.createElement(Metric, { label: "Token \u8282\u7701", value: `~${integer(savedTokens)}${suffix}` }), React.createElement(Metric, {
    label: "\u4E0A\u4E0B\u6587",
    value: contextPressureText(values.pressure),
    title: "\u9884\u8BA1\u4E0B\u4E00\u6B21\u8BF7\u6C42\u7684\u4E0A\u4E0B\u6587\u5360\u7528\uFF1Bcompact \u540E\u4F1A\u7ACB\u5373\u91CD\u7B97"
  }), React.createElement(Metric, {
    label: "\u7F13\u5B58\u547D\u4E2D\uFF08\u7D2F\u8BA1\uFF09",
    value: cacheHitPercent(values.usage),
    title: "\u6574\u4E2A\u4F1A\u8BDD\u5386\u53F2\u8BF7\u6C42\u7684\u7F13\u5B58\u547D\u4E2D\u7387\uFF0C\u4E0D\u4EE3\u8868\u5F53\u524D\u4E0A\u4E0B\u6587\u5927\u5C0F"
  }), React.createElement(Metric, {
    label: "\u538B\u7F29",
    value: `${integer(values.optimizer.compressedResults)} \u6B21`
  }), React.createElement(Metric, {
    label: "Compaction",
    value: `${integer(values.optimizer.compactionCount)} \u6B21`
  }), values.optimizer.spilledResults > 0 ? React.createElement(Metric, {
    label: "Spill",
    value: `${integer(values.optimizer.spilledResults)} \u6B21`
  }) : null);
}
function apply(ctx) {
  ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
    name: "conversation.composer.dock",
    id: "dsh-token-optimizer",
    order: 20
  }, TokenOptimizerDashboard));
}

    return module.exports;
  },
});
