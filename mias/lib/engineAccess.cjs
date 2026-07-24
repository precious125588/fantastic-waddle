"use strict";
/**
 * CJS compatibility access layer for engine registry.
 * Mirrors engineAccess.js for CJS consumers (bridge.cjs, nexray_bot.cjs).
 *
 * v2: Adds cache, queue, logger, utility.
 */
const registryModule = require("./engineRegistry.cjs");
const registry = registryModule.getEngineRegistry();

module.exports = {
  registry,
  http:       registry.get("http"),
  httpClient: registry.get("http")?.client || null,
  image:      registry.get("image"),
  jimp:       registry.get("image")?.library || null,
  file:       registry.get("fileDetection"),
  fileType:   registry.get("fileDetection")?.library || null,
  media:      registry.get("media"),
  graphics:   registry.get("graphics"),
  svg:        registry.get("svg"),
  sticker:    registry.get("sticker"),
  preview:    registry.get("preview"),
  speed:      registry.get("speed"),
  // v2
  cache:      registry.get("cache"),
  queue:      registry.get("queue"),
  logger:     registry.get("logger"),
  utility:    registry.get("utility"),
};
