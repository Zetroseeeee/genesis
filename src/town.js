// GENESIS town layer: true-scale settlement plans. Pure data (no THREE): which buildings stand where, in metres
// from the settlement centre, for a given culture, era, size and set of works. Classic script; exposes window.TOWN.
//
// Ideas borrowed from the games this is chasing: Civilization's districts (temple quarter, academy, harbour,
// industrial zone, encampment) and wonders; The Sims' regional lot styles, roof variety and yards; Anno's
// walls, gates, piers and farmsteads that make a town read as a working place rather than a pile of boxes.
(function () {
  const W = 720, H = 360;
  const D2R = Math.PI / 180;
  function hash(i, k) { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const HEX = new Map(); const hex = (s) => { let v = HEX.get(s); if (v === undefined) { v = parseInt(s.slice(1), 16); HEX.set(s, v); } return v; };      // (a city's plan reads its palettes some twenty thousand times)

  // ---------- materials (decoded by the building shader) ----------
  const WALL = { adobe: 0, plaster: 1, timber: 2, stone: 3, brick: 4, concrete: 5, glass: 6, wood: 7 };
  const ROOF = { thatch: 0, tile: 1, slate: 2, flat: 3, metal: 4, glazed: 5, shingle: 6, copper: 7 };
  const FLAG = { landmark: 1, block: 2, neon: 4, wonder: 8, ruin: 16, site: 32, thing: 64, garden: 128 };      // (garden: what lies flat on it is planted)
  const packStyle = (wall, roof, culture, flags) => wall + roof * 8 + culture * 64 + (flags || 0) * 1024;

  // ---------- cultures: where a people first settled decides how they build ----------
  const CULTURES = ['med', 'north', 'east', 'mena', 'africa', 'sasia', 'easia', 'seasia', 'america', 'namerica'];
  function cultureOf(lon, lat) {
    if (lon < -30) { if (lat > 32 || lat < -56) return 9; return lat > 12 || (lat < 12 && lon > -82 && lat > -56) ? 8 : 8; }
    if (lon < 60) {
      if (lat > 47) return lon > 32 ? 2 : 1;
      if (lat > 34) return (lon > 44 && lat < 45) ? 3 : (lon > 40 ? 2 : 0);
      if (lat > 12) return lon > -18 ? 3 : 0;
      return 4;
    }
    if (lon < 95) { if (lat > 45) return 2; if (lat > 36 && lon < 75) return 3; return lat > 5 ? 5 : 7; }
    if (lon < 150) { if (lat > 20) return 6; if (lat > -12) return 7; return 9; }
    return lat > -12 ? 7 : 9;
  }
  function civCulture(sim, c) {
    if (c.culture === undefined || c.culture === null) {
      const i = c.home >= 0 ? c.home : c.capital; const y = (i / W) | 0, x = i - y * W;
      c.culture = cultureOf((x + 0.5) / W * 360 - 180, 90 - (y + 0.5) / H * 180);
    }
    return c.culture;
  }

  // palettes: wall colours by culture and era band (0 stone, 1 bronze/iron, 2 classical, 3 medieval, 4 renaissance, 5 industrial, 6 modern, 7 information)
  const PAL = {
    med: [['#b9a583', '#a89470', '#c4b08c'], ['#dcc9a5', '#e6d6b4', '#cdb88f'], ['#efe6d2', '#f2ebdc', '#e3cfa6', '#e8dcc4'], ['#b8ab92', '#c9bda4', '#a89b82', '#e7dcc4'], ['#efe1c6', '#e9d3b0', '#f3e9d6', '#d9b98c', '#e6c9a8'], ['#d9c9ad', '#c8a882', '#b98a6a', '#e4d6bd'], ['#d6d2c8', '#c7c2b8', '#e2ddd3', '#b9b4aa'], ['#cfd6dc', '#dfe4e8', '#b7c3cc', '#e6e9ec'], ['#e9ece6', '#dfe6dd', '#f2f3ef', '#cfd9d2']],
    north: [['#7a6547', '#6e5a3f', '#86704f'], ['#8a7452', '#9b8462', '#7d6a4a'], ['#d9cdb4', '#c9bc9f', '#e3d8c1'], ['#e9e2d0', '#e2d8c2', '#d7ccb2', '#cbbf9f'], ['#a0563f', '#b46a4d', '#e9e2d0', '#8f4a3a', '#d8cbb0'], ['#8f4a3a', '#7d4033', '#a35a45', '#6f6a66'], ['#b8bcc2', '#c9ccd0', '#a29d95', '#d2c8b6'], ['#c5ccd3', '#dde2e6', '#a9b6c1', '#eef0f2'], ['#e9ece6', '#dfe6dd', '#f2f3ef', '#cfd9d2']],
    east: [['#6e5537', '#7d6142', '#5f4a30'], ['#7d6142', '#8b6d4b', '#6a5238'], ['#8b6d4b', '#9a7b55', '#7a5f42'], ['#8b6d4b', '#a08252', '#e4d3b8', '#7a5f42'], ['#e4d3b8', '#efe1c8', '#d8c29c', '#c98d6a'], ['#b06e4e', '#c48159', '#a29a8c', '#e4d3b8'], ['#a9adb2', '#bfc3c7', '#d3cdc0', '#8f9398'], ['#c2c9d0', '#d9dee2', '#aab5bf', '#eef0f2'], ['#e9ece6', '#dfe6dd', '#f2f3ef', '#cfd9d2']],
    mena: [['#b8956a', '#a8865c', '#c4a274'], ['#c9a878', '#d7b98a', '#b5905e', '#cbb28a'], ['#d7b98a', '#e2cba2', '#c9a878', '#efe8d8'], ['#efe8d8', '#e8dcc4', '#d9c39a', '#f2ede2'], ['#efe8d8', '#e6d4b0', '#f4efe4', '#d2b98f'], ['#d8c9ad', '#c9b493', '#e6dccb', '#b79a72'], ['#d8d2c4', '#e4dfd3', '#c6bfaf', '#efece4'], ['#dfe3e6', '#eef0f2', '#c8d2da', '#f3f4f5'], ['#e9ece6', '#dfe6dd', '#f2f3ef', '#cfd9d2']],
    africa: [['#a6764a', '#b8845a', '#96683f'], ['#a6764a', '#b8845a', '#c39466', '#8f6440'], ['#b8845a', '#c39466', '#a6764a'], ['#b8845a', '#c9a26e', '#a6764a', '#d6b986'], ['#c9a26e', '#d6b986', '#b8845a', '#e3cfa4'], ['#cfc0a3', '#c3aa80', '#d9cbb0', '#b0885e'], ['#cfc7b8', '#dcd5c8', '#bfb5a4', '#e9e3d8'], ['#d6dbe0', '#e8ecef', '#c1cad2', '#f0f2f4'], ['#e9ece6', '#dfe6dd', '#f2f3ef', '#cfd9d2']],
    sasia: [['#a67c56', '#b48a62', '#97704c'], ['#a8664a', '#b77356', '#9a5b41', '#c78a68'], ['#e9dcc0', '#dcc8a2', '#a8664a', '#f0ece2'], ['#e9dcc0', '#d9c39a', '#c9a26e', '#f0ece2'], ['#f0ece2', '#e9dcc0', '#f4e4c6', '#d8b98a'], ['#d8c9ad', '#e9dcc0', '#c99a76', '#efe6d4'], ['#dcd8cc', '#e8e4da', '#c9c3b6', '#f1eee8'], ['#d9dfe4', '#e9edf0', '#c3ccd4', '#f2f4f6'], ['#e9ece6', '#dfe6dd', '#f2f3ef', '#cfd9d2']],
    easia: [['#7a6446', '#8b7350', '#6c583d'], ['#b89a76', '#c4a884', '#a88a68', '#d9cbb0'], ['#d9cbb0', '#e2d6bf', '#b89a76', '#e6e2da'], ['#e6e2da', '#d9cbb0', '#b89a76', '#c9bda4'], ['#e6e2da', '#efeae0', '#d9cbb0', '#a8a094'], ['#c9c2b4', '#d7d1c4', '#b3ab9c', '#e6e2da'], ['#c9ccd0', '#d9dbde', '#b0b4b9', '#e6e8ea'], ['#c8d0d8', '#dfe5ea', '#aab7c3', '#eef1f3'], ['#e9ece6', '#dfe6dd', '#f2f3ef', '#cfd9d2']],
    seasia: [['#8a6a44', '#9b784e', '#79593a'], ['#8a6a44', '#9b784e', '#a88a62'], ['#9b784e', '#a88a62', '#8a6a44', '#c9a878'], ['#a88a62', '#c9a878', '#9b784e', '#b5905e'], ['#c9a878', '#d9c39a', '#a88a62', '#efe6d4'], ['#d9c39a', '#c9b493', '#e6dccb', '#a88a62'], ['#d8d2c4', '#e4dfd3', '#c6bfaf', '#efece4'], ['#d9e0e5', '#eaeef1', '#c3ced6', '#f2f4f6'], ['#e9ece6', '#dfe6dd', '#f2f3ef', '#cfd9d2']],
    america: [['#a67c56', '#b48a62', '#97704c'], ['#c48f5f', '#d19d6d', '#b58153', '#dcb283'], ['#c48f5f', '#9a9184', '#d19d6d', '#efe4cc'], ['#9a9184', '#a89f90', '#c48f5f', '#8c8376'], ['#efe4cc', '#f1d9a6', '#e6c9a0', '#dcb283'], ['#f1d9a6', '#e7c48f', '#efe4cc', '#c98d6a'], ['#d9d2c4', '#e6dfd2', '#c8c0b1', '#efeae0'], ['#d6dde3', '#e8edf0', '#bfcad3', '#f1f3f5'], ['#e9ece6', '#dfe6dd', '#f2f3ef', '#cfd9d2']],
    namerica: [['#8a6b4c', '#9a7a58', '#7a5d40'], ['#8a6b4c', '#9a7a58', '#a88a62'], ['#9a7a58', '#a88a62', '#c9b48c', '#8a6b4c'], ['#c48f5f', '#d19d6d', '#b58153', '#9a7a58'], ['#dfd8c8', '#c9c2b2', '#e9e3d5', '#b9b0a0'], ['#dfd8c8', '#c9c2b2', '#a9b7c4', '#8f4a3a'], ['#dfd8c8', '#c9c2b2', '#a9b7c4', '#e9e3d5'], ['#d3dbe2', '#e6ebef', '#b9c6d0', '#f0f3f5'], ['#e9ece6', '#dfe6dd', '#f2f3ef', '#cfd9d2']],
  };
  const bandOf = (era) => era === 0 ? 0 : era <= 2 ? 1 : era === 3 ? 2 : era === 4 ? 3 : era === 5 ? 4 : era === 6 ? 5 : era === 7 ? 6 : era === 8 ? 7 : 8;

  // house kinds by culture and era: [kind, weight, wallMat, roofMat]
  const HOUSES = {
    med: [
      [['hut', 5, WALL.adobe, ROOF.thatch], ['longhouse', 1, WALL.wood, ROOF.thatch]],
      [['courtyard', 3, WALL.adobe, ROOF.flat], ['adobe', 5, WALL.adobe, ROOF.flat], ['gable', 1, WALL.plaster, ROOF.tile]],
      [['courtyard', 3, WALL.plaster, ROOF.tile], ['hip', 4, WALL.plaster, ROOF.tile], ['tenement', 2, WALL.brick, ROOF.tile], ['gable', 2, WALL.plaster, ROOF.tile]],
      [['townhouse', 4, WALL.stone, ROOF.tile], ['gable', 4, WALL.stone, ROOF.tile], ['hip', 2, WALL.plaster, ROOF.tile]],
      [['townhouse', 4, WALL.plaster, ROOF.tile], ['palazzo', 1, WALL.plaster, ROOF.tile], ['hip', 3, WALL.plaster, ROOF.tile], ['mansard', 1, WALL.plaster, ROOF.slate]],
      [['tenement', 4, WALL.plaster, ROOF.tile], ['terrace', 3, WALL.brick, ROOF.tile], ['townhouse', 2, WALL.plaster, ROOF.tile]],
      [['block', 5, WALL.concrete, ROOF.flat], ['tenement', 3, WALL.plaster, ROOF.tile], ['hip', 2, WALL.plaster, ROOF.tile]],
      [['block', 4, WALL.concrete, ROOF.flat], ['tower', 2, WALL.glass, ROOF.flat], ['hip', 2, WALL.plaster, ROOF.tile], ['tenement', 2, WALL.plaster, ROOF.tile]],
      [['block', 4, WALL.concrete, ROOF.flat], ['tower', 2, WALL.glass, ROOF.flat], ['hip', 2, WALL.plaster, ROOF.tile], ['tenement', 2, WALL.plaster, ROOF.tile]],
    ],
    north: [
      [['longhouse', 4, WALL.wood, ROOF.thatch], ['hut', 3, WALL.wood, ROOF.thatch]],
      [['longhouse', 4, WALL.timber, ROOF.thatch], ['gable', 3, WALL.timber, ROOF.thatch], ['hut', 1, WALL.wood, ROOF.thatch]],
      [['gable', 5, WALL.timber, ROOF.thatch], ['longhouse', 2, WALL.wood, ROOF.thatch], ['hip', 2, WALL.plaster, ROOF.tile]],
      [['halftimber', 5, WALL.timber, ROOF.slate], ['townhouse', 3, WALL.timber, ROOF.tile], ['gable', 3, WALL.timber, ROOF.thatch]],
      [['townhouse', 4, WALL.brick, ROOF.slate], ['halftimber', 3, WALL.timber, ROOF.tile], ['mansard', 2, WALL.plaster, ROOF.slate], ['gable', 2, WALL.brick, ROOF.tile]],
      [['terrace', 6, WALL.brick, ROOF.slate], ['tenement', 3, WALL.brick, ROOF.slate], ['townhouse', 2, WALL.brick, ROOF.slate]],
      [['block', 4, WALL.concrete, ROOF.flat], ['terrace', 4, WALL.brick, ROOF.slate], ['gable', 3, WALL.brick, ROOF.slate], ['tower', 1, WALL.concrete, ROOF.flat]],
      [['block', 3, WALL.concrete, ROOF.flat], ['tower', 2, WALL.glass, ROOF.flat], ['terrace', 3, WALL.brick, ROOF.slate], ['gable', 3, WALL.brick, ROOF.slate]],
      [['block', 3, WALL.concrete, ROOF.flat], ['tower', 2, WALL.glass, ROOF.flat], ['terrace', 3, WALL.brick, ROOF.slate], ['gable', 3, WALL.brick, ROOF.slate]],
    ],
    east: [
      [['hut', 4, WALL.wood, ROOF.thatch], ['longhouse', 3, WALL.wood, ROOF.thatch]],
      [['gable', 5, WALL.wood, ROOF.shingle], ['longhouse', 2, WALL.wood, ROOF.thatch]],
      [['gable', 6, WALL.wood, ROOF.shingle], ['longhouse', 2, WALL.wood, ROOF.thatch]],
      [['gable', 6, WALL.wood, ROOF.shingle], ['townhouse', 2, WALL.wood, ROOF.shingle], ['halftimber', 1, WALL.timber, ROOF.slate]],
      [['townhouse', 3, WALL.plaster, ROOF.slate], ['gable', 4, WALL.wood, ROOF.shingle], ['mansard', 2, WALL.plaster, ROOF.slate]],
      [['tenement', 4, WALL.brick, ROOF.slate], ['gable', 3, WALL.wood, ROOF.shingle], ['terrace', 2, WALL.brick, ROOF.slate]],
      [['block', 6, WALL.concrete, ROOF.flat], ['tenement', 2, WALL.brick, ROOF.slate], ['gable', 2, WALL.wood, ROOF.shingle]],
      [['block', 5, WALL.concrete, ROOF.flat], ['tower', 2, WALL.glass, ROOF.flat], ['gable', 2, WALL.wood, ROOF.shingle]],
      [['block', 5, WALL.concrete, ROOF.flat], ['tower', 2, WALL.glass, ROOF.flat], ['gable', 2, WALL.wood, ROOF.shingle]],
    ],
    mena: [
      [['hut', 4, WALL.adobe, ROOF.thatch], ['adobe', 3, WALL.adobe, ROOF.flat]],
      [['adobe', 5, WALL.adobe, ROOF.flat], ['courtyard', 3, WALL.adobe, ROOF.flat]],
      [['courtyard', 4, WALL.adobe, ROOF.flat], ['adobe', 4, WALL.plaster, ROOF.flat], ['hip', 1, WALL.plaster, ROOF.tile]],
      [['courtyard', 4, WALL.plaster, ROOF.flat], ['adobe', 4, WALL.adobe, ROOF.flat], ['domehouse', 2, WALL.plaster, ROOF.flat]],
      [['courtyard', 4, WALL.plaster, ROOF.flat], ['adobe', 3, WALL.plaster, ROOF.flat], ['domehouse', 2, WALL.plaster, ROOF.flat], ['palazzo', 1, WALL.plaster, ROOF.flat]],
      [['tenement', 3, WALL.plaster, ROOF.flat], ['courtyard', 3, WALL.plaster, ROOF.flat], ['adobe', 3, WALL.adobe, ROOF.flat]],
      [['block', 5, WALL.concrete, ROOF.flat], ['courtyard', 2, WALL.plaster, ROOF.flat], ['tenement', 2, WALL.plaster, ROOF.flat]],
      [['block', 3, WALL.concrete, ROOF.flat], ['tower', 3, WALL.glass, ROOF.flat], ['skyscraper', 1, WALL.glass, ROOF.flat], ['courtyard', 2, WALL.plaster, ROOF.flat]],
      [['block', 3, WALL.concrete, ROOF.flat], ['tower', 3, WALL.glass, ROOF.flat], ['skyscraper', 1, WALL.glass, ROOF.flat], ['courtyard', 2, WALL.plaster, ROOF.flat]],
    ],
    africa: [
      [['hut', 6, WALL.adobe, ROOF.thatch]],
      [['hut', 5, WALL.adobe, ROOF.thatch], ['granary', 1, WALL.adobe, ROOF.thatch], ['adobe', 1, WALL.adobe, ROOF.flat]],
      [['hut', 4, WALL.adobe, ROOF.thatch], ['adobe', 3, WALL.adobe, ROOF.flat], ['granary', 1, WALL.adobe, ROOF.thatch]],
      [['adobe', 4, WALL.adobe, ROOF.flat], ['hut', 3, WALL.adobe, ROOF.thatch], ['courtyard', 2, WALL.adobe, ROOF.flat]],
      [['adobe', 4, WALL.adobe, ROOF.flat], ['courtyard', 3, WALL.adobe, ROOF.flat], ['hut', 2, WALL.adobe, ROOF.thatch]],
      [['adobe', 3, WALL.plaster, ROOF.flat], ['terrace', 3, WALL.brick, ROOF.metal], ['gable', 2, WALL.plaster, ROOF.metal]],
      [['block', 4, WALL.concrete, ROOF.flat], ['gable', 3, WALL.plaster, ROOF.metal], ['adobe', 2, WALL.plaster, ROOF.flat]],
      [['block', 4, WALL.concrete, ROOF.flat], ['tower', 2, WALL.glass, ROOF.flat], ['gable', 3, WALL.plaster, ROOF.metal]],
      [['block', 4, WALL.concrete, ROOF.flat], ['tower', 2, WALL.glass, ROOF.flat], ['gable', 3, WALL.plaster, ROOF.metal]],
    ],
    sasia: [
      [['hut', 6, WALL.adobe, ROOF.thatch]],
      [['adobe', 4, WALL.brick, ROOF.flat], ['courtyard', 3, WALL.brick, ROOF.flat], ['hut', 2, WALL.adobe, ROOF.thatch]],
      [['courtyard', 4, WALL.plaster, ROOF.flat], ['adobe', 3, WALL.brick, ROOF.flat], ['hut', 2, WALL.adobe, ROOF.thatch]],
      [['courtyard', 4, WALL.plaster, ROOF.flat], ['adobe', 3, WALL.plaster, ROOF.flat], ['hip', 2, WALL.plaster, ROOF.tile]],
      [['courtyard', 4, WALL.plaster, ROOF.flat], ['palazzo', 1, WALL.plaster, ROOF.flat], ['adobe', 3, WALL.plaster, ROOF.flat]],
      [['tenement', 3, WALL.plaster, ROOF.flat], ['courtyard', 3, WALL.plaster, ROOF.flat], ['terrace', 2, WALL.brick, ROOF.tile]],
      [['block', 5, WALL.concrete, ROOF.flat], ['tenement', 3, WALL.plaster, ROOF.flat], ['courtyard', 2, WALL.plaster, ROOF.flat]],
      [['block', 4, WALL.concrete, ROOF.flat], ['tower', 3, WALL.glass, ROOF.flat], ['tenement', 2, WALL.plaster, ROOF.flat]],
      [['block', 4, WALL.concrete, ROOF.flat], ['tower', 3, WALL.glass, ROOF.flat], ['tenement', 2, WALL.plaster, ROOF.flat]],
    ],
    easia: [
      [['hut', 4, WALL.wood, ROOF.thatch], ['longhouse', 2, WALL.wood, ROOF.thatch]],
      [['curved', 4, WALL.wood, ROOF.glazed], ['gable', 3, WALL.wood, ROOF.thatch]],
      [['curved', 5, WALL.plaster, ROOF.glazed], ['courtyardc', 3, WALL.plaster, ROOF.glazed]],
      [['curved', 5, WALL.plaster, ROOF.glazed], ['courtyardc', 3, WALL.plaster, ROOF.glazed], ['townhouse', 1, WALL.wood, ROOF.glazed]],
      [['curved', 5, WALL.plaster, ROOF.glazed], ['courtyardc', 3, WALL.plaster, ROOF.glazed]],
      [['curved', 3, WALL.plaster, ROOF.glazed], ['terrace', 3, WALL.brick, ROOF.glazed], ['tenement', 2, WALL.brick, ROOF.flat]],
      [['block', 6, WALL.concrete, ROOF.flat], ['curved', 2, WALL.plaster, ROOF.glazed], ['tenement', 2, WALL.concrete, ROOF.flat]],
      [['block', 4, WALL.concrete, ROOF.flat], ['tower', 3, WALL.glass, ROOF.flat], ['skyscraper', 1, WALL.glass, ROOF.flat], ['curved', 1, WALL.plaster, ROOF.glazed]],
      [['block', 4, WALL.concrete, ROOF.flat], ['tower', 3, WALL.glass, ROOF.flat], ['skyscraper', 1, WALL.glass, ROOF.flat], ['curved', 1, WALL.plaster, ROOF.glazed]],
    ],
    seasia: [
      [['stilt', 5, WALL.wood, ROOF.thatch], ['hut', 2, WALL.wood, ROOF.thatch]],
      [['stilt', 6, WALL.wood, ROOF.thatch]],
      [['stilt', 5, WALL.wood, ROOF.thatch], ['curved', 2, WALL.wood, ROOF.glazed]],
      [['stilt', 4, WALL.wood, ROOF.thatch], ['curved', 3, WALL.wood, ROOF.glazed], ['gable', 1, WALL.wood, ROOF.tile]],
      [['stilt', 3, WALL.wood, ROOF.thatch], ['curved', 3, WALL.plaster, ROOF.glazed], ['gable', 2, WALL.wood, ROOF.tile]],
      [['terrace', 3, WALL.plaster, ROOF.tile], ['stilt', 2, WALL.wood, ROOF.metal], ['gable', 3, WALL.wood, ROOF.metal]],
      [['block', 5, WALL.concrete, ROOF.flat], ['gable', 3, WALL.plaster, ROOF.metal], ['stilt', 1, WALL.wood, ROOF.metal]],
      [['block', 4, WALL.concrete, ROOF.flat], ['tower', 3, WALL.glass, ROOF.flat], ['gable', 2, WALL.plaster, ROOF.metal]],
      [['block', 4, WALL.concrete, ROOF.flat], ['tower', 3, WALL.glass, ROOF.flat], ['gable', 2, WALL.plaster, ROOF.metal]],
    ],
    america: [
      [['hut', 6, WALL.adobe, ROOF.thatch]],
      [['adobe', 4, WALL.adobe, ROOF.thatch], ['hut', 3, WALL.adobe, ROOF.thatch]],
      [['adobe', 5, WALL.stone, ROOF.thatch], ['courtyard', 2, WALL.adobe, ROOF.flat], ['hut', 2, WALL.adobe, ROOF.thatch]],
      [['adobe', 5, WALL.stone, ROOF.thatch], ['courtyard', 3, WALL.adobe, ROOF.flat]],
      [['hip', 4, WALL.plaster, ROOF.tile], ['courtyard', 3, WALL.plaster, ROOF.tile], ['adobe', 2, WALL.adobe, ROOF.flat]],
      [['hip', 4, WALL.plaster, ROOF.tile], ['terrace', 3, WALL.plaster, ROOF.tile], ['tenement', 2, WALL.brick, ROOF.tile]],
      [['block', 5, WALL.concrete, ROOF.flat], ['hip', 3, WALL.plaster, ROOF.tile], ['tenement', 2, WALL.plaster, ROOF.flat]],
      [['block', 4, WALL.concrete, ROOF.flat], ['tower', 3, WALL.glass, ROOF.flat], ['hip', 2, WALL.plaster, ROOF.tile]],
      [['block', 4, WALL.concrete, ROOF.flat], ['tower', 3, WALL.glass, ROOF.flat], ['hip', 2, WALL.plaster, ROOF.tile]],
    ],
    namerica: [
      [['tipi', 4, WALL.wood, ROOF.thatch], ['longhouse', 3, WALL.wood, ROOF.thatch], ['hut', 2, WALL.wood, ROOF.thatch]],
      [['longhouse', 4, WALL.wood, ROOF.thatch], ['tipi', 3, WALL.wood, ROOF.thatch], ['pueblo', 1, WALL.adobe, ROOF.flat]],
      [['longhouse', 3, WALL.wood, ROOF.thatch], ['pueblo', 3, WALL.adobe, ROOF.flat], ['hut', 2, WALL.wood, ROOF.thatch]],
      [['pueblo', 4, WALL.adobe, ROOF.flat], ['longhouse', 3, WALL.wood, ROOF.thatch]],
      [['gable', 5, WALL.wood, ROOF.shingle], ['pueblo', 2, WALL.adobe, ROOF.flat], ['longhouse', 1, WALL.wood, ROOF.thatch]],
      [['gable', 5, WALL.wood, ROOF.shingle], ['terrace', 2, WALL.brick, ROOF.slate], ['tenement', 2, WALL.brick, ROOF.flat]],
      [['gable', 6, WALL.wood, ROOF.slate], ['block', 3, WALL.concrete, ROOF.flat], ['tower', 1, WALL.concrete, ROOF.flat]],
      [['gable', 5, WALL.wood, ROOF.slate], ['tower', 3, WALL.glass, ROOF.flat], ['skyscraper', 1, WALL.glass, ROOF.flat], ['block', 2, WALL.concrete, ROOF.flat]],
      [['gable', 5, WALL.wood, ROOF.slate], ['tower', 3, WALL.glass, ROOF.flat], ['skyscraper', 1, WALL.glass, ROOF.flat], ['block', 2, WALL.concrete, ROOF.flat]],
    ],
  };
  // the building every town gathers around, by culture and era band; wonders are the outsized version a capital earns
  const LANDMARK = {
    med: ['menhirs', 'ziggurat', 'temple', 'cathedral', 'basilica', 'station', 'stadium', 'spire', 'arcology'],
    north: ['menhirs', 'menhirs', 'temple', 'cathedral', 'palace', 'station', 'stadium', 'spire', 'arcology'],
    east: ['menhirs', 'menhirs', 'hall', 'onion', 'onion', 'station', 'stadium', 'spire', 'arcology'],
    mena: ['menhirs', 'ziggurat', 'ziggurat', 'mosque', 'mosque', 'station', 'stadium', 'spire', 'arcology'],
    africa: ['menhirs', 'menhirs', 'stepped', 'mudmosque', 'mudmosque', 'station', 'stadium', 'spire', 'arcology'],
    sasia: ['menhirs', 'stupa', 'stupa', 'shikhara', 'mosque', 'station', 'stadium', 'spire', 'arcology'],
    easia: ['menhirs', 'hall', 'pagoda', 'pagoda', 'hall', 'station', 'stadium', 'spire', 'arcology'],
    seasia: ['menhirs', 'hall', 'stepped', 'stepped', 'stupa', 'station', 'stadium', 'spire', 'arcology'],
    america: ['menhirs', 'steppyramid', 'steppyramid', 'steppyramid', 'basilica', 'station', 'stadium', 'spire', 'arcology'],
    namerica: ['menhirs', 'mound', 'mound', 'pueblo', 'church', 'station', 'stadium', 'spire', 'arcology'],
  };
  const WONDER = {
    med: ['menhirs', 'pyramid', 'temple', 'colosseum', 'cathedral', 'basilica', 'irontower', 'stadium', 'spire', 'elevator'],      // (Iron Age: a great temple in stone, as at Ephesus and Samos)
    north: ['menhirs', 'menhirs', 'menhirs', 'colosseum', 'cathedral', 'palace', 'crystal', 'stadium', 'spire', 'elevator'],
    east: ['menhirs', 'menhirs', 'hall', 'hall', 'onion', 'palace', 'irontower', 'stadium', 'spire', 'elevator'],
    mena: ['menhirs', 'pyramid', 'ziggurat', 'lighthouse', 'mosque', 'mosque', 'crystal', 'stadium', 'spire', 'elevator'],
    africa: ['menhirs', 'pyramid', 'pyramid', 'stepped', 'mudmosque', 'mudmosque', 'crystal', 'stadium', 'spire', 'elevator'],
    sasia: ['menhirs', 'stupa', 'stupa', 'stupa', 'shikhara', 'tajmosque', 'crystal', 'stadium', 'spire', 'elevator'],
    easia: ['menhirs', 'hall', 'hall', 'pagoda', 'pagoda', 'hall', 'irontower', 'stadium', 'spire', 'elevator'],
    seasia: ['menhirs', 'hall', 'stepped', 'stepped', 'stepped', 'stupa', 'crystal', 'stadium', 'spire', 'elevator'],
    america: ['menhirs', 'steppyramid', 'steppyramid', 'steppyramid', 'steppyramid', 'basilica', 'irontower', 'stadium', 'spire', 'elevator'],
    namerica: ['menhirs', 'mound', 'mound', 'mound', 'pueblo', 'church', 'irontower', 'stadium', 'spire', 'elevator'],
  };
  // walls by era: what a fortified town surrounds itself with. The timber countries kept the palisade long after the
  // mud-brick lands had walls of brick: the north and east of Europe, the forests of south-east Asia, the Americas.
  const WALLSTYLE = ['palisade', 'mud', 'mud', 'stone', 'stone', 'bastion', 'none', 'none', 'none', 'none'];
  const TIMBER_UNTIL = [0, 4, 4, 0, 0, 0, 0, 2, 2, 4];               // by culture: the last era whose wall is still a palisade (the timber-and-earth ramparts of the north and the wooden strongholds of the east lasted through the middle ages)
  // The old ways last. Where people went on building as their forebears had, a town of a later age is still built in
  // the Iron Age manner - the same houses, walls, holy places and lanes: the timber north and the steppe until the
  // middle ages (the northern Iron Age runs to the Vikings), the mud-brick lands and India through classical times,
  // China's earth-walled towns of thatch and timber through the Han, the villages of Africa and south-east Asia until
  // the ships came, the Americas until the conquest. Greece and Rome built anew.
  // OLD_UNTIL[culture] is the last era built the old way; styleEra() is the era whose forms a town takes.
  const OLD_UNTIL = [2, 3, 3, 3, 5, 3, 3, 5, 4, 4];
  const styleEra = (era, cul) => cul !== undefined && era > 2 && era <= OLD_UNTIL[cul] ? 2 : era;
  const wallStyleOf = (era0, cul) => { const era = styleEra(era0, cul); return era <= TIMBER_UNTIL[cul] ? 'palisade' : WALLSTYLE[era]; };

  // ---------- size ----------
  // Towns are planned at true scale (metres), then drawn at a representational scale, the way a strategy map does it:
  // a village is drawn ~19x life size so it reads from region height, a metropolis ~3x so it still fits its region.
  const APC = [250, 150, 130, 110, 90, 100, 120, 200, 200, 190];          // built-up m² per person (a city of the machine age and after, beyond its old town)
  const PPB = [6, 7, 8, 10, 12, 14, 24, 60, 90, 110];                       // people per building (the blocks of such a city, and the blocks a far town is drawn in)
  const BUILD_T = [14, 12, 11, 10, 9, 8, 6, 4, 3, 3];                     // years a house takes to go up in the world's time, by era
  const SCALE0 = 20, SCALE_R0 = 1200;
  const scaleOf = (Rt) => SCALE0 / (1 + Rt / SCALE_R0);
  const hScale = (k) => Math.pow(k, 0.85);
  const peopleOf = (sim, i) => Math.max(30, sim.pop[i] * 1000);
  // How closely a people builds, by culture (med, north, east, mena, africa, sasia, easia, seasia, america, namerica): the
  // mud-brick towns of the river valleys and the Mediterranean stand wall to wall; northern and woodland villages spread
  // out more, though never so far that a town of small houses reads as a scatter of dots.
  const COMPACT = [0.45, 0.6, 0.6, 0.35, 0.34, 0.4, 0.45, 0.42, 0.5, 0.6];
  // (the wall-to-wall mud-brick towns of the Mediterranean, the Near East and India stood on far less ground still, from
  // the Bronze Age to the Classical; so did the timber towns of the medieval north and east, gable by gable along the lanes)
  const timberTown = (era, cul) => era === 4 && (cul === 1 || cul === 2);      // the medieval north and east: market towns of timber within a timber wall
  const walled = (era0, cul) => { const era = styleEra(era0, cul); return (era >= 1 && era <= 3 && (cul === 0 || cul === 3 || cul === 5)) || timberTown(era, cul); };
  const bandPeople = (b) => Math.pow(2, b / 3) - 1;                     // inverse of the sim's size band
  const SLOT_N = 12;
  const slotAngle = (i, axis, sl) => axis + Math.PI / 4 + sl * (Math.PI * 2 / SLOT_N) + (hash(i, 90 + sl) - 0.5) * 0.22;

  // ---------- the plan: laid out once, grown plot by plot ----------
  // A town is not planned anew as it grows (plots.js): its streets are laid out by the place and the kind of town it was founded
  // as, its plots taken in one order for ever, and a town of n households stands on the first n of them. What changes is what
  // stands on a plot: each house is rebuilt in its turn, in the manner of its place and of the day it was rebuilt (vern.js), so
  // a town passes from one age's houses to the next's over generations, the newest streets first in the newest manner.
  const PPP = 7;                 // people in a household: a plot and its house
  const NFINE = 12000;           // the most plots a town's plan holds; a greater town's outskirts are drawn in blocks
  const LAGM = 0.3;              // how far behind its age a house is on the whole (in ages): houses are rebuilt one by one
  const AREA_P = 820;            // ground a plot takes with its share of the streets (m²): what the outskirts of a full plan cover
  const progressOf = (c) => { const e = c.era | 0; return e + (window.KNOW && window.KNOW.fracOf ? clamp(window.KNOW.fracOf(c.tech, e), 0, 0.999) : 0); };
  const apcAt = (P) => { const e = Math.min(9, Math.floor(P)), f = P - e; return APC[e] + (APC[Math.min(9, e + 1)] - APC[e]) * f; };
  const Rmodern = (people, P, cul) => Math.sqrt(people * apcAt(P) * COMPACT[cul] / Math.PI);
  // the town's plan, fixed for its life: the size of its square, its frontages, its blocks, its cells, its yards (plots.js)
  function planOpt(i, morph, st, cul, foundEra) {
    const r = (k) => hash(i, 600 + k); const fam = st ? st.fam : 'euro'; const o = { axis: hash(i, 3) * Math.PI };
    const loose = foundEra <= 1 ? 1.35 : 1;      // (a town that began as a village of huts has wide plots ever after)
    if (morph === 'organic') {
      o.sq = [38 + 22 * r(1), 26 + 16 * r(2)];
      const f = fam === 'euro' ? [6, 11] : fam === 'sasia' ? [6.5, 11] : fam === 'mena' ? [7, 12] : fam === 'easia' ? [9, 15] : fam === 'seasia' ? [10, 16] : fam === 'nam' || fam === 'amer' ? [12, 20] : [8, 14];
      o.front = [f[0] * loose, f[1] * loose];
    } else if (morph === 'grid') {
      o.block = fam === 'easia' ? 110 + 30 * r(3) : foundEra === 3 ? 72 + 18 * r(3) : 88 + 24 * r(3); o.streetW = fam === 'easia' ? 12 : 9; o.sq = [o.block, o.block];
      o.front = fam === 'easia' ? [10, 16] : fam === 'euro' ? [7, 12] : fam === 'nam' ? [14, 22] : [9, 15];
    } else if (morph === 'medina') { o.cell = fam === 'africa' ? 15 + 4 * r(4) : 11 + 4 * r(4); o.sq = [26 + 12 * r(5), 18 + 10 * r(6)]; }
    else if (morph === 'compound') o.spacing = 38 + 10 * r(7);
    else { o.spacing = st && (st.region === 'steppe' || st.region === 'mong') ? 26 + 8 * r(8) : 20 + 6 * r(8); o.parallel = cul === 1 && foundEra <= 2; }
    o.sig = morph + ';' + Object.keys(o).sort().filter((k) => k !== 'sig').map((k) => k + '=' + (Array.isArray(o[k]) ? o[k].map((v) => v.toFixed(2)).join('/') : typeof o[k] === 'number' ? o[k].toFixed(3) : o[k])).join(',');
    return o;
  }
  // how far out n plots reach (true metres), without making the plan (measured on plans of every kind: tools/towns/census.js)
  function approxR(morph, opt, n) {
    if (n <= 0) return 30;
    if (morph === 'organic') return 14.5 * Math.sqrt(n * (opt.front[0] + opt.front[1]) / 17) + 12;
    if (morph === 'grid') return 15.5 * Math.sqrt(n * (opt.front[0] + opt.front[1]) / 17) + 22;
    if (morph === 'medina') return 0.68 * opt.cell * Math.sqrt(n) + 12;
    if (morph === 'compound') return 0.29 * opt.spacing * Math.sqrt(n) + 6;
    return 0.6 * opt.spacing * Math.sqrt(n) + 6;
  }
  // what a town is now: its place, its record, its kind, its plan's options, how far into its age its people are, how many
  // households, whether it is a city of the machine age (its old town on the plan, the rest by zone), how far out it reaches
  const tpCache = new Map();
  function townPlan(sim, i, c) {
    const people = peopleOf(sim, i); const rec = sim.townRec ? sim.townRec(i) : null; const cul = civCulture(sim, c); const P = progressOf(c);
    const key = Math.round(Math.log2(people + 1) * 24) + '|' + Math.floor(P * 50) + '|' + (rec ? rec[1] + ',' + rec[3] : '') + '|' + cul;
    let tp = tpCache.get(i); if (tp && tp.key === key) return tp;
    const st = window.VERN.site(sim, i, c);
    const foundEra = rec && rec[1] >= 0 ? rec[1] : Math.min(c.era | 0, 2);
    const morph = window.PLOTS.morphOf(st.fam, st.region, cul, foundEra);
    const opt = tp && tp.morph === morph && tp.foundEra === foundEra && tp.cul === cul ? tp.opt : planOpt(i, morph, st, cul, foundEra);
    const nAll = people / PPP; const city = !!(rec && rec[3] > 0) && P >= 6;
    const n = Math.max(1, Math.round(Math.min(NFINE, city ? bandPeople(rec[3]) / PPP : nAll)));
    const Rcore = approxR(morph, opt, n); let R = Rcore;
    if (!city && nAll > NFINE) R = Math.sqrt(Rcore * Rcore + (nAll - NFINE) * AREA_P / Math.PI);
    if (city) R = Math.max(Rcore, Rmodern(people, P, cul));
    tp = { key, st, rec, foundEra, morph, opt, P, city, nAll, n, Rcore, R, cul };
    tpCache.set(i, tp); if (tpCache.size > 3000) tpCache.delete(tpCache.keys().next().value);
    return tp;
  }
  // the plan itself: made once, and again larger as the town outgrows it. A few a moment, so that flying in over a country of
  // towns does not stall the picture; a town whose plan is still to come is drawn as from afar until it has it
  const budget = { on: true, last: -1e9, gap: 90 };
  function getPlan(i, tp) {
    const have = window.PLOTS.cached(i, tp.morph, tp.opt.sig);
    if (have && (have.plots.length >= tp.n || have.full)) return have;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (budget.on && now - budget.last < budget.gap) return have && have.plots.length ? have : null;
    budget.last = now;
    return window.PLOTS.plan(i, tp.morph, Object.assign({ need: Math.ceil(tp.n * 1.3) + 8, r0: approxR(tp.morph, tp.opt, tp.n * 1.3) * 1.35 + 40 }, tp.opt));
  }
  function radiusTrue(sim, i, c) { return c ? townPlan(sim, i, c).R : clamp(Math.sqrt(peopleOf(sim, i) * APC[0] / Math.PI), 60, 9000); }
  function radiusM(sim, i, c) { const Rt = radiusTrue(sim, i, c); return Rt * scaleOf(Rt); }   // the radius as drawn, metres
  function fieldsM(sim, i, c) { const R = radiusM(sim, i, c); return R * (1.7 + 0.14 * sim.infra[i]) + 1200; }      // how far out the town's fields reach (its farmsteads stand among them)

  // ---------- gates ----------
  // The angles (radians, east toward north) at which roads leave a town and its gates stand: where its main streets run out
  // (plots.js, from the same dice as its plan). For a far town drawn in blocks, its lanes run out the same ways.
  const isPlanned = (era0, cul, era = styleEra(era0, cul)) => era === 3 || era >= 6 || (era >= 4 && cul === 6);   // (the blocks of a city of the machine age are gridded)
  const exitCache = new Map();
  function exitsOf(i, tp, r) {
    const key = tp.opt.sig + '|' + Math.round(r / 10); const hit = exitCache.get(i); if (hit && hit.key === key) return hit.a;
    const a = window.PLOTS.exits(i, tp.morph, tp.opt, r); exitCache.set(i, { key, a }); if (exitCache.size > 4000) exitCache.delete(exitCache.keys().next().value); return a;
  }
  // where a road heading toward `bearing` leaves town i: [the gate's angle, how far out its lane runs (drawn metres)]
  function gateToward(sim, i, c, bearing) {
    const tp = townPlan(sim, i, c); const gs = exitsOf(i, tp, tp.Rcore * 1.05 + 10); let best = gs[0], bd = 9;
    for (const a of gs) { const da = Math.abs(((a - bearing) + Math.PI * 3) % (Math.PI * 2) - Math.PI); if (da < bd) { bd = da; best = a; } }
    return [best, radiusM(sim, i, c) * 1.12];
  }

  // ---------- what stands on a plot ----------
  // the kit's (and the models') houses of the first ages: true footprint [w, d] (d into the plot), to fit them to their plots
  const KSZ = { hut: [6.5, 6.5], tipi: [5.5, 5.5], longhouse: [7, 22], stilt: [5, 8], adobe: [7, 7], pueblo: [8, 8], courtyard: [12, 12], courtyardc: [12, 12], domehouse: [8, 8], gable: [8, 10], hip: [9, 8], curved: [9, 7], halftimber: [7, 7], townhouse: [8, 9], mansard: [10, 10], palazzo: [16, 14], terrace: [12, 8], tenement: [20, 13], granary: [4, 4] };
  // who builds wall to wall in town (the place's family: houses.js leaves such a house's gables flush with its neighbours')
  const ROWS = { euro: 1, mena: 1, sasia: 1, easia: 1 };
  // the stuff of a yard's bounds, by the place: a wall of field stones, of mud, a hedge, a fence of wattle, palings or bamboo
  function boundOf(st, era) {
    const R = st.region;
    if (st.dry > 0.5 || R === 'meso' || R === 'egypt' || R === 'sahel' || R === 'arab' || R === 'pers' || R === 'casia' || R === 'swest') return 'mud';
    if (st.mount >= 0.5 || R === 'greece' || R === 'ital' || R === 'iber' || R === 'levant' || R === 'anat' || R === 'andes' || R === 'ice' || R === 'cauc' || R === 'hima' || R === 'tibet') return 'stone';
    if ((R === 'brit' || R === 'lowc' || R === 'nfra' || R === 'germ') && era >= 4) return 'hedge';
    if (R === 'brit' && era < 4) return 'stone';
    return 'fence';
  }

  // ---------- layout ----------
  const cache = new Map();
  function worksOf(sim, i) { return sim.works ? sim.works.get(i) || null : null; }
  function keyOf(sim, i, c, coarse) {
    const p = sim.pop[i]; const band = Math.round(Math.log2(p * 1000 + 1) * 3); const year = sim.year;
    const q = sim.rubble && sim.rubble.has(i) ? Math.min(3, Math.floor((year - sim.rubble.get(i)) / 10)) : -1;
    const wl = worksOf(sim, i); const wsig = wl ? wl.map(w => w.k + w.slot + ':' + Math.min(8, Math.floor((year - w.start) / w.dur * 8))).join(',') : '';
    const gY = sim.gYear ? sim.gYear[i] : -1e9; const age = year - gY; const T = BUILD_T[c.era]; const gsig = !coarse && age < T * 1.3 && sim.gPrev[i] < sim.gBand[i] ? `${sim.gPrev[i]}:${Math.floor(age / 1.5)}` : '';
    const rec = sim.townRec ? sim.townRec(i) : null;
    return `${sim.level[i]}|${c.era}|${sim.walls[i]}|${sim.special[i]}|${civCulture(sim, c)}|${c.capital === i ? 1 : 0}|${band}|${sim.infra[i]}|${coarse ? 'c' : 'f'}|${q}|${wsig}|${sim.slotA ? sim.slotA[i] : 0}|${sim.slotB ? sim.slotB[i] : 0}|${gsig}|${rec ? rec.join(',') : ''}|${sim.ind && sim.ind.has(i) ? Array.from(sim.ind.get(i)).join('.') : ''}`;
  }
  function pickW(list, r) { let s = 0; for (const e of list) s += e[1]; let t = r * s; for (const e of list) { t -= e[1]; if (t <= 0) return e; } return list[list.length - 1]; }

  // one building: kind, x (east m), z (north m), w, h, d (m), yaw (rad from east toward north), colour hex, style, flags, prog (0..1 while under construction)
  function layout(sim, i, c, opts) {
    const coarse = !!(opts && opts.coarse);
    const tp = townPlan(sim, i, c);
    const Pp = coarse ? null : getPlan(i, tp); const fine = !!Pp;      // (no plan yet: drawn in blocks, as from afar, for a moment)
    const key = keyOf(sim, i, c, !fine) + '|' + Math.floor(tp.P * 50) + '|' + (fine ? Math.min(tp.n, Pp.plots.length) : coarse ? 'c' : 'p');
    const ck = coarse ? -1 - i : i; const hit = cache.get(ck);
    if (hit && hit.key === key) return hit;
    const year = sim.year;
    const eraReal = c.era, lvl = sim.level[i], cul = tp.cul, cname = CULTURES[cul];
    const era = styleEra(eraReal, cul), band = bandOf(era);        // the town's great buildings, walls and quarters are planned in the manner of this era (the old ways last: see OLD_UNTIL)
    const quake = sim.rubble && sim.rubble.has(i) ? Math.min(3, Math.floor((year - sim.rubble.get(i)) / 10)) : -1;
    const people = peopleOf(sim, i); const R = tp.R; const kS = scaleOf(R), kH = hScale(kS);
    const tallK = clamp(Math.log10(people / 30000) / 2.2, 0, 1);      // (how tall a city's towers rise is how many live in it: a town of sixty thousand has towers of a hundred metres, a city of millions its supertalls)
    const isCap = c.capital === i; const sp = sim.special[i]; const wallsL = sim.walls[i]; const infra = sim.infra[i];
    const houses = HOUSES[cname][band]; const pal = PAL[cname][band];
    const items = []; const rnd = (k) => hash(i, k);
    const push = (kind, x, z, w, h, d, yaw, color, style, flags, prog) => { const it = { kind, x, z, w, h, d, yaw, color, style: style + (flags || 0) * 1024 }; if (prog !== undefined && prog < 1) it.prog = Math.max(0.02, prog); items.push(it); return it; };
    const colorOfP = (p, k) => { const s = p[Math.floor(rnd(k) * p.length) % p.length]; const v = 0.88 + rnd(k + 1) * 0.24; const r = Math.min(255, ((hex(s) >> 16) & 255) * v), g = Math.min(255, ((hex(s) >> 8) & 255) * v), b = Math.min(255, (hex(s) & 255) * v); return (r << 16) | (g << 8) | b; };
    const colorOf = (k) => colorOfP(pal, k);
    // --- what is being built here, and how far along ---
    const wl = coarse ? null : worksOf(sim, i);
    const workProg = (kind) => { if (!wl) return -1; const w = wl.find(x => x.k === kind); return w ? clamp((year - w.start) / w.dur, 0, 1) : -1; };
    const workSlot = (kind) => { if (!wl) return -1; const w = wl.find(x => x.k === kind); return w ? w.slot : -1; };
    // --- growth: the newest plots are still going up in the years after the town grew (and as you look: world.js) ---
    const T = BUILD_T[eraReal]; const gY = sim.gYear ? sim.gYear[i] : -1e9; const age = year - gY;
    const growing = fine && age < T * 1.3 && sim.gPrev && sim.gPrev[i] < sim.gBand[i];
    const nPrev = growing ? Math.round(Math.min(NFINE, bandPeople(sim.gPrev[i]) / PPP)) : 1e9;
    // --- plan geometry (true metres) ---
    const axis = tp.opt.axis;                                       // the town's long way: its square, its first road, the grid of its blocks
    const ca = Math.cos(axis), sa = Math.sin(axis);
    const planned = isPlanned(era, cul);
    const square = Pp ? Pp.square : { w: tp.opt.sq ? tp.opt.sq[0] : 30, d: tp.opt.sq ? tp.opt.sq[1] : 30, a: axis };
    const plaza = Math.max(square.w, square.d) * 0.5 + 3;          // (the square, or the open middle of a village of yards or tents)
    const nTarget = Math.min(coarse ? 3000 : 9000, Math.round(people / PPB[era] * (0.85 + rnd(4) * 0.3) * (walled(era, cul) ? 1.5 : 1)));      // (the blocks of a far town, and of a city's zones)
    let s = Math.sqrt(Math.PI * R * R * 0.62 / Math.max(8, nTarget));    // block spacing (m)
    s = clamp(s, [7, 8, 8, 9, 8, 9, 11, 14, 16, 18][era], 90);
    const blockN = planned ? 3 : 0;                                   // blocks per side before a street (the zones of a city)
    const street = planned ? s * (era >= 7 ? 0.36 : era >= 6 ? 0.5 : 0.6) : 0;      // (a city street is fifteen to thirty metres across, its pavements and verges beside it)
    const nPlots = fine ? Math.min(tp.n, Pp.plots.length) : 0; const Rplan = fine ? window.PLOTS.radAt(Pp, nPlots) : tp.Rcore;
    // --- walls: they stand where they were raised, round the town as it was then (its size band then: the town's record) ---
    const wallWork = workProg('walls'); const wallLvl = wallsL || (wallWork >= 0 ? 1 : 0);
    const wallStyle = wallLvl ? wallStyleOf(era, cul) : 'none';
    const wallBand = tp.rec && tp.rec[4] > 0 ? tp.rec[4] : sim.gBand ? sim.gBand[i] : 0;
    const wallN = Math.max(1, Math.min(NFINE, Math.round(bandPeople(wallBand) / PPP)));
    const wallR = wallLvl ? (fine && !tp.city ? window.PLOTS.outerAt(Pp, Math.min(wallN, Pp.plots.length), 0.9) + 6 : approxR(tp.morph, tp.opt, Math.min(wallN, tp.n)) * 1.1 + 8) : (Rplan * 1.06 + 8);      // (round nine in ten of the houses there were then: the rest strung out along the roads are its suburbs)
    const gates = exitsOf(i, tp, (wallLvl ? wallR : tp.Rcore * 1.05) + 10);      // (where the main streets run out through the walls)
    // a far town's lanes (drawn in blocks): radial lanes out of the gates and more as it grows, and ring lanes
    const lanes = gates.slice(); const nLanes = clamp(Math.round(R / 60), 4, 18); for (let k = 0; k < nLanes; k++) lanes.push(axis + (k + 0.5) / nLanes * Math.PI * 2 + (rnd(50 + k) - 0.5) * 0.3);
    const ringStep = clamp(R / 4, 80, 220);
    // how a city of the machine age and after is laid out (below, at its zones): computed here, for the quarters need it too
    const big = clamp((lvl - 1) / 3, 0, 1) * clamp(Math.log10(people / 3000) / 2, 0.3, 1);
    const CK = ['euro', 'euro', 'east', 'mena', 'afr', 'sasia', 'easia', 'seasia', 'latin', 'amer'][cul];
    const oldTown = era >= 6 && lvl >= 2 && (CK === 'euro' || CK === 'east' || CK === 'mena');      // (the old town kept: its lanes, its houses, its cathedral or mosque)
    const coreF = tp.city ? clamp(tp.Rcore / R, 0, 1) : 0;      // (how much of the city the old town on its plan is)
    const oldR = oldTown ? Math.max(coreF, 0.1 + 0.06 * big) : 0;
    const coreR = era === 6 ? 0.2 + 0.12 * big : 0.08 + 0.12 * big;      // (a downtown of towers is a few square kilometres even in a city of millions)
    const innerR = oldTown ? oldR + 0.22 + 0.08 * big : coreR + (CK === 'amer' ? 0.1 : 0.2 + 0.1 * big), subR = era === 6 ? 0.8 : CK === 'amer' ? innerR + 0.06 : Math.max(innerR + 0.1, 0.7 - 0.06 * big);
    const bizA = axis + 2.3 + (rnd(24) - 0.5) * 0.8;      // where an old city's towers stand: a quarter of their own beyond the old town
    const biz = era < 7 ? null : oldTown ? { x: Math.cos(bizA) * R * (oldR + 0.1 + 0.1 * big), z: Math.sin(bizA) * R * (oldR + 0.1 + 0.1 * big), r: R * (0.05 + 0.08 * big) } : { x: 0, z: 0, r: R * coreR };
    // districts (Civ-style quarters) on the ring of plots the player places them on, at a distance that is the town's for its
    // life (the old temple, the old market stand in the old town); works in progress rise there too
    const dist = {};
    const distR = Math.max(square.w, square.d) * 0.5 + 95;
    const used = new Set();
    const placed = (kind, bit, r) => {
      const have = sp & bit; const sl = have ? (sim.slotOf ? sim.slotOf(i, kind) : -1) : workSlot(kind); const prog = have ? 1 : workProg(kind);
      if (!have && prog < 0) return null; if (sl >= 0) used.add(sl);
      const a = sl >= 0 ? slotAngle(i, axis, sl) : axis + Math.PI / 4 + (kind === 'temple' ? 0 : kind === 'academy' ? 2.4 : kind === 'market' ? 4.8 : 1.2) + rnd(60 + bit) * 0.4;
      return { a, r, prog };
    };
    const dT = placed('temple', 4, distR); if (dT) dist.temple = dT;
    const dA = placed('academy', 2, distR); if (dA) dist.academy = dA;
    const dM = placed('market', 8, distR * 0.85); if (dM) dist.market = dM;
    const dN = placed('mine', 512, distR + 190); if (dN) dist.mine = dN;
    // what the town has raised to work its goods (workshops, a granary, a shipyard...): each stands on the plot it was given
    { const indA = sim.ind ? sim.ind.get(i) : null;
      if (sim.IND) for (let q = 0; q < sim.IND.length; q++) {
        const kind = sim.IND[q]; const have = indA ? indA[q] : 0; const sl = have ? have - 1 : workSlot(kind); const prog = have ? 1 : workProg(kind);
        if (!have && prog < 0) continue; if (sl >= 0) used.add(sl);
        dist['ind_' + kind] = { a: sl >= 0 ? slotAngle(i, axis, sl) : axis + 0.9 + q * 0.55, r: kind === 'factory' || kind === 'refinery' || kind === 'lab' ? distR + 420 : distR * 0.98, prog, ind: kind };
      } }
    if (era >= 9 && lvl >= 3) { const nA = lvl >= 4 ? 3 : 1; for (let k = 0; k < nA; k++) dist['arco' + k] = { a: axis + 0.6 + k * 2.1 + (rnd(70 + k) - 0.5) * 0.4, r: Math.max(R * (0.42 + 0.1 * k), tp.Rcore + 300), prog: 1 }; }      // (cities in one building, about a great city's middle)
    if (era >= 9 && lvl >= 3 && isCap) dist.spaceport = { a: axis + 3.9 + (rnd(73) - 0.5) * 0.5, r: R * 1.2, prog: 1 };      // (and beyond a capital its spaceport)
    if (oldTown && era >= 6) dist.station = { a: axis + 0.75 * Math.PI + (rnd(67) - 0.5) * 0.5, r: Math.max(R * (oldR + 0.05), Rplan + 40), prog: 1 };      // (an old city's railway came to the edge of its old town; its stadium went up at the edge of the city)
    if (oldTown && era >= 7 && lvl >= 3) dist.stadium = { a: axis + 4.2 + (rnd(68) - 0.5) * 0.4, r: Math.max(R * 0.74, Rplan + 150), prog: 1 };
    if (era >= 6 && lvl >= 2) dist.industry = { a: axis + Math.PI / 4 + 3.6 + rnd(63) * 0.4, r: Math.max(R * 0.85, Rplan + 120), prog: 1 };
    if (isCap && era >= 1 && !timberTown(era, cul)) dist.palace = { a: axis + Math.PI * 0.5 + (rnd(66) - 0.5) * 0.4, r: plaza + 26, prog: 1 };      // (in a timber town the great hall on the square is the king's)
    if (wallLvl && era >= 3 && era <= 5 && !timberTown(era, cul)) dist.keep = { a: axis + Math.PI * 1.5, r: (wallR - 8) * 0.72, prog: 1 };      // a stone keep within the walls (not in the timber towns)
    // coast direction for the harbour: nearest sea cell
    let coast = null; const portProg = (sp & 1) ? 1 : workProg('port');
    if (portProg >= 0) { const y = (i / W) | 0, x = i - y * W; let best = null, bd = 9; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const yy = y + dy, xx = ((x + dx) % W + W) % W; if (yy >= 0 && yy < H && !sim.land[yy * W + xx]) { const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = Math.atan2(-dy, dx); } } } if (best !== null) coast = best; else coast = axis; dist.harbour = { a: coast, r: Math.max(R, Rplan) * 1.02, prog: portProg }; if (dist.ind_shipyard) { dist.ind_shipyard.a = coast + 0.42; dist.ind_shipyard.r = Math.max(R, Rplan) * 1.0; } }
    const ore = !sim.goods || !sim.goods[i] || !sim.GOODS || !!sim.GOODS[sim.goods[i]].mine;      // what is worked here comes out of the ground (else it grows or grazes: an estate, not a pit)
    for (const k in dist) { const d = dist[k]; d.x = Math.cos(d.a) * d.r; d.z = Math.sin(d.a) * d.r; d.rad = d.ind ? (d.ind === 'factory' || d.ind === 'refinery' || d.ind === 'lab' ? 70 : 15) : k === 'stadium' ? 115 : k === 'station' ? 44 : k.startsWith('arco') ? 250 : k === 'spaceport' ? 220 : k === 'industry' ? Math.min(R * 0.3, 160) : k === 'palace' ? 34 : k === 'harbour' ? Math.min(Math.max(R, Rplan) * 0.35, 120) : k === 'market' ? 30 : k === 'mine' ? (ore ? 46 : 17) : k === 'keep' ? 30 : 34; }

    // --- landmark at the square's edge, facing in, on the side the roads leave free; a wonder rises there over decades ---
    const wonderProg = (sp & 16) ? 1 : workProg('wonder');
    const wEra = styleEra(Math.min(9, (sp & 16) ? (sp >> 5) & 15 : eraReal), cul);       // a wonder keeps the form of the age that raised it
    const lmKind = wonderProg >= 0 ? WONDER[cname][wEra] : timberTown(era, cul) ? 'hall' : oldTown ? LANDMARK[cname][3] : LANDMARK[cname][band];      // (a timber town gathers round its great hall; an old city round its cathedral or mosque still)
    const lmAngle = (() => { const ex = exitsOf(i, tp, plaza + 20); let best = axis + Math.PI * 1.5, bd = -1;
      for (let q = 0; q < 4; q++) { const a = axis + Math.PI * 1.5 + q * Math.PI / 2; let dm = 9; for (const e of ex) dm = Math.min(dm, Math.abs(Math.atan2(Math.sin(a - e), Math.cos(a - e)))); if (dm > bd + 0.05) { bd = dm; best = a; } }
      return best; })();
    const lmR = Math.abs(Math.cos(lmAngle - axis)) * square.w * 0.5 + Math.abs(Math.sin(lmAngle - axis)) * square.d * 0.5 + 3;      // (from the middle to the square's edge that way)
    const landmarkSize = (kind, big) => {
      const S = { menhirs: [plaza * 1.4, 3.5, plaza * 1.4], ziggurat: [46, 22, 46], pyramid: [110, 70, 110], steppyramid: [44, 26, 44], temple: [34, 17, 58], colosseum: [150, 45, 120], cathedral: [44, 60, 96], church: [16, 22, 34], basilica: [60, 55, 90], mosque: [50, 40, 50], tajmosque: [60, 55, 60], mudmosque: [36, 18, 36], onion: [24, 34, 40], hall: [48, 18, 26], pagoda: [22, 42, 22], stupa: [40, 26, 40], shikhara: [26, 42, 34], stepped: [60, 34, 60], mound: [70, 12, 70], pueblo: [40, 12, 30], palace: [110, 22, 40], keep: [26, 30, 26], station: [70, 18, 30], crystal: [120, 30, 60], irontower: [60, 300, 60], stadium: [190, 40, 150], spire: [70, 600, 70], lighthouse: [16, 55, 16], granary: [10, 8, 10] , arcology: [180, 140, 180], elevator: [300, 12000, 300] }[kind] || [30, 15, 30];
      const m = big ? (kind === 'menhirs' ? 2.2 : kind === 'irontower' || kind === 'spire' ? 1.3 : kind === 'elevator' ? 1 : 1.9) : 1;      // (the space elevator's cable is as long as it is)
      if (kind === 'spire' && !big) S[1] = 120 + 480 * tallK;      // (a town's mast stands as high as its towers; the great ones are a capital's wonder)
      return [S[0] * m, S[1] * m, S[2] * m];
    };
    const hasLm = lvl >= 2 || era === 0 || isCap;
    const lmPlot = hasLm ? (() => { const [lw, , ld] = landmarkSize(lmKind, wonderProg >= 0); return { x: Math.cos(lmAngle) * (lmR + ld * 0.5), z: Math.sin(lmAngle) * (lmR + ld * 0.5), r: Math.max(lw, ld) * 0.5 }; })() : null;
    const distL = Object.values(dist);      // (filled in above: the quarters stand where they are)
    const cellPass = (x, z, pad) => { for (let q = 0; q < distL.length; q++) { const d = distL[q], dx = x - d.x, dz = z - d.z, rr = d.rad + (pad || 0); if (dx * dx + dz * dz < rr * rr) return false; } return true; };
    const heightOf = (kind, cent) => {
      const base = { hut: 4, tipi: 5, longhouse: 5, stilt: 6, adobe: 4.5, pueblo: 7, courtyard: 5.5, courtyardc: 5.5, domehouse: 6, gable: 7.5, hip: 7, curved: 6.5, halftimber: 10, townhouse: 12, mansard: 16, palazzo: 16, terrace: 8.5, tenement: 18, block: 16, tower: 60, skyscraper: 160, granary: 5, villa: 7.5, bungalow: 5.5, slab: 30, podium: 80, cyltower: 120, taper: 300, mill: 18, mall: 11 }[kind] || 6;
      const cap = [7, 9, 10, 14, 18, 22, 28, 320, 520, 900][era];
      let h = base * (0.85 + rnd(7) * 0.3);
      if (kind === 'block') h = (10 + 18 * cent) * (0.7 + rnd(8) * 0.6);
      if (kind === 'tower') h = (35 + 90 * cent * (lvl >= 3 ? 1.6 : 1)) * (0.7 + rnd(9) * 0.6);
      if (kind === 'skyscraper') h = (120 + 260 * cent * (lvl >= 4 ? 1.5 : 1)) * (0.7 + rnd(10) * 0.7);
      return Math.min(cap, h);
    };
    let nSites = 0, nHouses = 0;

    // --- the houses on the town's plots (plots.js), each of its place and of when it was last built (vern.js) ---
    // A plot's house was last built some way behind the town's own day (its lag: most a little, a few a long way, the newest
    // plots of late), so a town passes into a new manner of building house by house. Before the Middle Ages a house is one of
    // its people's models (or the kit's); from then on a type of the place's own, fitted to its plot: wall to wall in a town
    // where people build so, in its yard elsewhere, the yard fenced as the place fences, its woodpile, its stack of hay, its
    // beds, its shed; a village of the first ages its fires and racks.
    if (fine) {
      const st = tp.st, fam = window.VERN.CULFAM[cul], P0 = tp.P, nT = window.VERN.nTypes(lvl), town = lvl >= 2 || isCap, morph = Pp.morph;
      const P1 = Math.min(tp.foundEra, P0);      // (no house older than its town)
      const bnd = boundOf(st, era); const cold = st.snow > 0.3, dryL = st.dry > 0.5;
      const compDone = new Set();
      for (let p = 0; p < nPlots; p++) {
        const pl = Pp.plots[p];
        const dm = Math.min(pl.dep, 14) * 0.5; const cx = pl.x + pl.nx * dm, cz = pl.z + pl.nz * dm; const dC = Math.hypot(cx, cz);
        // the ground a quarter, the great building, a wall or a city's towers have taken
        if (lmPlot && Math.hypot(cx - lmPlot.x, cz - lmPlot.z) < lmPlot.r + Math.max(pl.f, dm) * 0.5 + 3) continue;
        if (!cellPass(cx, cz, Math.max(pl.f, dm) * 0.5 + 2)) continue;
        if (wallStyle !== 'none') { const rF = Math.hypot(pl.x, pl.z), rB = Math.hypot(pl.x + pl.nx * pl.dep, pl.z + pl.nz * pl.dep); if (Math.min(rF, rB) < wallR + 5 && Math.max(rF, rB) > wallR - 5) continue; }      // (a plot the wall runs through)
        if (tp.city && biz && !oldTown && Math.hypot(cx - biz.x, cz - biz.z) < biz.r) continue;
        const u = hash(i, 7000 + p); const young = clamp((p - nPlots * 0.8) / (nPlots * 0.2 + 1), 0, 1);
        const lag = Math.min(2.5, -Math.log(1 - 0.995 * u) * LAGM) * (1 - young);
        const Pe = Math.max(P1, P0 - lag); const eE = Math.min(9, Math.floor(Pe)), fE = Pe - eE;
        let prog = 1;
        if (growing && p >= nPrev) { const t0 = hash(i, 7050 + p) * T * 0.7; prog = clamp((age - t0) / (T * 0.45), 0, 1); if (prog <= 0) continue; }
        const r1 = hash(i, 7100 + p), r2 = hash(i, 7150 + p), r3 = hash(i, 7250 + p);
        const ctx0 = town && pl.rank === 3 ? 'rich' : town && (pl.rank <= 1 && dC < Rplan * 0.55 || morph === 'medina' && dC < Rplan * 0.85 || morph === 'grid' && dC < Rplan * 0.7) ? 'urban' : 'rural';
        const ctx = ctx0 === 'urban' && lvl >= 3 && pl.rank === 0 && dC < Rplan * 0.35 && r3 < 0.25 ? 'rich' : ctx0;
        let it = null, hx = 0, hw = 0, hd = 0, setback = 0;      // (the house's place on its plot: across, wide, deep, back from the street)
        if (quake >= 0 && hash(i, 7300 + p) < 0.35 * (1 - quake / 3)) {      // (fallen in the earthquake)
          it = push('rubble', cx, cz, Math.min(pl.f * 0.8, 10), 5, Math.min(pl.dep * 0.6, 10), pl.yaw, 0x8f8a80, packStyle(WALL.stone, ROOF.flat, cul, FLAG.ruin)); it.pk = p; continue;
        }
        if (eE < 4) {
          // the first ages: a house of the people's own (a model where there is one, else the kit's), fitted to its plot
          const sE = styleEra(eE, cul), hb = bandOf(sE); const list = HOUSES[cname][hb]; const pl2 = PAL[cname][hb];
          let tot = 0; const wts = list.map((e) => { const z = KSZ[e[0]] || [8, 8]; const ok = z[0] * 0.8 <= pl.f - 0.6 && z[1] * 0.8 <= pl.dep - 1; const w = e[1] * (ok ? 1 : 0.04); tot += w; return w; });
          let t = r1 * tot, e = list[0]; for (let q = 0; q < list.length; q++) { t -= wts[q]; if (t <= 0) { e = list[q]; break; } }
          const z = KSZ[e[0]] || [8, 8]; hw = Math.min(z[0], pl.f - 0.8); hd = Math.min(z[1], pl.dep - 1.5);
          setback = eE === 0 ? 2 + 6 * r2 : eE <= 2 ? 1 + 3 * r2 : morph === 'grid' || ctx !== 'rural' ? 0.3 : 1.5 + 2 * r2;
          if (setback + hd > pl.dep - 0.5) setback = Math.max(0.2, pl.dep - 0.5 - hd);
          hx = (r3 - 0.5) * Math.max(0, pl.f - hw - 1) * (eE <= 1 ? 1 : 0.5);
          const jit = (eE === 0 ? 0.35 : eE <= 2 ? 0.12 : 0) * (hash(i, 7350 + p) - 0.5) * 2;
          const xd = Math.cos(pl.yaw), zd = Math.sin(pl.yaw); const D0 = setback + hd * 0.5;
          it = push(e[0], pl.x + pl.nx * D0 + xd * hx, pl.z + pl.nz * D0 + zd * hx, hw, heightOf(e[0], clamp(1 - dC / R, 0, 1)), hd, pl.yaw + jit, colorOfP(pl2, 7400 + p * 3), packStyle(e[2], e[3], cul, 0), 0, prog);
          it.era = sE; it.pk = p;
        } else {
          // a house of the place's own type, of the manner it was built in, fitted to the plot. Where people build wall to wall a
          // town's plot holds a house or two side by side, the frontage shared out among them (each its own type and paint);
          // where they build apart, one in its yard; a family's yard in Africa, its huts round it or one house of rooms about it
          const sk = window.VERN.styleAt(st, eE, fE, fam, r1); let types = window.VERN.types(sk, ctx, st, nT);
          const roundish = types[0].plan === 'round' && types[types.length - 1].plan === 'round';
          if (roundish && ctx !== 'rural') types = window.VERN.types(sk, 'rural', st, nT);
          const attached = !roundish && ctx !== 'rural' && !!ROWS[st.fam] && morph !== 'medina' && morph !== 'compound' && morph !== 'cluster';
          let ax = pl.x, az = pl.z, yaw = pl.yaw, F0 = pl.f, D1 = pl.dep, nxx = pl.nx, nzz = pl.nz;
          if (morph === 'compound' && !roundish && pl.comp !== undefined) {      // (one house of rooms about the family's yard)
            if (compDone.has('h' + pl.comp)) continue; compDone.add('h' + pl.comp);
            F0 = D1 = pl.cr * 1.9; ax = pl.cx - pl.nx * pl.cr * 0.95; az = pl.cz - pl.nz * pl.cr * 0.95;
          }
          const m = attached ? Math.max(1, Math.round(F0 / (ctx === 'rich' ? 13 : 7.5))) : 1; const fS = F0 / m;
          const xd = Math.cos(yaw), zd = Math.sin(yaw); let placed = 0;
          for (let j = 0; j < m; j++) {
            const rj = j ? hash(i, 7270 + p * 7 + j) : r3;
            let sb = attached ? 0 : ctx === 'urban' ? 0.8 + 2 * r2 : (st.fam === 'nam' || st.fam === 'amer') && eE >= 6 ? 5 + 5 * r2 : morph === 'medina' || morph === 'compound' || morph === 'cluster' ? 0.4 : 1.5 + 4 * r2;
            const gap = attached ? 0 : clamp(fS * 0.12, 1.2, 4); const wMax = fS - gap;
            let g = null, sc = 1, F = null;
            for (const tl of ctx === 'rich' ? [types, window.VERN.types(sk, 'urban', st, nT)] : [types]) {
              const nt = tl.length; const q0 = Math.floor(rj * nt);
              for (let q = 0; q < nt && !g; q++) {
                const gq = tl[(q0 + q) % nt]; const Fq = window.VERN.foot(gq); const fw = Fq.x1 - Fq.x0, fd = Fq.z1 - Fq.z0; let s1 = 1;
                if (attached) { if (gq.plan === 'round' || gq.annex || gq.gal && gq.gal.side !== 'front' || gq.chim.at === 'side') continue; s1 = fS / gq.w; if (s1 < 0.8 || s1 > 1.25) continue; }
                else if (fw > wMax) { s1 = wMax / fw; if (s1 < 0.8) continue; }
                const room = D1 - (pl.cell ? 0.3 : 1.5); if (fd * s1 + sb > room) { const sb2 = Math.max(0.3, room - fd * s1); if (sb2 < sb) sb = sb2; if (fd * s1 + sb > room) { const s2 = (room - sb) / fd; if (s2 < 0.8) continue; s1 = Math.min(s1, s2); } }
                g = gq; sc = s1; F = Fq;
              }
              if (g) break;
            }
            if (!g) continue;      // (nothing of the place's would stand on so mean a plot: it stays a yard)
            const fw = (F.x1 - F.x0) * sc, fd = (F.z1 - F.z0) * sc;
            const along = (j + 0.5) * fS - F0 * 0.5 + (attached ? 0 : (r2 - 0.5) * Math.max(0, wMax - fw) * 0.8); const D0 = sb + fd * 0.5;
            const cols = window.VERN.colours(g, (Math.imul(i, 7919) + Math.imul(p, 104729) + j * 7) >>> 0);
            it = push('vh', ax + nxx * D0 + xd * along, az + nzz * D0 + zd * along, fw, window.VERN.heightOf(g) * sc, fd, yaw, cols[0], packStyle(WALL.plaster, ROOF.tile, cul, 0), 0, prog);
            it.g = g; it.sc = sc; it.pal = cols; it.pk = m > 1 ? p + '.' + j : p; it.era = eE; it.u = 1;
            // (the type's own middle is not its footprint's: where its origin lies from the footprint's middle, in its own frame)
            it.ofx = -(F.x0 + F.x1) * 0.5 * sc; it.ofz = -(F.z0 + F.z1) * 0.5 * sc;
            if (!placed) { hx = along; hw = fw; hd = fd; setback = sb; } else { hw = Math.abs(along - hx) + fw; hx = (hx + along) * 0.5; hd = Math.max(hd, fd); }
            placed++; if (placed > 1) nHouses++;
          }
          if (!placed) continue;
          if (morph === 'compound' && !roundish) continue;      // (its yard is the house's court)
        }
        nHouses++; if (prog < 1) nSites++;
        // --- the yard: what a household keeps about its house ---
        if (pl.cell && morph === 'medina') continue;      // (a house of the medina is its plot: its yard is its court)
        const ye = (k) => hash(i, 20000 + p * 17 + k);
        const xd = Math.cos(pl.yaw), zd = Math.sin(pl.yaw);
        const at = (along, depth) => [pl.x + pl.nx * depth + xd * along, pl.z + pl.nz * depth + zd * along];
        const prop = (kind, along, depth, w, h, d, yaw, col, style) => { const [x, z] = at(along, depth); const q = push(kind, x, z, w, h, d, yaw, col, style); q.u = 1; q.prop = 1; q.pk = 'y' + p + kind; return q; };
        const back0 = setback + hd + 0.8, back1 = pl.dep - 0.6, room = back1 - back0;      // the yard behind the house
        const sideL = hx - hw * 0.5 - 0.6, sideR = hx + hw * 0.5 + 0.6, edgeL = -pl.f * 0.5 + 0.4, edgeR = pl.f * 0.5 - 0.4;
        const rural = ctx === 'rural', eR = eE;
        if (morph === 'compound' && pl.comp !== undefined) {
          // a family's yard: its fence of reeds or wall of mud all round, the granaries, the fire in the middle
          if (!compDone.has(pl.comp)) { compDone.add(pl.comp); const R0 = pl.cr + 4.5, ns = 12, mud = dryL || eR >= 6;
            for (let k = 0; k < ns; k++) { if (k === Math.floor(ye(1) * ns)) continue; const a0 = k / ns * Math.PI * 2, a1 = (k + 1) / ns * Math.PI * 2; const x0 = pl.cx + Math.cos(a0) * R0, z0 = pl.cz + Math.sin(a0) * R0, x1 = pl.cx + Math.cos(a1) * R0, z1 = pl.cz + Math.sin(a1) * R0;
              const q = push(mud ? 'yardwall' : 'fence', (x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) * 1.02, mud ? 1.6 : 1.8, mud ? 0.45 : 0.2, Math.atan2(z1 - z0, x1 - x0), mud ? 0xa8804e : 0xb39a62, packStyle(mud ? WALL.adobe : WALL.wood, ROOF.flat, cul, FLAG.thing)); q.u = 1; q.prop = 1; q.pk = 'c' + pl.comp + ':' + k; }
            for (let k = 0; k < 2; k++) { const a = ye(2) * 6.28 + k * 0.9; const q = push('granary', pl.cx + Math.cos(a) * pl.cr * 0.35, pl.cz + Math.sin(a) * pl.cr * 0.35, 2.6, 3.2, 2.6, 0, 0xb08a5a, packStyle(WALL.adobe, ROOF.thatch, cul, 0)); q.u = 1; q.prop = 1; q.pk = 'c' + pl.comp + 'g' + k; }
            if (eR <= 6) { const q = push('firepit', pl.cx, pl.cz, 1.6, 0.4, 1.6, 0, 0x6f6a62, packStyle(WALL.stone, ROOF.flat, cul, FLAG.thing)); q.u = 1; q.prop = 1; q.pk = 'c' + pl.comp + 'f'; } }
          continue;
        }
        if (eR <= 1) {
          // a village of the first ages: a hearth before the door, a rack for hides or fish, the firewood
          if (ye(3) < 0.55) prop('firepit', hx + (ye(4) - 0.5) * hw, setback * 0.5, 1.4, 0.35, 1.4, 0, 0x6f6a62, packStyle(WALL.stone, ROOF.flat, cul, FLAG.thing));
          if (ye(5) < (st.coast || st.k === 2 || st.k === 3 ? 0.5 : 0.25)) prop('rack', ye(6) < 0.5 ? sideL - 1.4 : sideR + 1.4, setback + hd * (0.3 + 0.5 * ye(7)), 3, 2, 0.8, pl.yaw + Math.PI / 2, 0x7a6248, packStyle(WALL.wood, ROOF.flat, cul, FLAG.thing));
          if ((cold || st.wood > 0.4) && ye(8) < 0.35) prop('woodpile', ye(30) < 0.5 ? sideL - 0.8 : sideR + 0.8, setback + hd * 0.5, 2.2, 1.1, 1.0, pl.yaw + Math.PI / 2, 0x6e5238, packStyle(WALL.wood, ROOF.flat, cul, FLAG.thing));
          continue;
        }
        // the bounds of the yard: its sides and its back, by the place's way (in the country and in villages; in a town where houses stand apart)
        if ((rural || !ROWS[st.fam]) && morph !== 'medina' && morph !== 'cluster' && ye(9) < (rural ? 0.85 : 0.5) && eR <= 8 && room > 2) {
          const kind = bnd === 'mud' || bnd === 'stone' ? 'yardwall' : bnd === 'hedge' ? 'hedge' : 'fence';
          const hh = kind === 'yardwall' ? (bnd === 'mud' ? 1.9 : 1.2) : kind === 'hedge' ? 1.6 : (eR >= 6 && st.fam === 'nam' ? 1.0 : 1.3);
          const th = kind === 'yardwall' ? 0.5 : kind === 'hedge' ? 0.9 : 0.12;
          const col = kind === 'yardwall' ? (bnd === 'mud' ? 0xb08a5c : 0x9a948a) : kind === 'hedge' ? 0x3e5528 : eR >= 6 && st.fam === 'nam' ? 0xe8e6e0 : 0x7d6a54;
          const sty = packStyle(kind === 'yardwall' ? (bnd === 'mud' ? WALL.adobe : WALL.stone) : kind === 'hedge' ? WALL.plaster : WALL.wood, ROOF.thatch, cul, kind === 'hedge' ? FLAG.garden | FLAG.thing : FLAG.thing);
          const d0 = Math.max(0.3, setback * 0.6), d1 = pl.dep - 0.3, L = d1 - d0;
          if (L > 1 && ye(10) > 0.1) prop(kind, -(pl.f * 0.5 - th * 0.5), d0 + L * 0.5, L, hh, th, pl.yaw + Math.PI / 2, col, sty);      // (one side each: the other is the neighbour's)
          if (L > 1 && p + 1 < nPlots && Pp.plots[p + 1].st !== pl.st) prop(kind, pl.f * 0.5 - th * 0.5, d0 + L * 0.5, L, hh, th, pl.yaw + Math.PI / 2, col, sty);      // (and the far side at the end of a row)
          if (ye(12) < 0.8) prop(kind, 0, d1, pl.f - 0.2, hh, th, pl.yaw, col, sty);
          if (setback > 2.5 && (eR >= 6 && st.fam === 'nam' || bnd === 'stone' || bnd === 'hedge' || ye(13) < 0.3)) for (const sd of [-1, 1]) prop(kind, sd * pl.f * 0.3, Math.max(0.35, setback * 0.15), pl.f * 0.38, hh * 0.85, th, pl.yaw, col, sty);      // (and before it, a gate between)
        }
        // the firewood against the house, where winters are cold or the woods are near
        if (eR <= 7 && (cold || st.wood > 0.45) && ye(14) < (rural ? 0.7 : 0.35)) { const left = ye(15) < 0.5, x = left ? sideL - 0.5 : sideR + 0.5; if (x > edgeL && x < edgeR) prop('woodpile', x, setback + hd * (0.35 + 0.4 * ye(16)), Math.min(3.2, hd * 0.6), 1.3, 0.9, pl.yaw + Math.PI / 2, 0x6e5238, packStyle(WALL.wood, ROOF.flat, cul, FLAG.thing)); else if (room > 3) prop('woodpile', hx, back0 + 0.6, Math.min(3, hw * 0.6), 1.3, 0.9, pl.yaw, 0x6e5238, packStyle(WALL.wood, ROOF.flat, cul, FLAG.thing)); }
        if (room < 3) continue;
        // the kitchen garden: beds behind the house (none where the land is too dry to water)
        if (eR >= 1 && !dryL && ye(17) < (rural ? 0.6 : 0.4)) { const gw = Math.min(pl.f - 1.6, 4 + 6 * ye(18)), gd = Math.min(room - 1, 3 + 5 * ye(19)); if (gd > 1.5) prop('garden', (ye(20) - 0.5) * Math.max(0, pl.f - 1.6 - gw), back0 + 0.8 + gd * 0.5, gw, 0.3, gd, pl.yaw, 0x6b5238, packStyle(WALL.adobe, ROOF.flat, cul, FLAG.garden | FLAG.thing)); }
        // a stack of hay or straw in the yard of a farming household
        if (rural && eR >= 1 && eR <= 6 && !dryL && st.k !== 11 && ye(21) < 0.4 && room > 5) prop('haystack', (ye(22) - 0.5) * (pl.f - 4), back1 - 2.6, 3.4, 3.6, 3.4, ye(23) * 3, 0xc7a85e, packStyle(WALL.plaster, ROOF.thatch, cul, 0));
        // a shed or a byre at the back
        if (eR >= 2 && eR <= 8 && ye(24) < (rural ? 0.5 : 0.25) && room > 4.5) { const w = 3 + 2 * ye(25), d = 2.6 + 1.4 * ye(26); prop('shed', (ye(27) < 0.5 ? -1 : 1) * Math.max(0, pl.f * 0.5 - w * 0.5 - 0.5), back1 - d * 0.5 - 0.2, w, 2.6, d, pl.yaw + Math.PI, eR >= 6 ? 0x8a8278 : 0x7a6247, packStyle(eR >= 6 ? WALL.wood : WALL.wood, eR >= 6 ? ROOF.metal : bnd === 'mud' ? ROOF.flat : ROOF.thatch, cul, 0)); }
        // a cart in the yard, before the machine age
        if (rural && eR >= 1 && eR <= 6 && ye(28) < 0.12) prop('cart', (ye(29) - 0.5) * (pl.f - 3), back0 + 1.5, 1.6, 1.4, 3, pl.yaw + 0.3, 0x6e5537, packStyle(WALL.wood, ROOF.flat, cul, FLAG.thing));
      }
    }

    // --- a far town, a town whose plan is still to come, and a city's zones beyond its old town: drawn on a grid ---
    // The mud-brick towns of the old world (the Mediterranean, the Near East, India) were built wall to wall: houses
    // of one alignment sharing party walls, in blocks between the lanes; so were the timber towns of the medieval
    // north. Elsewhere each house stands in its own yard.
    const dense = !planned && walled(era, cul);
    const n = Math.ceil(R * 1.3 / s);
    // --- the city of the machine age and after (style era 6 on). Every people's cities grew in their own way. The old cities of
    // Europe and the Middle East kept their old towns, the towers going up in a business quarter beside them; those of the Americas
    // put their towers in the middle and spread out in houses with gardens; East Asia housed its millions in towers of flats in
    // rows on their blocks, the Soviet east in slabs; the fast-growing cities of the south grew at their edges in houses people
    // built themselves. By where a plot lies (rr: 0 the middle, 1 the edge) and how great the city is (big: 0 a market town, 1 a
    // metropolis of millions). A plot of a modern city is a block of sixty to ninety metres (fewer drawn buildings than houses:
    // one stands for sixty people and more), so where houses stand it holds a cluster of them (the kit's homes, rows, walled,
    // shacks: each house of it its own size, roof and colour), and a block of flats is one building round its court.
    const SMALL = { hut: 1, adobe: 1, courtyard: 1, courtyardc: 1, gable: 1, hip: 1, curved: 1, stilt: 1, domehouse: 1, townhouse: 1, halftimber: 1, pueblo: 1, longhouse: 1, tipi: 1 };
    void SMALL;
    const GLASS = ['#9fb3c4', '#a9c0c9', '#8fa5b8', '#b8c4cc', '#7f98a8', '#94a8a0'];
    // the houses' paint, by how each people paints them (a cluster's houses each take a shade of it in the shader)
    const HOMEPAL = { euro: cul === 1 ? ['#a35a45', '#8f4a3a', '#e9e3d5', '#d9c9a5', '#b46a4d'] : cul === 0 ? ['#e9d3b0', '#efe1c6', '#d9b98c', '#f2ebdc', '#e3c4a0'] : ['#e4d3b8', '#c9d3c0', '#e8dcc0', '#b9c4cc'], east: ['#d8c9a0', '#b9c7b0', '#c9b8a0', '#a9b8c4', '#e0d6c0'], mena: ['#efe8d8', '#e6d4b0', '#f4efe4', '#d9c39a'], afr: ['#d9c39a', '#c9a26e', '#e3cfa4', '#b8c4b0', '#d6b0a0'], sasia: ['#efe6d4', '#f0d9b0', '#d9e0d4', '#f2d0c0', '#c9d6e0'], easia: ['#e6e2da', '#d9d6cc', '#c9ccd0', '#efeae0'], seasia: ['#efe6d4', '#e0d0b0', '#d0dcd0', '#f0e0c0'], latin: ['#f1d9a6', '#e7a87f', '#9fc7c0', '#efe4cc', '#e6c060', '#c9a0b8'], amer: ['#efeae0', '#e6dfd2', '#d9cdb4', '#b9c6d0', '#c9cdb4', '#e8d8b0'] }[CK];
    const FLATPAL = { euro: ['#d6d2c8', '#c7c2b8', '#e2ddd3', '#d9c9ad'], east: ['#c9ccd0', '#b9bcc0', '#d6d0c0', '#c4cbc4'], mena: ['#e4dfd3', '#d8d2c4', '#efece4'], afr: ['#dcd5c8', '#cfc7b8', '#e9e3d8'], sasia: ['#e8e4da', '#dcd8cc', '#efe0d0'], easia: ['#d9dbde', '#c9ccd0', '#e6e8ea', '#d6d0c6'], seasia: ['#e4dfd3', '#d8d2c4', '#efece4'], latin: ['#e6dfd2', '#efe4cc', '#d9d2c4', '#f1d9a6'], amer: ['#d9d2c4', '#c8c0b1', '#e6dfd2', '#b9b4aa'] }[CK];
    const flatsWall = (q) => (cul === 1 || cul === 2 || cul === 9) ? (q < 0.45 ? WALL.brick : WALL.concrete) : cul === 6 ? WALL.concrete : (q < 0.5 ? WALL.plaster : WALL.concrete);
    const capH = [7, 9, 10, 14, 18, 22, 28, 450, 830, 1000][era];
    const pitched = CK === 'euro' && cul !== 0 || CK === 'east' || CK === 'amer' ? ROOF.slate : CK === 'easia' ? ROOF.glazed : ROOF.tile;
    // one plot's building by its kind: [kind, wall, roof, w, d, h (true metres), flags, palette]. A cluster needs a plot large
    // enough for its houses to be houses; on a smaller one it is one house or block of the same sort
    const spec = (kind, q, q2, q3) => {
      switch (kind) {
        case 'homes': { const wm = CK === 'amer' ? (q3 < 0.55 ? WALL.wood : q3 < 0.8 ? WALL.brick : WALL.plaster) : CK === 'east' ? WALL.wood : cul === 1 && q3 < 0.6 ? WALL.brick : WALL.plaster;
          if (s >= 45) return ['homes', wm, pitched, s * 0.94, s * 0.92, 9 + 2.4 * q2, FLAG.block, HOMEPAL];
          if (s >= 26) return ['homes4', wm, pitched, s * 0.92, s * 0.9, 9 + 2.4 * q2, FLAG.block, HOMEPAL];
          return [q2 < 0.6 ? 'villa' : 'bungalow', wm, pitched, s * (0.5 + 0.12 * q3), s * (0.46 + 0.12 * q2), q2 < 0.6 ? 7.5 : 5.5, 0, HOMEPAL]; }
        case 'rows': if (s >= 24) return ['rows', WALL.brick, cul === 0 || cul === 3 || cul === 5 || cul === 8 ? ROOF.tile : ROOF.slate, s * 0.97, s * 0.92, 10 + 1.5 * q2, FLAG.block, era >= 7 ? HOMEPAL : ['#8f4a3a', '#7d4033', '#a35a45', '#9a6a4a']];
          return ['terrace', WALL.brick, cul === 0 || cul === 3 || cul === 5 || cul === 8 ? ROOF.tile : ROOF.slate, s * 0.97, s * (0.56 + 0.1 * q3), 8.5 + 3 * q2, 0, ['#8f4a3a', '#7d4033', '#a35a45']];
        case 'walled': if (s >= 28) return ['walled', q3 < 0.7 ? WALL.plaster : WALL.concrete, ROOF.flat, s * 0.94, s * 0.94, 7 + 3.5 * q2, FLAG.block, HOMEPAL];
          return ['adobe', WALL.plaster, ROOF.flat, s * 0.6, s * 0.56, 6 + 2 * q2, 0, HOMEPAL];
        case 'shacks': if (s >= 22) return ['shacks', q3 < 0.5 ? WALL.concrete : WALL.plaster, q2 < (CK === 'latin' || CK === 'mena' ? 0.25 : 0.6) ? ROOF.metal : ROOF.flat, s * 0.96, s * 0.96, 7 + 3 * q2, FLAG.block, HOMEPAL];      // (tin in Africa and India; in Latin America the roof of concrete that the next floor goes up on)
          return ['adobe', WALL.plaster, ROOF.metal, s * 0.66, s * 0.6, 4 + 2 * q2, 0, HOMEPAL];
        case 'compound': { const H = (era >= 8 ? 70 + 60 * q2 : 40 + 40 * q2) * (0.7 + 0.5 * tallK); if (s >= 55) return ['compound', WALL.concrete, ROOF.flat, s * 0.94, s * 0.94, Math.min(capH, H), 0, FLATPAL];
          return ['tower', WALL.concrete, ROOF.flat, s * 0.5, s * 0.56, Math.min(capH, H), 0, FLATPAL]; }
        case 'perimold': if (s >= 34) return ['perimold', cul === 2 ? WALL.plaster : q3 < 0.4 && cul === 1 ? WALL.brick : WALL.stone, cul === 0 ? ROOF.tile : ROOF.slate, s * 0.95, s * 0.95, 21 + 6 * q2, 0, era >= 7 ? FLATPAL : pal];
          return ['mansard', WALL.plaster, ROOF.slate, s * 0.82, s * 0.78, 17 + 4 * q2, 0, pal];
        case 'perimeter': if (s >= 34) return ['perimeter', flatsWall(q3), ROOF.flat, s * 0.95, s * 0.95, 18 + (8 + 10 * tallK) * q2, 0, FLATPAL];
          return ['block', flatsWall(q3), ROOF.flat, s * 0.8, s * 0.8, 14 + 10 * q2, 0, FLATPAL];
        case 'slab': { const H = CK === 'east' ? 27 + (12 + 20 * tallK) * q2 : 15 + (12 + 25 * tallK) * q2; return ['slab', CK === 'east' ? WALL.concrete : flatsWall(q3), ROOF.flat, s * 0.96, s * (0.36 + 0.1 * q3), Math.min(capH, H), 0, FLATPAL]; }
        case 'block': return ['block', flatsWall(q3), ROOF.flat, s * (0.76 + 0.12 * q2), s * (0.76 + 0.12 * q3), Math.min(capH, (CK === 'sasia' || CK === 'latin' ? 12 : 10) + (8 + 8 * tallK) * q2), 0, FLATPAL];
        case 'flats': return ['tower', q2 < 0.3 && era >= 8 ? WALL.glass : flatsWall(q3), ROOF.flat, s * (0.46 + 0.2 * q3), s * (0.46 + 0.2 * q2), Math.min(capH, (era >= 8 ? 40 : 30) + (14 + 80 * tallK) * q2), 0, FLATPAL];
        case 'tenement': return ['tenement', WALL.plaster, ROOF.flat, s * (0.8 + q2 * 0.14), s * (0.76 + q3 * 0.16), 14 + 8 * q2, 0, pal];
        case 'shophouse': return ['terrace', WALL.plaster, ROOF.flat, s * 0.97, s * (0.6 + 0.14 * q3), 10 + 4 * q2, 0, HOMEPAL];
        case 'mall': return ['mall', WALL.concrete, ROOF.flat, s * 0.96, s * 0.96, 10 + 3 * q2, 0, FLATPAL];
        case 'greentower': return ['greentower', q3 < 0.5 ? WALL.glass : WALL.concrete, ROOF.flat, s * (0.56 + 0.12 * q3), s * (0.56 + 0.12 * q2), Math.min(capH, 50 + (30 + 120 * tallK) * q2), FLAG.garden, q3 < 0.5 ? GLASS : FLATPAL];
        case 'vertfarm': return ['vertfarm', WALL.glass, ROOF.flat, s * (0.6 + 0.16 * q3), s * (0.6 + 0.16 * q2), Math.min(capH, 40 + 60 * q2), FLAG.garden, ['#9fc4a8', '#a9cdb0', '#94b89c']];
      }
      return null;
    };
    // what each people builds where: [kind, weight] by ring (the towers of the middle come before all of these)
    const pickZ = (list, q) => { let t = 0; for (const e of list) t += e[1]; let r = q * t; for (const e of list) { r -= e[1]; if (r <= 0) return e[0]; } return list[list.length - 1][0]; };
    const Z = {
      euro: [[[era >= 8 ? 'perimeter' : 'perimold', 7], ['slab', 1.5], ['block', 1.5]], [['slab', 4.5], ['perimeter', 2.5], ['block', 3]], cul === 1 ? [['rows', 4.5], ['homes', 5.5]] : cul === 0 ? [['homes', 6], ['walled', 2], ['rows', 2]] : [['homes', 7], ['slab', 3]]],
      east: [[['perimold', 4], ['slab', 4], ['flats', 2]], [['slab', 6], ['flats', era >= 8 ? 4 : 2.5], ['block', 1.5]], [['homes', 7], ['slab', 3]]],
      mena: [[['block', 6], ['walled', 2], ['slab', 2]], [['walled', 5.5], ['block', 4.5]], [['walled', 8], ['homes', 2]]],
      afr: [[['block', 6], ['slab', 2.5], ['perimeter', 1.5]], [['shacks', 5.5], ['block', 3], ['walled', 1.5]], [['shacks', 7.5], ['walled', 2.5]]],
      sasia: [[['block', 7], ['tenement', 3]], [['block', 4.5], ['shacks', 4], ['tenement', 1.5]], [['shacks', 6], ['walled', 4]]],
      easia: [[['compound', 5.5], ['slab', 2], ['flats', 2.5]], [['compound', 8.5], ['slab', 1.5]], [['compound', 5], ['homes', 5]]],
      seasia: [[['compound', 4], ['shophouse', 4], ['block', 2]], [['compound', 4.5], ['shacks', 3.5], ['homes', 2]], [['shacks', 5], ['homes', 5]]],
      latin: [[['block', 5], ['flats', 2.5], ['perimeter', 2.5]], [['shacks', 5], ['block', 3], ['walled', 2]], [['shacks', 4.5], ['walled', 3.5], ['homes', 2]]],
      amer: [[['block', 4], ['slab', 2], ['flats', 2], ['homes', 2]], [['homes', 9], ['block', 1]], [['homes', 9.7], ['mall', 0.3]]],
    }[CK];
    const OLD = ['old'];
    // the Space Age: everyone housed (the self-built edges rebuilt), gardens on every roof and up the towers, farms in towers among them
    const dry = CK === 'mena' || CK === 'latin' || CK === 'afr' || CK === 'sasia';
    const Z9 = [[['greentower', 4], ['perimeter', 3], [CK === 'easia' || CK === 'seasia' ? 'compound' : 'slab', 2], ['flats', 1]],
      [['greentower', 2.5], ['vertfarm', 1.2], ['perimeter', 2.5], [CK === 'easia' || CK === 'seasia' ? 'compound' : 'slab', 2], ['homes', 1.8]],
      [['homes', 7], ['walled', dry ? 3 : 0.5], ['vertfarm', 0.4]]];
    const GREEN = { perimeter: 1, slab: 1, compound: 1, flats: 1, walled: 1 };
    // the kind of a plot in the city: a spec as above; OLD where the old town stands (its houses are the Renaissance's); null where
    // the people's own houses stand (the Industrial age's edge)
    const urban = (x, z, rr, k) => {
      if (era < 6) return null;
      const q = hash(i, k + 21), q2 = hash(i, k + 22), q3 = hash(i, k + 23);
      if (oldTown && rr < oldR) return OLD;
      if (era === 6) {
        if (rr < coreR) { const tall = q < 0.78; return [tall ? 'tenement' : 'mansard', tall && (cul === 1 || cul === 2 || cul === 9) ? WALL.brick : WALL.plaster, tall && (cul === 0 || cul === 3 || cul === 5) ? ROOF.flat : ROOF.slate, s * (0.8 + q2 * 0.14), s * (0.76 + q3 * 0.16), Math.min(capH, (13 + 9 * q2) * (1 + 0.25 * big)), 0, pal]; }
        if (rr < innerR) { if (q < 0.035) return ['mill', WALL.brick, ROOF.slate, s * 0.92, s * 0.7, 15 + 8 * q2, 0, ['#8f4a3a', '#7d4033', '#6f3a30']]; return CK === 'easia' || CK === 'seasia' ? spec('shophouse', q, q2, q3) : CK === 'euro' && cul === 0 || CK === 'east' ? spec(q < 0.5 ? 'perimold' : 'rows', q, q2, q3) : spec('rows', q, q2, q3); }
        return s >= 40 ? spec(CK === 'euro' || CK === 'east' ? (q < 0.6 ? 'rows' : 'homes') : 'homes', q, q2, q3) : null;      // (beyond the terraces the people's own houses: on a great city's plot, a block of them)
      }
      if (biz) { const dd = Math.hypot(x - biz.x, z - biz.z) / biz.r; if (dd < 1) {
        const g = Math.exp(-1.6 * dd * dd) * (0.25 + 0.75 * Math.pow(q, 1.8)) * (q2 > 0.95 ? 1.45 : 1);      // (the tallest in the middle, falling away, a few standing out above the rest)
        const H = era >= 9 ? 50 + (20 + 650 * tallK) * g : era >= 8 ? 40 + (10 + 520 * tallK) * g : 30 + (10 + 330 * tallK) * g;
        const glass = q3 < (era >= 8 ? 0.8 : 0.45);
        const kind = era >= 9 ? (g > 0.6 && tallK > 0.5 && q2 > 0.82 ? 'twist' : g > 0.72 && tallK > 0.6 && q2 > 0.6 ? 'taper' : q2 < 0.3 ? 'greentower' : q2 < 0.45 ? 'cyltower' : q2 < 0.62 ? 'podium' : 'tower')
          : era >= 8 ? (g > 0.72 && tallK > 0.6 && q2 > 0.55 ? 'taper' : q2 < 0.22 ? 'cyltower' : q2 < 0.55 ? 'podium' : 'tower') : (tallK > 0.4 && q2 < 0.3 ? 'skyscraper' : q2 < 0.62 ? 'podium' : 'tower');
        const wd = kind === 'taper' ? s * 0.96 : kind === 'podium' ? s * (0.86 + 0.1 * q3) : kind === 'twist' ? s * 0.9 : s * (0.58 + 0.26 * q3);
        return [kind, glass ? WALL.glass : kind === 'skyscraper' ? WALL.stone : WALL.concrete, ROOF.flat, wd, kind === 'podium' || kind === 'taper' || kind === 'cyltower' || kind === 'twist' ? wd : wd * (0.75 + 0.25 * q2), Math.min(capH, H), kind === 'greentower' ? FLAG.garden : 0, glass ? GLASS : FLATPAL]; } }
      const zone = rr < innerR ? 0 : rr < subR ? 1 : 2;
      if (era >= 9) { const o = spec(pickZ(Z9[zone], q), q, q2, q3); if (o && GREEN[o[0]]) o[6] |= FLAG.garden; return o; }
      if (zone === 2 && CK !== 'amer' && q < 0.02 && rr < 0.92 && lvl >= 2) return spec('mall', q, q2, q3);
      return spec(pickZ(Z[zone], q), q, q2, q3);
    };
    // the old town's plot: nine old houses wall to wall (a medina's about their courts), or on a small plot one of them
    const OLDH = HOUSES[cname][4], OLDP = PAL[cname][4];
    const oldSpec = (k) => { const e = pickW(OLDH, hash(i, k + 4)), q2 = hash(i, k + 22);
      if (s >= 30) return CK === 'mena' ? ['medina', WALL.plaster, ROOF.flat, s * 0.96, s * 0.96, 12 + 3 * q2, FLAG.block, OLDP] : ['oldtown', e[2], e[3], s * 0.96, s * 0.96, 17 + 4 * q2, FLAG.block, OLDP];
      return [e[0], e[2], e[3], s * 0.86, s * 0.84, 12 + 4 * q2, 0, OLDP]; };
    const TALL = { tower: 1, podium: 1, skyscraper: 1, cyltower: 1, taper: 1, twist: 1, greentower: 1 };
    // parks: a block of the grid left to grass and trees here and there, more of them the later the age, and more in the middle
    const parkP = planned && era >= 6 ? [0, 0, 0, 0, 0, 0, 0.05, 0.085, 0.11, 0.13][era] : 0;
    const parks = [], parkOf = new Map();
    const isPark = (gx, gy) => {
      if (!parkP) return false; const bx = Math.floor(gx / (blockN + 1)), by = Math.floor(gy / (blockN + 1)), key = bx * 8192 + by; let v = parkOf.get(key);
      if (v === undefined) { const u = (bx * (blockN + 1) + (blockN + 1) / 2) * s, w = (by * (blockN + 1) + (blockN + 1) / 2) * s; const x = u * ca - w * sa, z = u * sa + w * ca, rr = Math.hypot(x, z) / R;
        v = rr < 0.85 && Math.hypot(x, z) > plaza * 2 && (!fine || Math.hypot(x, z) > Rplan + blockN * s) && hash(i, 7000 + bx * 131 + by) < parkP * (0.6 + 0.8 * (1 - rr)) ? 1 : 0;
        if (v && lmPlot && Math.hypot(x - lmPlot.x, z - lmPlot.z) < lmPlot.r + blockN * s) v = 0;
        if (v) for (const kk in dist) if (Math.hypot(x - dist[kk].x, z - dist[kk].z) < dist[kk].rad + blockN * s) { v = 0; break; }
        if (v) parks.push([x, z, blockN * s * 0.5]); parkOf.set(key, v); }
      return v === 1;
    };
    // the grid: everything for a far town or one whose plan is still to come; for a city of the machine age, what lies beyond the
    // old town on its plan (and its towers, where they stand in the middle)
    let count = 0; const maxN = coarse ? 2600 : era >= 6 ? 20000 : 12000;      // (a city of millions is some twenty thousand plots: each a block of houses or flats, or a tower)
    const gridOn = !fine || tp.city;
    const slots = [];
    if (gridOn) for (let gy = -n; gy <= n; gy++) for (let gx = -n; gx <= n; gx++) {
      // streets: leave every (blockN+1)-th row/column empty in planned towns; organic towns leave radial lanes
      if (planned && ((gx % (blockN + 1) + blockN + 1) % (blockN + 1) === 0 || (gy % (blockN + 1) + blockN + 1) % (blockN + 1) === 0)) continue;
      if (parkP && isPark(gx, gy)) continue;      // (a park's block: its grass is laid below, its trees are trees.js's)
      let u = gx * s, v = gy * s;
      if (planned && era >= 6) { const mx = ((gx % (blockN + 1)) + blockN + 1) % (blockN + 1), my = ((gy % (blockN + 1)) + blockN + 1) % (blockN + 1); u += mx === 1 ? -0.15 * s : mx === blockN ? 0.15 * s : 0; v += my === 1 ? -0.15 * s : my === blockN ? 0.15 * s : 0; }      // (the plots beside a street come up to it: the city's blocks are its streets' frontages)
      if (!planned) { const jit = dense ? 0.1 : 0.7; u += (hash(i, 100 + gx * 131 + gy) - 0.5) * s * jit; v += (hash(i, 200 + gx * 131 + gy) - 0.5) * s * jit; }
      const x = u * ca - v * sa, z = u * sa + v * ca; const r = Math.hypot(x, z);
      if (r < plaza) continue;
      if (fine && r < Rplan * 1.02 + s * 0.5 && !(biz && !oldTown && Math.hypot(x - biz.x, z - biz.z) < biz.r)) continue;      // (the old town on the plan stands there)
      const ang = Math.atan2(z, x);
      if (!planned) { let lane = false; for (const g of lanes) { const da = Math.abs(((ang - g) + Math.PI * 3) % (Math.PI * 2) - Math.PI); if (da * r < s * 0.5 && r > plaza) { lane = true; break; } } if (!lane && era >= 1) { const rr = (r - plaza) % ringStep; if (rr < s * 0.75 && r - plaza > s) lane = true; } if (lane) continue; }
      const lump = 0.86 + 0.28 * (0.5 + 0.5 * Math.cos(ang * 3 + rnd(41) * 6.28)) * (0.5 + 0.5 * Math.sin(ang * 5 + rnd(42) * 6.28));
      const fill = (1 - (era >= 6 ? smooth(R * 0.84 * lump, R * 1.12 * lump, r) : smooth(R * 0.72 * lump, R * 1.25 * lump, r)) * 0.92) * (era >= 7 && r > R * subR ? 0.9 : 1);      // (a city of the machine age ends more sharply than a market town fades into its fields)      // (the suburbs: here and there a plot left to a school's field, a yard)
      if (hash(i, 300 + gx * 131 + gy) > fill) continue;
      if (!cellPass(x, z, 0)) continue;
      if (lmPlot && Math.hypot(x - lmPlot.x, z - lmPlot.z) < lmPlot.r + s * 0.45) continue;   // no house on the landmark's plot
      if (wallStyle !== 'none' && Math.abs(r - wallR) < s * 0.7 + 3) continue;               // nor on the line of the wall: a clear strip runs along it
      slots.push([r, x, z, gx, gy]);
    }
    slots.sort((a, b) => a[0] - b[0]);
    const coarseFrom = !fine ? 0 : (lvl >= 4 ? R * (era >= 6 ? 0.95 : 0.5) : 1e9);
    for (const [r, x, z, gx, gy] of slots) {
      if (count >= maxN) break;
      const cent = 1 - clamp(r / R, 0, 1); const k = 1000 + gx * 131 + gy;
      const yaw = axis + (planned ? (hash(i, k) < 0.5 ? 0 : Math.PI / 2) : (hash(i, k) - 0.5) * (dense ? 0.06 : 0.9) + (hash(i, k + 1) < 0.5 ? 0 : Math.PI / 2));
      if (r > coarseFrom || !fine) {
        // one instance per block at the edge of big cities (and for far towns)
        if ((gx % 2 + 2) % 2 || (gy % 2 + 2) % 2) continue;
        if (era >= 6) {      // (by zone: a tower stands for the towers about it, a cluster for the houses or flats of four plots)
          const u = urban(x, z, r / R, k), o = u === OLD ? oldSpec(k) : u;
          if (o) { const tall = TALL[o[0]]; push(o[0], x, z, Math.min(o[3] * (tall ? 1.5 : 1.9), s * 1.9), o[5], Math.min(o[4] * (tall ? 1.5 : 1.9), s * 1.9), axis, colorOfP(o[7], k + 3), packStyle(o[1], o[2], cul, o[6])); count++; continue; }
          push('blockold', x, z, s * 1.6, 7 + 2 * hash(i, k + 2), s * 1.6, axis, colorOf(k + 3), packStyle(houses[0][2], houses[0][3], cul, FLAG.block)); count++; continue;
        }
        const hh = 5 + 4 * cent;
        push('blockold', x, z, s * 1.7, hh, s * 1.7, axis, colorOf(k + 3), packStyle(houses[0][2], houses[0][3], cul, FLAG.block)); count++; continue;
      }
      // a city's block beyond its old town, by zone
      const u = urban(x, z, r / R, k); const o = u === OLD ? oldSpec(k) : u; if (!o) continue;
      const [kind, wm, rm, w, d, h, fl] = o;
      if (quake >= 0 && hash(i, k + 11) < 0.35 * (1 - quake / 3)) { push('rubble', x, z, w, Math.min(h * 0.75, 6), d, yaw, colorOfP(o[7], k + 10), packStyle(wm, ROOF.flat, cul, FLAG.ruin)); count++; continue; }
      const hit = push(kind, x, z, w, h, d, yaw, colorOfP(o[7], k + 10), packStyle(wm, rm, cul, fl)); if (u === OLD) hit.era = 5; count++;
    }

    // --- the parks' grass (its trees are planted by trees.js, which reads L.parks) ---
    const PARK = ['#5d8a45', '#668f4a', '#55803f', '#6a9450'];
    for (let q = 0; q < parks.length; q++) { const [x, z, hw] = parks[q]; push('lawn', x, z, hw * 2 * 0.97, 2.4, hw * 2 * 0.97, axis, colorOfP(PARK, 7400 + q), packStyle(WALL.plaster, ROOF.flat, cul, FLAG.thing)).tag = 'park'; }
    // --- the landmark itself (its plot was kept clear above) ---
    if (hasLm) {
      const [lw, lh, ld] = landmarkSize(lmKind, wonderProg >= 0);
      const lx = Math.cos(lmAngle) * (lmR + ld * 0.5), lz = Math.sin(lmAngle) * (lmR + ld * 0.5);
      const lmWall = lmKind === 'arcology' ? WALL.glass : lmKind === 'elevator' ? WALL.concrete : ['menhirs', 'mound'].includes(lmKind) ? WALL.stone : lmKind === 'mudmosque' || lmKind === 'stepped' && cul === 4 ? WALL.adobe : lmKind === 'irontower' ? WALL.brick : lmKind === 'crystal' || lmKind === 'spire' ? WALL.glass : lmKind === 'station' ? WALL.brick : ['hall', 'pagoda', 'onion'].includes(lmKind) ? WALL.wood : lmKind === 'stadium' ? WALL.concrete : ['mosque', 'tajmosque', 'basilica', 'palace', 'stupa'].includes(lmKind) ? WALL.plaster : WALL.stone;
      const lmRoof = ['hall', 'pagoda'].includes(lmKind) ? ROOF.glazed : ['onion', 'basilica', 'mosque', 'tajmosque', 'stupa'].includes(lmKind) ? ROOF.copper : lmKind === 'cathedral' || lmKind === 'church' || lmKind === 'station' ? ROOF.slate : lmKind === 'temple' || lmKind === 'palace' ? ROOF.tile : ROOF.flat;
      const lmCol = { menhirs: 0x8b857a, pyramid: 0xe7d9b0, ziggurat: 0xcdb082, steppyramid: 0xb9b0a0, temple: 0xf1ebdd, colosseum: 0xe6dcc4, cathedral: 0xc9c2b3, church: 0xd6cfc0, basilica: 0xebe3d0, mosque: 0xf3efe6, tajmosque: 0xf7f4ee, mudmosque: 0xb8845a, onion: 0xf1ede2, hall: 0xb3462f, pagoda: 0xa64534, stupa: 0xf3efe6, shikhara: 0xd8c39a, stepped: 0xa39a88, mound: 0x6f7f4a, pueblo: 0xc48f5f, palace: 0xf1e6cf, keep: 0x8c8478, station: 0x9a5a48, crystal: 0xd9e6ee, irontower: 0x6b5a4a, stadium: 0xd8dbdf, spire: 0xcbd7e0, lighthouse: 0xf2efe8 , arcology: 0xe9ece6, elevator: 0xdfe6ee }[lmKind] || 0xd9d2c2;
      const lmIt = push(lmKind, lx, lz, lw, lh, ld, lmAngle - Math.PI / 2, lmCol, packStyle(lmWall, lmRoof, cul, (wonderProg >= 0 ? FLAG.wonder | FLAG.landmark : FLAG.landmark) | (lmKind === 'arcology' ? FLAG.garden : lmKind === 'elevator' ? FLAG.neon : 0)), 0, wonderProg >= 0 ? wonderProg : 1); lmIt.tag = 'landmark'; if (wonderProg >= 0) lmIt.era = wEra;
      // plaza furniture
      const propKind = era === 0 ? null : era <= 2 || timberTown(era, cul) ? 'well' : era <= 5 ? 'fountain' : 'statue';      // (a well, not a fountain, on the square of a northern market town)
      if (propKind && !coarse) push(propKind, Math.cos(lmAngle + Math.PI) * plaza * 0.25, Math.sin(lmAngle + Math.PI) * plaza * 0.25, propKind === 'well' ? 3 : propKind === 'statue' ? 4 : 8, propKind === 'well' ? 2.5 : propKind === 'statue' ? 9 : 4, propKind === 'well' ? 3 : propKind === 'statue' ? 4 : 8, 0, 0xbfb6a6, packStyle(WALL.stone, ROOF.flat, cul, 0));
      // an obelisk on the square: the Nile lands raised them (and Aksum its stelae), nobody else in the old world did
      { const oy = (i / W) | 0, ox = i - oy * W; const olon = (ox + 0.5) / W * 360 - 180, olat = 90 - (oy + 0.5) / H * 180;
        if (era >= 1 && era <= 5 && cul === 3 && !coarse && lvl >= 3 && olon > 24 && olon < 40 && olat > 10 && olat < 32) push('obelisk', Math.cos(lmAngle + Math.PI * 0.5) * plaza * 0.5, Math.sin(lmAngle + Math.PI * 0.5) * plaza * 0.5, 4.2, 20, 4.2, 0, 0xd9c8a8, packStyle(WALL.stone, ROOF.flat, cul, 0)); }
    }
    // --- market day: stalls on the square of a town that has a market (the square's own, before the market hall's quarter) ---
    if (fine && era >= 1 && era <= 6 && (lvl >= 2 || dist.market)) { const nS = Math.min(14, 3 + lvl * 3); const sc2 = packStyle(WALL.wood, ROOF.thatch, cul, 0);
      for (let k = 0; k < nS; k++) { const t = (k + 0.5) / nS; const ax2 = (t - 0.5) * square.w * 0.7, az2 = (hash(i, 8800 + k) - 0.5) * square.d * 0.55; if (Math.hypot(ax2, az2) < 6) continue;
        const q = push('stall', ax2 * ca - az2 * sa, ax2 * sa + az2 * ca, 3.2, 2.8, 2.4, axis + (hash(i, 8820 + k) < 0.5 ? 0 : Math.PI), [0xc84a3a, 0xd9a94a, 0x5a8a5a, 0xe6dcc4, 0x4a6aa8][k % 5], sc2); q.u = 1; q.pk = 'st' + k; } }
    // --- districts ---
    const quarter = (d, main, mainSize, mainCol, wm, rm) => {
      const yaw = d.a - Math.PI / 2;                    // the head of a quarter faces the middle of the town (a building's front is its local +z)
      return push(main, d.x, d.z, mainSize[0], mainSize[1], mainSize[2], yaw, mainCol, packStyle(wm, rm, cul, FLAG.landmark), 0, d.prog);
    };
    const oldHoly = era <= 2 || timberTown(era, cul);      // holy places of the old kind: a shrine, not a temple of dressed stone
    if (dist.temple) { const tk = oldHoly ? (cul === 3 || cul === 5 ? 'ziggurat' : cul === 8 ? 'steppyramid' : 'stepped') : era === 3 ? 'temple' : LANDMARK[cname][band] === 'menhirs' ? 'temple' : (['cathedral', 'basilica', 'onion', 'station', 'stadium', 'spire', 'palace', 'arcology'].includes(LANDMARK[cname][band]) ? (cul === 3 || cul === 5 && era >= 5 ? 'mosque' : 'church') : LANDMARK[cname][band]); const sz = landmarkSize(tk, false); const th = quarter(dist.temple, tk, [sz[0] * 0.7, sz[1] * 0.8, sz[2] * 0.7], tk === 'church' ? 0xd6cfc0 : tk === 'temple' ? 0xf1ebdd : 0xe6dcc4, tk === 'mosque' ? WALL.plaster : WALL.stone, tk === 'church' ? ROOF.slate : tk === 'mosque' ? ROOF.copper : ROOF.tile); th.tag = 'temple'; if (oldHoly) th.as = 'shrine'; }
    if (dist.academy) quarter(dist.academy, era >= 6 ? 'palazzo' : era >= 3 ? 'temple' : 'courtyard', era >= 6 ? [36, 16, 22] : [26, 11, 34], 0xe7e0d2, era >= 6 ? WALL.brick : WALL.stone, era >= 6 ? ROOF.slate : ROOF.tile).as = 'academy';
    if (dist.palace) (quarter(dist.palace, era <= 2 ? (cul === 6 ? 'hall' : cul === 3 ? 'ziggurat' : cul === 8 ? 'steppyramid' : 'palace') : era <= 4 ? (cul === 6 ? 'hall' : 'keep') : era <= 5 ? (cul === 6 ? 'hall' : 'palace') : 'palace', era <= 2 ? [30, 10, 24] : era <= 4 ? [24, 26, 24] : [60, 18, 26], era >= 5 ? 0xf1e6cf : 0xd9cba8, WALL.stone, cul === 6 ? ROOF.glazed : ROOF.tile)).as = 'palace';
    if (dist.keep) { push('keep', dist.keep.x, dist.keep.z, 22, 28, 22, axis, 0x8c8478, packStyle(WALL.stone, ROOF.flat, cul, FLAG.landmark)); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; push('roundtower', dist.keep.x + Math.cos(a) * 19, dist.keep.z + Math.sin(a) * 19, 7, 20, 7, 0, 0x85807a, packStyle(WALL.stone, ROOF.slate, cul, 0)); } }
    if (dist.market && !coarse) { const d = dist.market; push('hall', d.x, d.z, Math.max(14, d.rad * 0.9), 6 + (era >= 3 ? 4 : 0), Math.max(10, d.rad * 0.6), d.a - Math.PI / 2, 0xd9b98c, packStyle(era >= 3 ? WALL.stone : WALL.wood, era >= 6 ? ROOF.metal : ROOF.tile, cul, FLAG.landmark), 0, d.prog).as = 'market'; if (d.prog >= 0.6) for (let k = 0; k < 8; k++) { const a = d.a + k * 0.7; const rr = d.rad * (0.5 + rnd(800 + k) * 0.5); push('stall', d.x + Math.cos(a) * rr, d.z + Math.sin(a) * rr, 3.2, 2.8, 2.4, rnd(810 + k) * 3, [0xc84a3a, 0xd9a94a, 0x5a8a5a, 0xe6dcc4][k % 4], packStyle(WALL.wood, ROOF.thatch, cul, 0)); } }
    // (an estate: a great barn, a second across the yard, the bins beside them)
    if (dist.mine && !coarse && !ore) { const d = dist.mine; const yaw = d.a - Math.PI / 2; const st = packStyle(WALL.wood, era >= 3 ? ROOF.tile : ROOF.thatch, cul, 0); const ox = Math.cos(d.a + Math.PI / 2), oz = Math.sin(d.a + Math.PI / 2), rx = Math.cos(d.a), rz = Math.sin(d.a);
      push('barn', d.x - ox * 3, d.z - oz * 3, 14, 5.5, 9, yaw, 0x8a6f4e, packStyle(WALL.wood, era >= 3 ? ROOF.tile : ROOF.thatch, cul, FLAG.landmark), 0, d.prog).as = 'estate';
      if (d.prog >= 0.6) { push('barn', d.x + ox * 7.5 - rx * 1.5, d.z + oz * 7.5 - rz * 1.5, 11, 5, 8, yaw + Math.PI / 2, 0x7a6247, st); if (!timberTown(era, cul)) for (let k = 0; k < 2; k++) push('granary', d.x + ox * (-2.3 + k * 4.6) - rx * 7, d.z + oz * (-2.3 + k * 4.6) - rz * 7, 6, 6, 6, 0, 0xc9b48c, packStyle(WALL.adobe, ROOF.thatch, cul, 0)); } }
    if (dist.mine && !coarse && ore) { const d = dist.mine; const yaw = d.a - Math.PI / 2; push(era >= 6 ? 'chimney' : 'keep', d.x, d.z, era >= 6 ? 4 : 8, era >= 6 ? 30 : 14, era >= 6 ? 4 : 8, yaw, era >= 6 ? 0x4a4440 : 0x6e5537, packStyle(era >= 6 ? WALL.brick : WALL.timber, ROOF.flat, cul, FLAG.landmark), 0, d.prog).as = 'mine'; for (let k = 0; k < 2; k++) push('barn', d.x + Math.cos(d.a + 1.2 + k * 2) * d.rad * 0.5, d.z + Math.sin(d.a + 1.2 + k * 2) * d.rad * 0.5, 12, 5, 8, yaw + k, 0x7a6247, packStyle(WALL.wood, ROOF.shingle, cul, 0), 0, d.prog); if (era > 2 && !timberTown(era, cul)) for (let k = 0; k < 4; k++) push('rubble', d.x + Math.cos(d.a + k * 1.5) * d.rad * 0.8, d.z + Math.sin(d.a + k * 1.5) * d.rad * 0.8, 9, 3.5, 9, rnd(830 + k) * 3, 0x6f685e, packStyle(WALL.stone, ROOF.flat, cul, FLAG.ruin)); }      // (spoil heaps: the kit's, so only where the kit builds the town)
    // workshops and stores: a shed of the working kind and, about it, what the trade leaves standing
    for (const key in dist) {
      const d = dist[key]; if (!d.ind || coarse) continue; const kind = d.ind, yaw = d.a - Math.PI / 2, pr = d.prog, late = era >= 6;
      const ox = Math.cos(d.a + Math.PI / 2), oz = Math.sin(d.a + Math.PI / 2), rx = Math.cos(d.a), rz = Math.sin(d.a);      // along the ring, and outward
      const at = (along, out) => [d.x + ox * along + rx * out, d.z + oz * along + rz * out];
      const plain = packStyle(WALL.wood, era >= 3 ? ROOF.tile : ROOF.thatch, cul, 0), stallSt = packStyle(WALL.wood, ROOF.thatch, cul, 0);
      const shed = (as, along, out, w, h, dd, col, rot) => { const [x, z] = at(along, out); const it = push(late ? 'warehouse' : 'barn', x, z, w, h, dd, yaw + (rot || 0), col, late ? packStyle(WALL.brick, ROOF.metal, cul, FLAG.landmark) : packStyle(WALL.wood, era >= 3 ? ROOF.tile : ROOF.thatch, cul, FLAG.landmark), 0, pr); it.as = as; return it; };
      // (round bins where the town's kind has them; in the timber towns of the medieval north a small barn does the same work)
      const bins = (n, along0, out, col) => { for (let k = 0; k < n; k++) { const [x, z] = at(along0 + k * 4.6, out); if (timberTown(era, cul)) push('barn', x, z, 7, 4.5, 6, yaw, 0x8a6f4e, plain, 0, pr); else push('granary', x, z, 6, 6, 6, 0, col, packStyle(late ? WALL.concrete : WALL.adobe, late ? ROOF.metal : ROOF.thatch, cul, 0), 0, pr); } };
      const stalls = (cols, out) => { cols.forEach((col, k) => { const [x, z] = at((k - (cols.length - 1) / 2) * 4.2, out); push('stall', x, z, 3.2, 2.8, 2.4, yaw, col, stallSt); }); };
      // (close together, like a yard: the sheds wall to wall, the bins in a block, the stalls before the door)
      if (kind === 'granary') { bins(3, -4.6, -2.3, 0xc9b48c); if (pr >= 1) bins(lvl >= 2 ? 3 : 2, lvl >= 2 ? -4.6 : -2.3, 2.3, 0xc2ab80); }
      else if (kind === 'warehouse') { shed('warehouse', 0, -4.2, 15, 6, 10, 0x8a6f4e); if (pr >= 0.6) shed('warehouse', 0, 4.2, 15, 6, 10, 0x7d6546); }
      else if (kind === 'workshop') { shed('workshop', -3, 0, 14, 5.5, 9, 0x8f7350); if (pr >= 0.6) shed('workshop', 7.5, -1.5, 11, 5, 8, 0x86694a, Math.PI / 2); if (pr >= 0.7) stalls([0xb86a3a, 0xd9c9a0], -7.5); }
      else if (kind === 'weaver') { shed('weaver', 0, 1.5, 16, 5, 8, 0xa58a62); if (pr >= 0.7) stalls([0xc84a3a, 0x3f6fa8, 0xe6dcc4], -6); }
      else if (kind === 'smithy') { shed('smithy', 0, 0, 12, 5.5, 9, 0x6e5a44); if (pr >= 0.7) { const [x, z] = at(-8, -3); push('well', x, z, 3, 2.5, 3, 0, 0x8a8478, packStyle(WALL.stone, ROOF.flat, cul, 0)); } if (late) { const [x, z] = at(8, 4); push('chimney', x, z, 3, 22, 3, 0, 0x5a4a44, packStyle(WALL.brick, ROOF.flat, cul, 0), 0, pr); } }
      else if (kind === 'brewery') { shed('brewery', -3.5, 0, 12, 5.5, 9, 0x94764a); bins(2, 5, 0, 0xb8a070); }
      else if (kind === 'shipyard') { shed('shipyard', 0, -12, 18, 6, 10, 0x7a6247, Math.PI / 2).hb = 1; if (pr >= 0.5) { const [x, z] = at(0, 12); push(late ? 'ship' : 'boat', x, z, late ? 34 : 11, late ? 8 : 3, late ? 8 : 3.4, d.a, late ? 0x5b6068 : 0x7c5a38, plain, 0, clamp((pr - 0.5) / 0.5, 0.1, 1)).hb = 1; } }
      else if (kind === 'factory') { for (let k = 0; k < 2; k++) { const [x, z] = at((k - 0.5) * 34, 0); push('factory', x, z, 42, 11, 26, yaw, era >= 7 ? 0x9ea3a8 : 0x7a4a3c, packStyle(era >= 7 ? WALL.concrete : WALL.brick, ROOF.metal, cul, k ? 0 : FLAG.landmark), 0, pr); } const [x, z] = at(0, 18); push('chimney', x, z, 3.5, 38, 3.5, 0, 0x5a4a44, packStyle(WALL.brick, ROOF.flat, cul, 0), 0, pr); }
      else if (kind === 'refinery') { const [x0, z0] = at(-16, 0); push('factory', x0, z0, 30, 9, 20, yaw, 0x8c9096, packStyle(WALL.concrete, ROOF.metal, cul, FLAG.landmark), 0, pr); for (let k = 0; k < 3; k++) { const [x, z] = at(8 + k * 9, 6); push('chimney', x, z, 3, 30 + k * 6, 3, 0, 0x9a9690, packStyle(WALL.concrete, ROOF.flat, cul, 0), 0, pr); } for (let k = 0; k < 3; k++) { const [x, z] = at(6 + k * 11, -10); push('granary', x, z, 10, 9, 10, 0, 0xd8dbdf, packStyle(WALL.concrete, ROOF.metal, cul, 0), 0, pr); } }
      else if (kind === 'lab') { for (let k = 0; k < 2; k++) { const [x, z] = at((k - 0.5) * 40, 0); push('factory', x, z, 46, 9, 30, yaw, 0xcfd9e2, packStyle(WALL.glass, ROOF.flat, cul, k ? 0 : FLAG.landmark), 0, pr); } }
    }
    for (const key in dist) if (key.startsWith('arco')) { const d = dist[key]; push('arcology', d.x, d.z, 430, 240 + 140 * tallK, 430, axis, 0xe9ece6, packStyle(WALL.glass, ROOF.flat, cul, FLAG.landmark | FLAG.garden)).as = 'arcology'; }
    if (dist.spaceport && !coarse) { const d = dist.spaceport, yaw = d.a - Math.PI / 2, ox = Math.cos(d.a + Math.PI / 2), oz = Math.sin(d.a + Math.PI / 2), rx = Math.cos(d.a), rz = Math.sin(d.a);
      for (let k = 0; k < 3; k++) push('rocket', d.x + ox * (k - 1) * 130 + rx * 60, d.z + oz * (k - 1) * 130 + rz * 60, 90, 120, 90, yaw, 0xe8ecef, packStyle(WALL.concrete, ROOF.flat, cul, FLAG.landmark | FLAG.thing)).as = 'spaceport';      // (a thing: no windows, no roof of its own - concrete, not a block of flats)
      push('warehouse', d.x - rx * 70, d.z - rz * 70, 150, 34, 80, yaw, 0xd8dbdf, packStyle(WALL.concrete, ROOF.metal, cul, 0)); push('tower', d.x - rx * 70 + ox * 110, d.z - rz * 70 + oz * 110, 22, 46, 22, yaw, 0xcfd9e2, packStyle(WALL.glass, ROOF.flat, cul, 0)); }
    if (!coarse && era >= 9 && lvl >= 2) for (let k = 0; k < 5; k++) { const a = rnd(1080 + k) * Math.PI * 2; const rr = R * (1.35 + rnd(1090 + k) * 0.7) + 60; push('solar', Math.cos(a) * rr, Math.sin(a) * rr, 170, 5, 120, axis + rnd(1100 + k) * 0.6, 0x9aa3ad, packStyle(WALL.glass, ROOF.flat, cul, FLAG.thing)); }      // (fields of panels turned to the sun)
    if (dist.station) { const d = dist.station; push('station', d.x, d.z, 70, 18, 30, d.a - Math.PI / 2, 0x9a5a48, packStyle(WALL.brick, ROOF.slate, cul, FLAG.landmark)).as = 'station'; }
    if (dist.stadium) { const d = dist.stadium; push('stadium', d.x, d.z, 190, 40, 150, d.a, 0xd8dbdf, packStyle(WALL.concrete, ROOF.flat, cul, FLAG.landmark)).as = 'stadium'; }
    if (dist.industry && !coarse && era >= 6 && era <= 7) { const d = dist.industry; for (let k = 0; k < (lvl >= 3 ? 2 : 1); k++) { const a = d.a + 1.9 + k * 0.45; push('gasometer', d.x + Math.cos(a) * R * 0.14, d.z + Math.sin(a) * R * 0.14, 32, 28, 32, 0, 0x5f6a70, packStyle(WALL.concrete, ROOF.flat, cul, 0)); } }      // (the gasholders by the works)
    if (dist.industry) { const d = dist.industry; const nF = coarse ? 2 : 3 + Math.min(4, lvl); for (let k = 0; k < nF; k++) { const a = d.a + (k - nF / 2) * 0.5; const rr = R * 0.12 * (k % 2 ? 1 : 0.4); push('factory', d.x + Math.cos(a) * rr, d.z + Math.sin(a) * rr, 42, 11, 26, axis + (k % 2 ? 0 : Math.PI / 2), era >= 7 ? 0x9ea3a8 : 0x7a4a3c, packStyle(era >= 7 ? WALL.concrete : WALL.brick, ROOF.metal, cul, 0)); if (era === 6 || rnd(850 + k) < 0.4) push('chimney', d.x + Math.cos(a) * rr + 14, d.z + Math.sin(a) * rr + 9, 3.5, 36, 3.5, 0, 0x5a4a44, packStyle(WALL.brick, ROOF.flat, cul, 0)); } }
    let harbour = null;
    if (dist.harbour) {
      const d = dist.harbour; const dirx = Math.cos(d.a), dirz = Math.sin(d.a); const pr = d.prog; const hb0 = items.length;
      const nP = coarse ? 1 : 2 + Math.min(3, lvl);
      for (let k = 0; k < nP; k++) { const off = (k - (nP - 1) / 2) * 22; const px = d.x + dirx * 40 - dirz * off, pz = d.z + dirz * 40 + dirx * off; const pp = clamp((pr - k * 0.12) / 0.5, 0, 1); if (pp <= 0) continue; push('pier', px, pz, 70 * Math.max(0.3, pp), 1.6, 4, d.a, 0x6a563e, packStyle(WALL.wood, ROOF.flat, cul, 0), 0);
        // boats lie alongside, clear of the planking: one near the head of each pier, and in a busier harbour another further in on the other side
        if (!coarse && pr >= 0.8) { const big = era >= 6; const side = (big ? 9 : 6.5) * (k % 2 ? -1 : 1);
          push(big ? 'ship' : 'boat', px + dirx * 20 - dirz * side, pz + dirz * 20 + dirx * side, big ? 34 : 9, big ? 8 : 2.5, big ? 8 : 3, d.a, big ? 0x5b6068 : 0x7c5a38, packStyle(WALL.wood, ROOF.flat, cul, 0));
          if (!big && lvl >= 2) push('boat', px - dirx * 2 + dirz * side, pz - dirz * 2 - dirx * side, 9, 2.5, 3, d.a + Math.PI, 0x7c5a38, packStyle(WALL.wood, ROOF.flat, cul, 0)); } }
      const shedKind = houses.reduce((b, e) => e[1] > b[1] ? e : b, houses[0])[0];      // early harbours: sheds built the way the houses are
      const nW = coarse ? 1 : 3 + lvl; for (let k = 0; k < nW; k++) { const off = (k - nW / 2) * (era <= 2 && shedKind === 'longhouse' ? 30 : 18); const pp = clamp((pr - 0.2 - k * 0.1) / 0.5, 0, 1); if (pp <= 0) continue; push(era >= 6 ? 'warehouse' : era <= 2 ? shedKind : 'gable', d.x - dirx * 22 - dirz * off, d.z - dirz * 22 + dirx * off, 16, era >= 6 ? 9 : 6, 10, d.a + Math.PI / 2, era >= 6 ? 0x8a6a4e : colorOf(900 + k), packStyle(era >= 6 ? WALL.brick : WALL.wood, era >= 6 ? ROOF.metal : ROOF.tile, cul, 0), 0, pp); }
      if (era >= 3 && lvl >= 3 && pr >= 1) push('lighthouse', d.x + dirx * 120 - dirz * 60, d.z + dirz * 120 + dirx * 60, 8, 26, 8, 0, 0xf2efe8, packStyle(WALL.stone, ROOF.copper, cul, FLAG.landmark));
      if (era >= 7 && !coarse && pr >= 1) for (let k = 0; k < 3; k++) push('crane', d.x + dirx * 60 - dirz * (k - 1) * 40, d.z + dirz * 60 + dirx * (k - 1) * 40, 6, 40, 6, d.a, 0xd9552f, packStyle(WALL.concrete, ROOF.flat, cul, 0));
      // the planner only knows which way the sea lies; the world layer finds the shore and moves these there (hb: harbour item)
      for (let k = hb0; k < items.length; k++) items[k].hb = 1;
      harbour = { a: d.a, x: d.x * kS, z: d.z * kS };
    }
    // --- walls: a ring with towers and gates; bastions in the Renaissance; going up segment by segment when under construction ---
    const walls = [];
    if (wallStyle !== 'none') {
      const segs = Math.max(14, Math.round(wallR * 2 * Math.PI / (wallStyle === 'bastion' ? 40 : 24)));
      const lvlDrawn = wallsL || 1;
      const hW = wallStyle === 'palisade' ? 3.5 + (lvlDrawn - 1) * 0.7 : wallStyle === 'mud' ? 5 + lvlDrawn * 1.2 : wallStyle === 'bastion' ? 7 : 7 + lvlDrawn * 2;
      const thick = wallStyle === 'palisade' ? 0.6 : wallStyle === 'mud' ? 2.2 : wallStyle === 'bastion' ? 9 : 2.6;
      const wCol = wallStyle === 'palisade' ? 0x6e5537 : wallStyle === 'mud' ? 0xc0a070 : wallStyle === 'bastion' ? 0x8f8778 : 0x9c9486;
      const wKind = wallStyle === 'palisade' ? 'palisade' : 'wall';
      const wm = wallStyle === 'palisade' ? WALL.wood : wallStyle === 'mud' ? WALL.adobe : WALL.stone;
      const newRing = !wallsL && wallWork >= 0;           // first walls: the ring closes around the town over the years
      const upgrading = wallsL && wallWork >= 0;          // higher walls: scaffolding here and there
      // the ring is cut so that every gate sits in the middle of its own stretch, exactly where its lane leaves the town;
      // the arcs between gates are divided evenly
      const TAU = Math.PI * 2; const dA = TAU / segs; const gs = gates.map((g) => ((g % TAU) + TAU) % TAU).sort((p, q) => p - q); const bounds = [];
      for (let q = 0; q < gs.length; q++) {
        const g = gs[q], gn = q + 1 < gs.length ? gs[q + 1] : gs[0] + TAU; const arc = gn - g - dA;
        bounds.push([g - dA / 2, g + dA / 2, true]);
        if (arc > dA * 0.2) { const nn = Math.max(1, Math.round(arc / dA)); for (let t = 0; t < nn; t++) bounds.push([g + dA / 2 + arc * t / nn, g + dA / 2 + arc * (t + 1) / nn, false]); }
      }
      const nSeg = bounds.length; const startSeg = Math.floor(rnd(45) * nSeg);
      for (let k = 0; k < nSeg; k++) {
        const a = bounds[k][0], a2 = bounds[k][1]; const am = (a + a2) / 2;
        let segProg = 1;
        if (newRing) { const order = ((k - startSeg + nSeg) % nSeg) / nSeg; segProg = clamp((wallWork - order) / 0.12, 0, 1); if (segProg <= 0) continue; }
        else if (upgrading && !coarse && hash(i, 500 + k) < 0.25) segProg = clamp(wallWork + 0.3, 0.3, 0.95);
        // gate: a gap with a gatehouse
        const isGate = bounds[k][2];
        const x1 = Math.cos(a) * wallR, z1 = Math.sin(a) * wallR, x2 = Math.cos(a2) * wallR, z2 = Math.sin(a2) * wallR;
        const len = Math.hypot(x2 - x1, z2 - z1) * 1.04; const yaw = Math.atan2(z2 - z1, x2 - x1);
        if (isGate) { const gt = push('gatehouse', (x1 + x2) / 2, (z1 + z2) / 2, len, hW * 1.7, thick + 5, yaw, wCol, packStyle(wm, ROOF.slate, cul, 0), 0, segProg); gt.th = hW; gt.as = 'gate_' + wallStyle; walls.push({ x: (x1 + x2) / 2, z: (z1 + z2) / 2, gate: true }); continue; }
        { const ws = push(wKind, (x1 + x2) / 2, (z1 + z2) / 2, len, hW, thick, yaw, wCol, packStyle(wm, ROOF.flat, cul, 0), 0, segProg); ws.th = hW; if (wallStyle !== 'palisade') ws.as = 'wall_' + wallStyle; }
        if (wallStyle === 'bastion') { if (k % 4 === 0) push('bastion', x1, z1, 26, hW * 1.1, 26, Math.atan2(z1, x1), wCol, packStyle(WALL.stone, ROOF.flat, cul, 0), 0, segProg); }
        else if (k % (wallStyle === 'palisade' ? 5 : 3) === 0) { const tw = push(wallStyle === 'palisade' ? 'keep' : 'roundtower', x1, z1, wallStyle === 'palisade' ? 4 : 6 + lvlDrawn, hW * (wallStyle === 'palisade' ? 1.5 : 1.6), wallStyle === 'palisade' ? 4 : 6 + lvlDrawn, wallStyle === 'palisade' ? 0 : Math.atan2(z1, x1) + Math.PI / 2, wCol, packStyle(wm, wallStyle === 'stone' ? ROOF.slate : ROOF.flat, cul, 0), 0, segProg); tw.th = hW; tw.as = wallStyle === 'palisade' ? 'watchtower' : 'tower_' + wallStyle; }
      }
    }
    // --- farmsteads in the fields (more with every level of farming), the odd windmill; the newest are still being raised. Each
    // stands on a spot of its own about the town, out in its fields: as the town grows it reaches the nearer ones, which go, and
    // the next ones out are farmed ---
    if (!coarse && era <= 7 && lvl >= 1) {
      const farmProg = workProg('farm'); const nDone = 2 + infra * 2 + (era >= 4 ? 1 : 0); const nF = nDone + (farmProg >= 0 ? 2 : 0);
      const edge = Math.max(Rplan, tp.city ? R : 0) * 1.15 + 50; let got = 0;
      for (let k = 0; k < 48 && got < nF; k++) {
        let a = rnd(950 + k) * Math.PI * 2; const rr = 140 + 1500 * Math.pow((k + rnd(960 + k)) / 48, 0.8);      // (its own spot: the same for the town's life)
        if (rr < edge) continue;
        for (const g of gates) { const da = Math.atan2(Math.sin(a - g), Math.cos(a - g)); if (Math.abs(da) * rr < 40) a = g + (da < 0 ? -40 : 40) / rr; }      // not on the road that leaves through a gate
        const fx = Math.cos(a) * rr, fz = Math.sin(a) * rr; const pp = got >= nDone ? clamp(farmProg * 1.3 - (got - nDone) * 0.3, 0.05, 1) : 1; got++;
        // the yard: the house, its barn across the yard from the long side, a granary past one gable end, a mill on the far side
        const fy = rnd(980 + k) * 3, ux = Math.cos(fy), uz = Math.sin(fy);
        if (era >= 4 && fine) { const st = tp.st; const sk = window.VERN.styleAt(st, era, tp.P - era, window.VERN.CULFAM[cul], rnd(985 + k)); const ty = window.VERN.types(sk, 'rural', st, window.VERN.nTypes(lvl)); const g = ty[Math.floor(rnd(986 + k) * ty.length) % ty.length]; const F = window.VERN.foot(g);
          const cols = window.VERN.colours(g, (Math.imul(i, 31) + k * 977) >>> 0); const it = push('vh', fx, fz, F.x1 - F.x0, window.VERN.heightOf(g), F.z1 - F.z0, fy, cols[0], packStyle(WALL.plaster, ROOF.tile, cul, 0), 0, pp); it.g = g; it.sc = 1; it.pal = cols; it.pk = 'farm' + k; it.era = era; it.u = 1; it.ofx = -(F.x0 + F.x1) * 0.5; it.ofz = -(F.z0 + F.z1) * 0.5; }
        else { const e = pickW(houses, rnd(970 + k)); push(e[0] === 'block' || e[0] === 'tower' || e[0] === 'skyscraper' || e[0] === 'tenement' ? 'gable' : e[0], fx, fz, 9, 6, 7, fy, colorOf(990 + k), packStyle(e[2], e[3], cul, 0), 0, pp).pk = 'farm' + k; }
        if (era >= 1) push('barn', fx - uz * 21, fz + ux * 21, 14, 6.5, 8, fy + (rnd(981 + k) < 0.5 ? 0 : Math.PI / 2), era >= 5 ? 0x8a3f33 : 0x7a6247, packStyle(WALL.wood, era >= 5 ? ROOF.metal : ROOF.thatch, cul, 0), 0, pp).pk = 'farmb' + k;
        if (era >= 4 && era <= 6 && rnd(995 + k) < 0.3) push('windmill', fx + uz * 24, fz - ux * 24, 7, 16, 7, rnd(996 + k) * 3, 0xd9d0bd, packStyle(WALL.stone, ROOF.thatch, cul, 0), 0, pp);
        if (era >= 1 && infra >= 3 && rnd(997 + k) < 0.5) push('granary', fx + ux * 19, fz + uz * 19, 6, 6, 6, 0, 0xc9b48c, packStyle(WALL.adobe, ROOF.thatch, cul, 0), 0, pp);
        if (era >= 1 && era <= 6 && fine) { const q = push('haystack', fx - ux * 14 + uz * 6, fz - uz * 14 - ux * 6, 4, 4.2, 4, fy, 0xc7a85e, packStyle(WALL.plaster, ROOF.thatch, cul, 0)); q.u = 1; q.prop = 1; }
      }
    }
    if (!coarse && era >= 8 && lvl >= 2) for (let k = 0; k < 6; k++) { const a = rnd(1050 + k) * Math.PI * 2; const rr = R * (1.5 + rnd(1060 + k) * 0.9) + 80; push('turbine', Math.cos(a) * rr, Math.sin(a) * rr, 3, 90, 3, rnd(1070 + k) * 3, 0xf0f2f4, packStyle(WALL.concrete, ROOF.flat, cul, 0)); }
    // --- streets, for the ground decal: [x0, z0, x1, z1, halfWidth] in metres ---
    const streets = []; const cls = era <= 2 ? 0.56 : era <= 6 ? 0.68 : 0.88;   // trodden earth, cobbles, asphalt (the terrain shader reads the class)
    if (fine) {
      // the town's own: those its plots stand on, as far as they are built (a path of the first ages narrower than a street)
      const kW = era <= 1 ? 0.55 : era <= 3 ? 0.8 : era >= 7 ? 1.4 : 1;
      const sgs = window.PLOTS.streetsFor(Pp, nPlots); let nL = 0, acc = 0;
      for (const sg of sgs) { const hw = Math.max(1, sg[4] * kW); streets.push([sg[0], sg[1], sg[2], sg[3], hw]);
        // street lamps along the main streets and the lanes round the middle, from the machine age (gas, then electric)
        if (era >= 6 && lvl >= 2 && sg[5] <= 1 && nL < 160) { const dx = sg[2] - sg[0], dz = sg[3] - sg[1], L = Math.hypot(dx, dz); if (L < 1) continue; acc += L;
          while (acc > 32 && nL < 160) { acc -= 32; const t = 1 - acc / L; if (t < 0 || t > 1) continue; const side = nL % 2 ? 1 : -1; const nx = -dz / L * side, nz = dx / L * side;
            const q = push('lamp', sg[0] + dx * t + nx * (hw + 0.7), sg[1] + dz * t + nz * (hw + 0.7), 0.4, era >= 7 ? 8 : 5, 0.4, 0, 0x3b3f44, packStyle(WALL.concrete, ROOF.flat, cul, FLAG.neon)); q.u = 1; nL++; } } }
    } else if (!coarse && era >= 6 && lvl >= 2) { const nL = Math.min(40, Math.round(R / 22)); for (let k = 0; k < nL; k++) { const t = (k + 1) / nL * R * 0.95; const side = k % 2 ? 1 : -1; push('lamp', t * ca * side + (-sa) * s * 0.42, t * sa * side + ca * s * 0.42, 0.4, 7, 0.4, 0, 0x3b3f44, packStyle(WALL.concrete, ROOF.flat, cul, FLAG.neon)); } }      // (a far town's: along its main axis)
    if (gridOn && planned) {
      const step = (blockN + 1) * s; const hw = Math.max(1.5, street * (era >= 6 ? 0.5 : 0.32)); const ext = R * (era >= 6 ? 1.02 : 1.15);      // (no grid of empty streets beyond a city's last blocks)
      const cut = fine ? Rplan * 1.02 : 0;      // (not through the old town on the plan: its own streets are there)
      const seg = (x0, z0, x1, z1) => { if (!cut) { streets.push([x0, z0, x1, z1, hw]); return; } const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1; const t0 = -(x0 * dx + z0 * dz) / L; const px = x0 + dx / L * t0, pz = z0 + dz / L * t0; const p2 = px * px + pz * pz;
        if (p2 >= cut * cut) { streets.push([x0, z0, x1, z1, hw]); return; } const hc = Math.sqrt(cut * cut - p2); const ta = t0 - hc, tb = t0 + hc;
        if (ta > 0) streets.push([x0, z0, x0 + dx / L * ta, z0 + dz / L * ta, hw]); if (tb < L) streets.push([x0 + dx / L * tb, z0 + dz / L * tb, x1, z1, hw]); };
      for (let u = -Math.ceil(ext / step) * step; u <= ext; u += step) { const half = Math.sqrt(Math.max(0, ext * ext - u * u)); if (half < s) continue;
        seg(u * ca - (-half) * sa, u * sa + (-half) * ca, u * ca - half * sa, u * sa + half * ca);      // along v
        seg((-half) * ca - u * sa, (-half) * sa + u * ca, half * ca - u * sa, half * sa + u * ca); }     // along u
    } else if (!fine) {
      const hw = Math.max(1.0, Math.min(s * 0.26, [1.3, 1.6, 2, 3, 2.6, 3.5, 5, 7, 8, 8][era]));   // footpaths between huts, lanes in a town, streets in a city
      for (const a of lanes) { const r1 = R * 1.12; streets.push([Math.cos(a) * plaza * 0.85, Math.sin(a) * plaza * 0.85, Math.cos(a) * r1, Math.sin(a) * r1, hw]); }
      if (era >= 1) for (let rr = plaza + ringStep; rr < R * 0.98; rr += ringStep) { const n = Math.max(16, Math.round(rr / 12)); for (let k = 0; k < n; k++) { const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2; streets.push([Math.cos(a0) * rr, Math.sin(a0) * rr, Math.cos(a1) * rr, Math.sin(a1) * rr, hw * 0.9]); } }
    }
    // the plots a player can build on (drawn radius), with what already stands there
    const plots = []; for (let sl = 0; sl < SLOT_N; sl++) { const a = slotAngle(i, axis, sl); plots.push({ slot: sl, x: Math.cos(a) * distR * kS, z: Math.sin(a) * distR * kS, used: used.has(sl) }); }
    // --- to drawn scale ---
    for (const it of items) { it.x *= kS; it.z *= kS; it.w *= kS; it.d *= kS; it.h *= it.u ? kS : kH; if (it.ofx !== undefined) { it.ofx *= kS; it.ofz *= kS; } }      // (a house of the place's own, and what stands in its yard, at the same scale every way: as the models are)
    for (const st of streets) { st[0] *= kS; st[1] *= kS; st[2] *= kS; st[3] *= kS; st[4] *= kS; }
    for (const wv of walls) { wv.x *= kS; wv.z *= kS; }
    for (const pk of parks) { pk[0] *= kS; pk[1] *= kS; pk[2] *= kS; }
    const out = { key, R: R * kS, Rt: R, k: kS, kh: kH, plaza: plaza * kS, axis, lmAngle, gates, items, walls, wallR: wallStyle !== 'none' ? wallR * kS : 0, culture: cul, era, eraReal, coast, harbour, streets, streetCls: cls, plots, sites: nSites, growing: !!growing, parks, suburb: era >= 7 ? subR : 0, morph: tp.morph, fine, n: nPlots, houses: nHouses, P: tp.P, rec: tp.rec };
    cache.set(ck, out);
    if (cache.size > 400) { const first = cache.keys().next().value; cache.delete(first); }
    return out;
  }

  // settlement site: the sim's sub-cell point, nudged off river channels and, for coastal cells, inland so the town fits on land
  const siteCache = new Map(); let riversRef = null;
  function siteOf(sim, i, c, terrain, decal) {
    if (decal) riversRef = decal; else decal = riversRef;        // every caller gets the same site, whether or not it has the rivers at hand
    const y = (i / W) | 0, x = i - y * W;
    const su = sim.siteU[i] >= 0 ? sim.siteU[i] : 0.5, sv = sim.siteU[i] >= 0 ? sim.siteV[i] : 0.5;
    let lon = (x + su) / W * 360 - 180, lat = 90 - (y + sv) / H * 180;
    const R = c ? radiusM(sim, i, c) : 100; const key = `${su.toFixed(3)}|${sv.toFixed(3)}|${Math.round(R / 50)}|${terrain && terrain.stats ? terrain.stats.packsE + '/' + terrain.stats.packsI + '/' + (terrain.stats.packsW || 0) : 0}|${decal && decal.segIndex ? 1 : 0}`;
    const hit = siteCache.get(i); if (hit && hit.key === key) return hit.pt;
    const cl = Math.max(0.15, Math.cos(lat * D2R)); const mLon = 1 / (6371000 * cl * D2R), mLat = 1 / (6371000 * D2R);
    const rv = decal ? decal.nearestRiver(lon, lat) : null;
    // A village stands beside its river, not astride it. Towns are drawn far larger than life while rivers keep their
    // true width, so the centre keeps a village's drawn radius clear of the channel; a town that outgrows that reaches
    // the bank and then grows across. (A fixed distance: the centre must not wander as the town grows.)
    if (decal) { const clear = 4500;
      for (let pass = 0; pass < 4; pass++) { const rv = decal.nearestRiver(lon, lat); if (!rv || rv.d >= rv.hw + clear) break; const push = rv.hw + clear * 1.02 - rv.d; lon += rv.px * push * mLon; lat += rv.py * push * mLat; } }
    if (terrain && (sim.flags[i] & 4)) {
      // coastal cell: slide the town onto the land nearby (centroid of the dry samples in a grid around it)
      const lon0 = lon, lat0 = lat;
      for (let pass = 0; pass < 4; pass++) {
        let sx = 0, sz = 0, nLand = 0, nAll = 0; const G = 4; const span = R * 1.4;
        for (let gy = -G; gy <= G; gy++) for (let gx = -G; gx <= G; gx++) { const px = gx / G * span, pz = gy / G * span; nAll++; if (!terrain.isWater(lon + px * mLon, lat + pz * mLat)) { sx += px; sz += pz; nLand++; } }
        if (nLand === nAll) break;
        if (nLand < nAll * 0.12) { lon = lon0; lat = lat0; break; }      // a speck of land: leave it where the sim put it
        const cx = sx / nLand, cz = sz / nLand; if (Math.hypot(cx, cz) < R * 0.05) break;
        lon += cx * 0.8 * mLon; lat += cz * 0.8 * mLat;
      }
    }
    const pt = [lon, lat]; siteCache.set(i, { key, pt }); if (siteCache.size > 2000) siteCache.delete(siteCache.keys().next().value);
    return pt;
  }
  // what is left of a dead town: tumbled walls, heaps of stone, a colonnade, and the wonder if it had one, half its height
  const ruinCache = new Map();
  function ruinLayout(i, ru, sim) {
    const key = `${ru.R | 0}|${ru.era}|${ru.culture}|${ru.wonder}|${Math.min(9, Math.floor((sim.year - ru.year) / 200))}`;
    const hit = ruinCache.get(i); if (hit && hit.key === key) return hit;
    const items = []; const rnd = (k) => hash(i, k + 5000); const cul = ru.culture || 0; const cname = CULTURES[cul]; const age = sim.year - ru.year;
    const R = clamp(ru.R * 0.8, 80, 1200); const decay = Math.min(1, age / 1500);          // older ruins have less standing
    const kS = scaleOf(R), kH = hScale(kS);                                                   // drawn at the same representational scale as the living towns
    const push = (kind, x, z, w, h, d, yaw, color, wall, roof, flags) => items.push({ kind, x, z, w, h, d, yaw, color, style: packStyle(wall, roof, cul, (flags || 0) | FLAG.ruin) });
    const stoneCol = cul === 3 || cul === 4 || cul === 5 ? 0xb8a07a : cul === 8 ? 0x9a9184 : 0x8f8a80;
    const n = Math.round(clamp(R * R / 180, 30, 900) * (1 - decay * 0.55));
    for (let k = 0; k < n; k++) { const a = rnd(k) * Math.PI * 2, rr = Math.sqrt(rnd(k + 300)) * R; const x = Math.cos(a) * rr, z = Math.sin(a) * rr; const kind = rnd(k + 600) < 0.5 ? 'rubble' : 'wallstub'; const sz = 7 + rnd(k + 900) * 8; push(kind, x, z, sz, kind === 'rubble' ? 2.5 + rnd(k + 1200) * 2.5 : (3 + rnd(k + 1200) * 4) * (1 - decay * 0.5), sz * (kind === 'rubble' ? 1 : 0.45), rnd(k + 1500) * 3, stoneCol, WALL.stone, ROOF.flat); }
    // the line of the old wall, broken
    if (ru.era <= 5 && rnd(11) < 0.7) { const segs = Math.round(R * 2 * Math.PI / 24); for (let k = 0; k < segs; k++) { if (rnd(k + 2000) < 0.35 + decay * 0.4) continue; const a = k / segs * Math.PI * 2, a2 = (k + 1) / segs * Math.PI * 2; const x1 = Math.cos(a) * R * 1.06, z1 = Math.sin(a) * R * 1.06, x2 = Math.cos(a2) * R * 1.06, z2 = Math.sin(a2) * R * 1.06; push('wallstub', (x1 + x2) / 2, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1) * 1.04, (3 + rnd(k + 2100) * 4) * (1 - decay * 0.6), 3, Math.atan2(z2 - z1, x2 - x1), stoneCol, WALL.stone, ROOF.flat); } }
    if (styleEra(ru.era, cul) >= 3 && rnd(7) < 0.6) push('pillars', Math.cos(rnd(8) * 6) * R * 0.3, Math.sin(rnd(8) * 6) * R * 0.3, 26, 9 * (1 - decay * 0.5), 8, rnd(9) * 3, 0xd9d0c0, WALL.stone, ROOF.flat, FLAG.landmark);
    if (ru.wonder) { const kind = WONDER[cname][styleEra(Math.min(9, ru.wonder - 1), cul)]; const S = { menhirs: [40, 4, 40], ziggurat: [80, 36, 80], pyramid: [200, 130, 200], steppyramid: [80, 48, 80], temple: [60, 28, 100], colosseum: [280, 80, 230], cathedral: [84, 110, 180], church: [16, 22, 34], basilica: [110, 100, 170], mosque: [95, 76, 95], tajmosque: [110, 100, 110], mudmosque: [68, 34, 68], onion: [45, 64, 76], hall: [90, 34, 50], pagoda: [42, 80, 42], stupa: [76, 50, 76], shikhara: [50, 80, 64], stepped: [114, 64, 114], mound: [150, 26, 150], pueblo: [76, 23, 57], palace: [200, 42, 76], irontower: [78, 390, 78], crystal: [228, 57, 114], stadium: [360, 76, 285], spire: [91, 780, 91], lighthouse: [30, 104, 30] }[kind] || [60, 30, 60]; const keep = kind === 'pyramid' || kind === 'steppyramid' || kind === 'ziggurat' || kind === 'stepped' || kind === 'mound' ? 0.92 : 0.45 + 0.3 * (1 - decay); push(kind, 0, 0, S[0], S[1] * keep, S[2], rnd(10) * 3, stoneCol, WALL.stone, ROOF.flat, FLAG.landmark | FLAG.wonder); }
    for (const it of items) { it.x *= kS; it.z *= kS; it.w *= kS; it.d *= kS; it.h *= kH; }
    const out = { key, items, R: R * kS, k: kS }; ruinCache.set(i, out); if (ruinCache.size > 300) ruinCache.delete(ruinCache.keys().next().value); return out;
  }
  window.TOWN = { siteOf, gateToward, ruinLayout, styleEra, CULTURES, WALL, ROOF, FLAG, cultureOf, civCulture, radiusM, radiusTrue, scaleOf, fieldsM, layout, packStyle, SLOT_N, townPlan, approxR, budget, PPP, NFINE, cacheSize: () => cache.size, clearCache: () => { cache.clear(); tpCache.clear(); exitCache.clear(); } };
})();
