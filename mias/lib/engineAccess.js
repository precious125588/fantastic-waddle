/**
 * ESM compatibility access layer for MIAS command/API modules.
 * All values resolve from the singleton CommonJS Engine Registry.
 */

import registryModule from "./engineRegistry.cjs";

export const registry = registryModule.getEngineRegistry();
export const http = registry.get("http");
export const httpClient = http?.client || null;
export const image = registry.get("image");
export const jimp = image?.library || null;
export const file = registry.get("fileDetection");
export const fileType = file?.library || null;
export const media = registry.get("media");
export const graphics = registry.get("graphics");
export const svg = registry.get("svg");
export const sticker = registry.get("sticker");
export const preview = registry.get("preview");
export const speed = registry.get("speed");