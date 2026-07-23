"use strict";

/**
 * Compatibility access layer for CommonJS command modules.
 *
 * Commands retain their existing library-shaped variables (`axios`, `Jimp`,
 * and `FileType`) while resolving them through the singleton MIAS registry.
 */

const registryModule = require("./engineRegistry.cjs");
const registry = registryModule.getEngineRegistry();

module.exports = Object.freeze({
  registry,
  http: registry.get("http"),
  httpClient: registry.get("http")?.client || null,
  image: registry.get("image"),
  jimp: registry.get("image")?.library || null,
  file: registry.get("fileDetection"),
  fileType: registry.get("fileDetection")?.library || null,
  media: registry.get("media"),
  graphics: registry.get("graphics"),
  svg: registry.get("svg"),
  sticker: registry.get("sticker"),
  preview: registry.get("preview"),
  speed: registry.get("speed"),
});