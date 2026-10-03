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
  const hex = (s) => parseInt(s.slice(1), 16);

  // ---------- materials (decoded by the building shader) ----------
  const WALL = { adobe: 0, plaster: 1, timber: 2, stone: 3, brick: 4, concrete: 5, glass: 6, wood: 7 };
  const ROOF = { thatch: 0, tile: 1, slate: 2, flat: 3, metal: 4, glazed: 5, shingle: 6, copper: 7 };
  const FLAG = { landmark: 1, block: 2, neon: 4, wonder: 8, ruin: 16, site: 32 };
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
    med: [['#b9a583', '#a89470', '#c4b08c'], ['#dcc9a5', '#e6d6b4', '#cdb88f'], ['#efe6d2', '#f2ebdc', '#e3cfa6', '#e8dcc4'], ['#b8ab92', '#c9bda4', '#a89b82', '#e7dcc4'], ['#efe1c6', '#e9d3b0', '#f3e9d6', '#d9b98c', '#e6c9a8'], ['#d9c9ad', '#c8a882', '#b98a6a', '#e4d6bd'], ['#d6d2c8', '#c7c2b8', '#e2ddd3', '#b9b4aa'], ['#cfd6dc', '#dfe4e8', '#b7c3cc', '#e6e9ec']],
    north: [['#7a6547', '#6e5a3f', '#86704f'], ['#8a7452', '#9b8462', '#7d6a4a'], ['#d9cdb4', '#c9bc9f', '#e3d8c1'], ['#e9e2d0', '#e2d8c2', '#d7ccb2', '#cbbf9f'], ['#a0563f', '#b46a4d', '#e9e2d0', '#8f4a3a', '#d8cbb0'], ['#8f4a3a', '#7d4033', '#a35a45', '#6f6a66'], ['#b8bcc2', '#c9ccd0', '#a29d95', '#d2c8b6'], ['#c5ccd3', '#dde2e6', '#a9b6c1', '#eef0f2']],
    east: [['#6e5537', '#7d6142', '#5f4a30'], ['#7d6142', '#8b6d4b', '#6a5238'], ['#8b6d4b', '#9a7b55', '#7a5f42'], ['#8b6d4b', '#a08252', '#e4d3b8', '#7a5f42'], ['#e4d3b8', '#efe1c8', '#d8c29c', '#c98d6a'], ['#b06e4e', '#c48159', '#a29a8c', '#e4d3b8'], ['#a9adb2', '#bfc3c7', '#d3cdc0', '#8f9398'], ['#c2c9d0', '#d9dee2', '#aab5bf', '#eef0f2']],
    mena: [['#b8956a', '#a8865c', '#c4a274'], ['#c9a878', '#d7b98a', '#b5905e', '#cbb28a'], ['#d7b98a', '#e2cba2', '#c9a878', '#efe8d8'], ['#efe8d8', '#e8dcc4', '#d9c39a', '#f2ede2'], ['#efe8d8', '#e6d4b0', '#f4efe4', '#d2b98f'], ['#d8c9ad', '#c9b493', '#e6dccb', '#b79a72'], ['#d8d2c4', '#e4dfd3', '#c6bfaf', '#efece4'], ['#dfe3e6', '#eef0f2', '#c8d2da', '#f3f4f5']],
    africa: [['#a6764a', '#b8845a', '#96683f'], ['#a6764a', '#b8845a', '#c39466', '#8f6440'], ['#b8845a', '#c39466', '#a6764a'], ['#b8845a', '#c9a26e', '#a6764a', '#d6b986'], ['#c9a26e', '#d6b986', '#b8845a', '#e3cfa4'], ['#cfc0a3', '#c3aa80', '#d9cbb0', '#b0885e'], ['#cfc7b8', '#dcd5c8', '#bfb5a4', '#e9e3d8'], ['#d6dbe0', '#e8ecef', '#c1cad2', '#f0f2f4']],
    sasia: [['#a67c56', '#b48a62', '#97704c'], ['#a8664a', '#b77356', '#9a5b41', '#c78a68'], ['#e9dcc0', '#dcc8a2', '#a8664a', '#f0ece2'], ['#e9dcc0', '#d9c39a', '#c9a26e', '#f0ece2'], ['#f0ece2', '#e9dcc0', '#f4e4c6', '#d8b98a'], ['#d8c9ad', '#e9dcc0', '#c99a76', '#efe6d4'], ['#dcd8cc', '#e8e4da', '#c9c3b6', '#f1eee8'], ['#d9dfe4', '#e9edf0', '#c3ccd4', '#f2f4f6']],
    easia: [['#7a6446', '#8b7350', '#6c583d'], ['#b89a76', '#c4a884', '#a88a68', '#d9cbb0'], ['#d9cbb0', '#e2d6bf', '#b89a76', '#e6e2da'], ['#e6e2da', '#d9cbb0', '#b89a76', '#c9bda4'], ['#e6e2da', '#efeae0', '#d9cbb0', '#a8a094'], ['#c9c2b4', '#d7d1c4', '#b3ab9c', '#e6e2da'], ['#c9ccd0', '#d9dbde', '#b0b4b9', '#e6e8ea'], ['#c8d0d8', '#dfe5ea', '#aab7c3', '#eef1f3']],
    seasia: [['#8a6a44', '#9b784e', '#79593a'], ['#8a6a44', '#9b784e', '#a88a62'], ['#9b784e', '#a88a62', '#8a6a44', '#c9a878'], ['#a88a62', '#c9a878', '#9b784e', '#b5905e'], ['#c9a878', '#d9c39a', '#a88a62', '#efe6d4'], ['#d9c39a', '#c9b493', '#e6dccb', '#a88a62'], ['#d8d2c4', '#e4dfd3', '#c6bfaf', '#efece4'], ['#d9e0e5', '#eaeef1', '#c3ced6', '#f2f4f6']],
    america: [['#a67c56', '#b48a62', '#97704c'], ['#c48f5f', '#d19d6d', '#b58153', '#dcb283'], ['#c48f5f', '#9a9184', '#d19d6d', '#efe4cc'], ['#9a9184', '#a89f90', '#c48f5f', '#8c8376'], ['#efe4cc', '#f1d9a6', '#e6c9a0', '#dcb283'], ['#f1d9a6', '#e7c48f', '#efe4cc', '#c98d6a'], ['#d9d2c4', '#e6dfd2', '#c8c0b1', '#efeae0'], ['#d6dde3', '#e8edf0', '#bfcad3', '#f1f3f5']],
    namerica: [['#8a6b4c', '#9a7a58', '#7a5d40'], ['#8a6b4c', '#9a7a58', '#a88a62'], ['#9a7a58', '#a88a62', '#c9b48c', '#8a6b4c'], ['#c48f5f', '#d19d6d', '#b58153', '#9a7a58'], ['#dfd8c8', '#c9c2b2', '#e9e3d5', '#b9b0a0'], ['#dfd8c8', '#c9c2b2', '#a9b7c4', '#8f4a3a'], ['#dfd8c8', '#c9c2b2', '#a9b7c4', '#e9e3d5'], ['#d3dbe2', '#e6ebef', '#b9c6d0', '#f0f3f5']],
  };
  const bandOf = (era) => era === 0 ? 0 : era <= 2 ? 1 : era === 3 ? 2 : era === 4 ? 3 : era === 5 ? 4 : era === 6 ? 5 : era === 7 ? 6 : 7;

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
    ],
  };
  // the building every town gathers around, by culture and era band; wonders are the outsized version a capital earns
  const LANDMARK = {
    med: ['menhirs', 'ziggurat', 'temple', 'cathedral', 'basilica', 'station', 'stadium', 'spire'],
    north: ['menhirs', 'menhirs', 'temple', 'cathedral', 'palace', 'station', 'stadium', 'spire'],
    east: ['menhirs', 'hall', 'hall', 'onion', 'onion', 'station', 'stadium', 'spire'],
    mena: ['menhirs', 'ziggurat', 'ziggurat', 'mosque', 'mosque', 'station', 'stadium', 'spire'],
    africa: ['menhirs', 'granary', 'stepped', 'mudmosque', 'mudmosque', 'station', 'stadium', 'spire'],
    sasia: ['menhirs', 'stupa', 'stupa', 'shikhara', 'mosque', 'station', 'stadium', 'spire'],
    easia: ['menhirs', 'hall', 'pagoda', 'pagoda', 'hall', 'station', 'stadium', 'spire'],
    seasia: ['menhirs', 'hall', 'stepped', 'stepped', 'stupa', 'station', 'stadium', 'spire'],
    america: ['menhirs', 'steppyramid', 'steppyramid', 'steppyramid', 'basilica', 'station', 'stadium', 'spire'],
    namerica: ['menhirs', 'mound', 'mound', 'pueblo', 'church', 'station', 'stadium', 'spire'],
  };
  const WONDER = {
    med: ['menhirs', 'pyramid', 'lighthouse', 'colosseum', 'cathedral', 'basilica', 'irontower', 'stadium', 'spire'],
    north: ['menhirs', 'menhirs', 'menhirs', 'colosseum', 'cathedral', 'palace', 'crystal', 'stadium', 'spire'],
    east: ['menhirs', 'menhirs', 'hall', 'hall', 'onion', 'palace', 'irontower', 'stadium', 'spire'],
    mena: ['menhirs', 'pyramid', 'ziggurat', 'lighthouse', 'mosque', 'mosque', 'crystal', 'stadium', 'spire'],
    africa: ['menhirs', 'pyramid', 'stepped', 'stepped', 'mudmosque', 'mudmosque', 'crystal', 'stadium', 'spire'],
    sasia: ['menhirs', 'stupa', 'stupa', 'stupa', 'shikhara', 'tajmosque', 'crystal', 'stadium', 'spire'],
    easia: ['menhirs', 'hall', 'hall', 'pagoda', 'pagoda', 'hall', 'irontower', 'stadium', 'spire'],
    seasia: ['menhirs', 'hall', 'stepped', 'stepped', 'stepped', 'stupa', 'crystal', 'stadium', 'spire'],
    america: ['menhirs', 'steppyramid', 'steppyramid', 'steppyramid', 'steppyramid', 'basilica', 'irontower', 'stadium', 'spire'],
    namerica: ['menhirs', 'mound', 'mound', 'mound', 'pueblo', 'church', 'irontower', 'stadium', 'spire'],
  };
  // walls by era: what a fortified town surrounds itself with
  const WALLSTYLE = ['palisade', 'mud', 'mud', 'stone', 'stone', 'bastion', 'none', 'none', 'none'];

  // ---------- size ----------
  // Towns are planned at true scale (metres), then drawn at a representational scale, the way a strategy map does it:
  // a village is drawn ~19x life size so it reads from region height, a metropolis ~3x so it still fits its region.
  const APC = [250, 150, 130, 110, 90, 100, 120, 200, 200];          // built-up m² per person
  const PPB = [6, 7, 8, 10, 12, 14, 24, 60, 90];                       // people per building
  const BUILD_T = [14, 12, 11, 10, 9, 8, 6, 4, 3];                     // years a new ring of houses takes to go up, by era
  const ERA_T = 50;                                                     // years over which a town rebuilds itself in a new age
  const SCALE0 = 20, SCALE_R0 = 1200;
  const scaleOf = (Rt) => SCALE0 / (1 + Rt / SCALE_R0);
  const hScale = (k) => Math.pow(k, 0.85);
  const peopleOf = (sim, i) => Math.max(30, sim.pop[i] * 1000);
  // How closely a people builds, by culture (med, north, east, mena, africa, sasia, easia, seasia, america, namerica): the
  // mud-brick towns of the river valleys and the Mediterranean stand wall to wall; northern and woodland villages spread out.
  const COMPACT = [0.45, 1, 1, 0.35, 0.7, 0.4, 0.5, 0.85, 0.7, 1];
  const trueR = (people, era, cul) => clamp(Math.sqrt(people * APC[era] * (cul === undefined ? 1 : era === 0 ? Math.sqrt(COMPACT[cul]) : COMPACT[cul]) / Math.PI), 60, 9000);
  function radiusTrue(sim, i, c) { return trueR(peopleOf(sim, i), c ? c.era : 0, c ? civCulture(sim, c) : undefined); }
  function radiusM(sim, i, c) { const Rt = radiusTrue(sim, i, c); return Rt * scaleOf(Rt); }   // the radius as drawn, metres
  function fieldsM(sim, i, c) { const R = radiusM(sim, i, c); return R * (1.3 + 0.12 * sim.infra[i]) + 1200; }
  const bandPeople = (b) => Math.pow(2, b / 3) - 1;                     // inverse of the sim's size band
  const SLOT_N = 12;
  const slotAngle = (i, axis, sl) => axis + Math.PI / 4 + sl * (Math.PI * 2 / SLOT_N) + (hash(i, 90 + sl) - 0.5) * 0.22;

  // ---------- gates ----------
  // The angles (radians, east toward north) at which lanes leave a town and its gates stand. A gridded town opens on
  // its two main streets; an organic one wherever its lanes happened to run.
  const isPlanned = (era, cul) => era === 3 || era >= 6 || (era >= 4 && cul === 6);   // Roman, Chinese and modern cities are gridded
  function gateAngles(i, lvl, planned) {
    const axis = hash(i, 3) * Math.PI; const n = lvl >= 3 ? 4 : lvl >= 2 ? 3 : 2; const out = [];
    if (planned) { const q = [0, Math.PI, Math.PI / 2, Math.PI * 1.5]; for (let g = 0; g < n; g++) out.push(axis + q[g]); }
    else for (let g = 0; g < n; g++) out.push(axis + g * Math.PI * 2 / n + (hash(i, 40 + g) - 0.5) * 0.5);
    return out;
  }
  // where a road heading toward `bearing` leaves town i: [the gate's angle, how far out its lane runs (drawn metres)]
  function gateToward(sim, i, c, bearing) {
    const gs = gateAngles(i, sim.level[i], isPlanned(c.era, civCulture(sim, c))); let best = gs[0], bd = 9;
    for (const a of gs) { const da = Math.abs(((a - bearing) + Math.PI * 3) % (Math.PI * 2) - Math.PI); if (da < bd) { bd = da; best = a; } }
    return [best, radiusM(sim, i, c) * 1.12];
  }

  // ---------- layout ----------
  const cache = new Map();
  function worksOf(sim, i) { return sim.works ? sim.works.get(i) || null : null; }
  function keyOf(sim, i, c, coarse) {
    const p = sim.pop[i]; const band = Math.round(Math.log2(p * 1000 + 1) * 3); const year = sim.year;
    const q = sim.rubble && sim.rubble.has(i) ? Math.min(3, Math.floor((year - sim.rubble.get(i)) / 10)) : -1;
    const wl = worksOf(sim, i); const wsig = wl ? wl.map(w => w.k + w.slot + ':' + Math.min(8, Math.floor((year - w.start) / w.dur * 8))).join(',') : '';
    const gY = sim.gYear ? sim.gYear[i] : -1e9; const age = year - gY; const T = BUILD_T[c.era]; const gsig = !coarse && age < T * 1.3 && sim.gPrev[i] < sim.gBand[i] ? `${sim.gPrev[i]}:${Math.floor(age / 1.5)}` : '';
    const eraAge = year - (c.eraSince === undefined ? year - 500 : c.eraSince); const esig = !coarse && eraAge < ERA_T ? Math.floor(eraAge / 2) : -1;
    return `${sim.level[i]}|${c.era}|${sim.walls[i]}|${sim.special[i]}|${civCulture(sim, c)}|${c.capital === i ? 1 : 0}|${band}|${sim.infra[i]}|${coarse ? 'c' : 'f'}|${q}|${wsig}|${sim.slotA ? sim.slotA[i] : 0}|${sim.slotB ? sim.slotB[i] : 0}|${gsig}|${esig}`;
  }
  function pickW(list, r) { let s = 0; for (const e of list) s += e[1]; let t = r * s; for (const e of list) { t -= e[1]; if (t <= 0) return e; } return list[list.length - 1]; }

  // one building: kind, x (east m), z (north m), w, h, d (m), yaw (rad from east toward north), colour hex, style, flags, prog (0..1 while under construction)
  function layout(sim, i, c, opts) {
    const coarse = !!(opts && opts.coarse);
    const key = keyOf(sim, i, c, coarse); const ck = coarse ? -1 - i : i; const hit = cache.get(ck);
    if (hit && hit.key === key) return hit;
    const year = sim.year;
    const era = c.era, lvl = sim.level[i], cul = civCulture(sim, c), cname = CULTURES[cul], band = bandOf(era);
    const quake = sim.rubble && sim.rubble.has(i) ? Math.min(3, Math.floor((year - sim.rubble.get(i)) / 10)) : -1;
    const people = peopleOf(sim, i); const R = trueR(people, era, cul); const kS = scaleOf(R), kH = hScale(kS);
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
    // --- growth: the newest ring of the town is still going up ---
    const T = BUILD_T[era]; const gY = sim.gYear ? sim.gYear[i] : -1e9; const age = year - gY;
    const growing = !coarse && age < T * 1.3 && sim.gPrev && sim.gPrev[i] < sim.gBand[i];
    const Rprev = growing ? trueR(Math.max(30, bandPeople(sim.gBand[i])), era, cul) : 0;   // the radius when this growth spurt began
    // --- a new age: houses are rebuilt one by one over the decades after ---
    const eraAge = year - (c.eraSince === undefined ? year - 500 : c.eraSince); const oldBand = bandOf(Math.max(0, era - 1));
    const waves = !coarse && era > 0 && eraAge < ERA_T && oldBand !== band;
    const housesOld = HOUSES[cname][oldBand], palOld = PAL[cname][oldBand];
    // --- plan geometry (true metres) ---
    const axis = rnd(3) * Math.PI;                                  // street grid orientation
    const ca = Math.cos(axis), sa = Math.sin(axis);
    const planned = isPlanned(era, cul);
    const plaza = Math.max(14, Math.min(90, R * (planned ? 0.13 : 0.1)));
    const nTarget = Math.min(coarse ? 3000 : 9000, Math.round(people / PPB[era] * (0.85 + rnd(4) * 0.3)));
    let s = Math.sqrt(Math.PI * R * R * 0.62 / Math.max(8, nTarget));    // slot spacing (m)
    s = clamp(s, [7, 8, 8, 9, 8, 9, 11, 14, 16][era], 90);
    const blockN = planned ? 3 : 0;                                   // slots per block side before a street
    const street = planned ? s * (era >= 6 ? 0.9 : 0.6) : 0;
    const wallWork = workProg('walls'); const wallLvl = wallsL || (wallWork >= 0 ? 1 : 0);
    const wallStyle = wallLvl ? WALLSTYLE[era] : 'none';
    const wallR = R * 1.06 + 6;
    const gates = gateAngles(i, lvl, planned);                        // angles of the gates (roads leave here)
    // organic street net: radial lanes (through the gates, plus more as the town grows) and ring lanes
    const lanes = gates.slice(); const nLanes = clamp(Math.round(R / 60), 4, 18); for (let k = 0; k < nLanes; k++) lanes.push(axis + (k + 0.5) / nLanes * Math.PI * 2 + (rnd(50 + k) - 0.5) * 0.3);
    const ringStep = clamp(R / 4, 80, 220);
    // districts (Civ-style quarters) on the ring of plots the player places them on; works in progress rise there too
    const dist = {};
    const distR = R * 0.55;
    const used = new Set();
    const placed = (kind, bit, r) => {
      const have = sp & bit; const sl = have ? (sim.slotOf ? sim.slotOf(i, kind) : -1) : workSlot(kind); const prog = have ? 1 : workProg(kind);
      if (!have && prog < 0) return null; if (sl >= 0) used.add(sl);
      const a = sl >= 0 ? slotAngle(i, axis, sl) : axis + Math.PI / 4 + (kind === 'temple' ? 0 : kind === 'academy' ? 2.4 : kind === 'market' ? 4.8 : 1.2) + rnd(60 + bit) * 0.4;
      return { a, r, prog };
    };
    const dT = placed('temple', 4, distR); if (dT) dist.temple = dT;
    const dA = placed('academy', 2, distR); if (dA) dist.academy = dA;
    const dM = placed('market', 8, distR * 0.75); if (dM) dist.market = dM;
    const dN = placed('mine', 512, R * 0.92); if (dN) dist.mine = dN;
    if (era >= 6 && lvl >= 2) dist.industry = { a: axis + Math.PI / 4 + 3.6 + rnd(63) * 0.4, r: R * 0.85, prog: 1 };
    if (isCap && era >= 1) dist.palace = { a: axis + Math.PI * 0.5 + (rnd(66) - 0.5) * 0.4, r: plaza * 1.15, prog: 1 };
    if (wallLvl && era >= 3 && era <= 5) dist.keep = { a: axis + Math.PI * 1.5, r: R * 0.72, prog: 1 };
    // coast direction for the harbour: nearest sea cell
    let coast = null; const portProg = (sp & 1) ? 1 : workProg('port');
    if (portProg >= 0) { const y = (i / W) | 0, x = i - y * W; let best = null, bd = 9; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const yy = y + dy, xx = ((x + dx) % W + W) % W; if (yy >= 0 && yy < H && !sim.land[yy * W + xx]) { const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = Math.atan2(-dy, dx); } } } if (best !== null) coast = best; else coast = axis; dist.harbour = { a: coast, r: R * 1.02, prog: portProg }; }
    const near = (x, z, dd) => Math.hypot(x - dd.x, z - dd.z);
    for (const k in dist) { const d = dist[k]; d.x = Math.cos(d.a) * d.r; d.z = Math.sin(d.a) * d.r; d.rad = k === 'industry' ? Math.min(R * 0.3, 160) : k === 'palace' ? Math.min(plaza * 1.2, 60) : k === 'harbour' ? Math.min(R * 0.35, 120) : k === 'market' ? Math.max(plaza * 0.7, 30) : k === 'mine' ? Math.min(Math.max(24, R * 0.2), 70) : Math.min(Math.max(18, R * 0.16), 48); }

    // --- landmark at the plaza edge, facing in; a wonder rises there over decades ---
    const wonderProg = (sp & 16) ? 1 : workProg('wonder');
    const lmKind = wonderProg >= 0 ? WONDER[cname][Math.min(8, (sp & 16) ? (sp >> 5) & 15 : era)] : LANDMARK[cname][band];
    const lmAngle = axis + Math.PI * 0.9; const lmR = plaza * 0.9;
    const landmarkSize = (kind, big) => {
      const S = { menhirs: [plaza * 1.4, 3.5, plaza * 1.4], ziggurat: [46, 22, 46], pyramid: [110, 70, 110], steppyramid: [44, 26, 44], temple: [34, 17, 58], colosseum: [150, 45, 120], cathedral: [44, 60, 96], church: [16, 22, 34], basilica: [60, 55, 90], mosque: [50, 40, 50], tajmosque: [60, 55, 60], mudmosque: [36, 18, 36], onion: [24, 34, 40], hall: [48, 18, 26], pagoda: [22, 42, 22], stupa: [40, 26, 40], shikhara: [26, 42, 34], stepped: [60, 34, 60], mound: [70, 12, 70], pueblo: [40, 12, 30], palace: [110, 22, 40], keep: [26, 30, 26], station: [70, 18, 30], crystal: [120, 30, 60], irontower: [60, 300, 60], stadium: [190, 40, 150], spire: [70, 600, 70], lighthouse: [16, 55, 16], granary: [10, 8, 10] }[kind] || [30, 15, 30];
      const m = big ? (kind === 'menhirs' ? 2.2 : kind === 'irontower' || kind === 'spire' ? 1.3 : 1.9) : 1;
      return [S[0] * m, S[1] * m, S[2] * m];
    };
    const hasLm = lvl >= 2 || era === 0 || isCap;
    const lmPlot = hasLm ? (() => { const [lw, , ld] = landmarkSize(lmKind, wonderProg >= 0); return { x: Math.cos(lmAngle) * (lmR + ld * 0.5), z: Math.sin(lmAngle) * (lmR + ld * 0.5), r: Math.max(lw, ld) * 0.5 }; })() : null;
    // --- houses on the slot grid ---
    const cellPass = (kind, x, z) => { for (const k in dist) { if (near(x, z, dist[k]) < dist[k].rad) return false; } return true; };
    const n = Math.ceil(R * 1.3 / s);
    const heightOf = (kind, cent) => {
      const base = { hut: 4, tipi: 5, longhouse: 5, stilt: 6, adobe: 4.5, pueblo: 7, courtyard: 5.5, courtyardc: 5.5, domehouse: 6, gable: 7.5, hip: 7, curved: 6.5, halftimber: 10, townhouse: 12, mansard: 16, palazzo: 16, terrace: 8.5, tenement: 18, block: 16, tower: 60, skyscraper: 160, granary: 5 }[kind] || 6;
      const cap = [7, 9, 10, 14, 18, 22, 28, 320, 520][era];
      let h = base * (0.85 + rnd(7) * 0.3);
      if (kind === 'block') h = (10 + 18 * cent) * (0.7 + rnd(8) * 0.6);
      if (kind === 'tower') h = (35 + 90 * cent * (lvl >= 3 ? 1.6 : 1)) * (0.7 + rnd(9) * 0.6);
      if (kind === 'skyscraper') h = (120 + 260 * cent * (lvl >= 4 ? 1.5 : 1)) * (0.7 + rnd(10) * 0.7);
      return Math.min(cap, h);
    };
    let count = 0; const maxN = coarse ? 2600 : 12000;
    const slots = [];
    for (let gy = -n; gy <= n; gy++) for (let gx = -n; gx <= n; gx++) {
      // streets: leave every (blockN+1)-th row/column empty in planned towns; organic towns leave radial lanes
      if (planned && ((gx % (blockN + 1) + blockN + 1) % (blockN + 1) === 0 || (gy % (blockN + 1) + blockN + 1) % (blockN + 1) === 0)) continue;
      let u = gx * s, v = gy * s;
      if (!planned) { u += (hash(i, 100 + gx * 131 + gy) - 0.5) * s * 0.7; v += (hash(i, 200 + gx * 131 + gy) - 0.5) * s * 0.7; }
      const x = u * ca - v * sa, z = u * sa + v * ca; const r = Math.hypot(x, z);
      if (r < plaza) continue;
      const ang = Math.atan2(z, x);
      if (!planned) { let lane = false; for (const g of lanes) { const da = Math.abs(((ang - g) + Math.PI * 3) % (Math.PI * 2) - Math.PI); if (da * r < s * 0.5 && r > plaza) { lane = true; break; } } if (!lane && era >= 1) { const rr = (r - plaza) % ringStep; if (rr < s * 0.75 && r - plaza > s) lane = true; } if (lane) continue; }
      const lump = 0.86 + 0.28 * (0.5 + 0.5 * Math.cos(ang * 3 + rnd(41) * 6.28)) * (0.5 + 0.5 * Math.sin(ang * 5 + rnd(42) * 6.28));
      const fill = 1 - smooth(R * 0.72 * lump, R * 1.25 * lump, r) * 0.92;
      if (hash(i, 300 + gx * 131 + gy) > fill) continue;
      if (!cellPass('h', x, z)) continue;
      if (lmPlot && Math.hypot(x - lmPlot.x, z - lmPlot.z) < lmPlot.r + s * 0.45) continue;   // no house on the landmark's plot
      slots.push([r, x, z, gx, gy]);
    }
    slots.sort((a, b) => a[0] - b[0]);
    const coarseFrom = coarse ? 0 : (lvl >= 4 ? R * 0.5 : 1e9);
    let nSites = 0;
    for (const [r, x, z, gx, gy] of slots) {
      if (count >= maxN) break;
      const cent = 1 - clamp(r / R, 0, 1); const k = 1000 + gx * 131 + gy;
      const yaw = -axis + (planned ? (hash(i, k) < 0.5 ? 0 : Math.PI / 2) : (hash(i, k) - 0.5) * 0.9 + (hash(i, k + 1) < 0.5 ? 0 : Math.PI / 2));
      if (r > coarseFrom || coarse) {
        // one instance per block at the edge of big cities (and for far towns)
        if ((gx % 2 + 2) % 2 || (gy % 2 + 2) % 2) continue;
        const hh = era >= 6 ? (6 + 14 * cent) * (0.7 + hash(i, k + 2) * 0.6) : 5 + 4 * cent;
        push(era >= 6 ? 'block' : 'blockold', x, z, s * 1.7, hh, s * 1.7, -axis, colorOf(k + 3), packStyle(era >= 7 ? WALL.concrete : houses[0][2], houses[0][3], cul, FLAG.block)); count++; continue;
      }
      // construction state of this plot: part of the newest ring, or being rebuilt for the new age
      let prog = 1, old = false;
      if (growing && r > Rprev * 0.97) { const t0 = hash(i, k + 13) * T * 0.7; prog = clamp((age - t0) / (T * 0.45), 0, 1); if (prog <= 0) continue; }
      if (waves) { const tUp = hash(i, k + 17) * ERA_T * 0.85; if (eraAge < tUp) old = true; else if (eraAge < tUp + 4) prog = Math.min(prog, clamp((eraAge - tUp) / 4, 0.05, 1)); }
      const hs = old ? housesOld : houses; const pl = old ? palOld : pal;
      const e = pickW(hs, hash(i, k + 4)); let kind = e[0], wm = e[2], rm = e[3];
      let w = s * (0.48 + 0.16 * cent + hash(i, k + 5) * 0.24), d = s * (0.48 + 0.16 * cent + hash(i, k + 6) * 0.24);
      if (kind === 'longhouse') { w *= 2.1; d *= 0.75; } if (kind === 'terrace') { w *= 2.4; d *= 0.8; } if (kind === 'hut' || kind === 'tipi') { w = d = Math.min(w, d) * 0.85; }
      if (kind === 'courtyard' || kind === 'courtyardc') { w *= 1.35; d *= 1.35; } if (kind === 'palazzo') { w *= 1.8; d *= 1.5; } if (kind === 'block') { w *= 1.5; d *= 1.5; }
      if (kind === 'townhouse') { w *= 0.7; d *= 1.15; } if (kind === 'tower' || kind === 'skyscraper') { w *= 1.2; d *= 1.2; }
      // Sims-style plot variety: extras around the core kinds
      let h = heightOf(kind, cent);
      if (!old && era >= 7 && lvl >= 3 && cent > 0.55 && hash(i, k + 7) < (0.25 + 0.35 * (era - 7)) * cent) { kind = era >= 8 && hash(i, k + 8) < 0.35 ? 'skyscraper' : 'tower'; wm = WALL.glass; rm = ROOF.flat; h = heightOf(kind, cent); w = d = Math.min(s * 0.82, 40 + hash(i, k + 9) * 25); }
      if (!old && era === 6 && lvl >= 2 && hash(i, k + 7) < 0.06) { kind = 'chimney'; w = d = 3; h = 28 + hash(i, k + 8) * 20; wm = WALL.brick; }
      if (planned) { w = Math.min(w, s * 0.82); d = Math.min(d, s * 0.82); }
      if (quake >= 0 && hash(i, k + 11) < 0.35 * (1 - quake / 3)) { push('rubble', x, z, w, Math.min(h * 0.75, 6), d, yaw, colorOfP(pl, k + 10), packStyle(wm, ROOF.flat, cul, FLAG.ruin)); count++; continue; }
      const hit = push(kind, x, z, w, h, d, yaw, colorOfP(pl, k + 10), packStyle(wm, rm, cul, 0), 0, prog); if (old) hit.era = Math.max(0, era - 1); count++; if (prog < 1) nSites++;
    }

    // --- the landmark itself (its plot was kept clear above) ---
    if (lvl >= 2 || era === 0 || isCap) {
      const [lw, lh, ld] = landmarkSize(lmKind, wonderProg >= 0);
      const lx = Math.cos(lmAngle) * (lmR + ld * 0.5), lz = Math.sin(lmAngle) * (lmR + ld * 0.5);
      const lmWall = ['menhirs', 'mound'].includes(lmKind) ? WALL.stone : lmKind === 'mudmosque' || lmKind === 'stepped' && cul === 4 ? WALL.adobe : lmKind === 'irontower' ? WALL.brick : lmKind === 'crystal' || lmKind === 'spire' ? WALL.glass : lmKind === 'station' ? WALL.brick : ['hall', 'pagoda', 'onion'].includes(lmKind) ? WALL.wood : lmKind === 'stadium' ? WALL.concrete : ['mosque', 'tajmosque', 'basilica', 'palace', 'stupa'].includes(lmKind) ? WALL.plaster : WALL.stone;
      const lmRoof = ['hall', 'pagoda'].includes(lmKind) ? ROOF.glazed : ['onion', 'basilica', 'mosque', 'tajmosque', 'stupa'].includes(lmKind) ? ROOF.copper : lmKind === 'cathedral' || lmKind === 'church' || lmKind === 'station' ? ROOF.slate : lmKind === 'temple' || lmKind === 'palace' ? ROOF.tile : ROOF.flat;
      const lmCol = { menhirs: 0x8b857a, pyramid: 0xe7d9b0, ziggurat: 0xcdb082, steppyramid: 0xb9b0a0, temple: 0xf1ebdd, colosseum: 0xe6dcc4, cathedral: 0xc9c2b3, church: 0xd6cfc0, basilica: 0xebe3d0, mosque: 0xf3efe6, tajmosque: 0xf7f4ee, mudmosque: 0xb8845a, onion: 0xf1ede2, hall: 0xb3462f, pagoda: 0xa64534, stupa: 0xf3efe6, shikhara: 0xd8c39a, stepped: 0xa39a88, mound: 0x6f7f4a, pueblo: 0xc48f5f, palace: 0xf1e6cf, keep: 0x8c8478, station: 0x9a5a48, crystal: 0xd9e6ee, irontower: 0x6b5a4a, stadium: 0xd8dbdf, spire: 0xcbd7e0, lighthouse: 0xf2efe8 }[lmKind] || 0xd9d2c2;
      push(lmKind, lx, lz, lw, lh, ld, -(lmAngle + Math.PI / 2), lmCol, packStyle(lmWall, lmRoof, cul, wonderProg >= 0 ? FLAG.wonder | FLAG.landmark : FLAG.landmark), 0, wonderProg >= 0 ? wonderProg : 1);
      // plaza furniture
      const propKind = era === 0 ? null : era <= 2 ? 'well' : era <= 5 ? 'fountain' : 'statue';
      if (propKind && !coarse) push(propKind, Math.cos(lmAngle + Math.PI) * plaza * 0.25, Math.sin(lmAngle + Math.PI) * plaza * 0.25, propKind === 'well' ? 3 : propKind === 'statue' ? 4 : 8, propKind === 'well' ? 2.5 : propKind === 'statue' ? 9 : 4, propKind === 'well' ? 3 : propKind === 'statue' ? 4 : 8, 0, 0xbfb6a6, packStyle(WALL.stone, ROOF.flat, cul, 0));
      if (era >= 1 && era <= 5 && cul === 3 && !coarse && lvl >= 3) push('obelisk', Math.cos(lmAngle + Math.PI * 0.5) * plaza * 0.5, Math.sin(lmAngle + Math.PI * 0.5) * plaza * 0.5, 3, 18, 3, 0, 0xd9c8a8, packStyle(WALL.stone, ROOF.flat, cul, 0));
    }
    // --- districts ---
    const quarter = (d, main, mainSize, mainCol, wm, rm, support, nSup) => {
      const yaw = -(d.a + Math.PI / 2);
      const head = push(main, d.x, d.z, mainSize[0], mainSize[1], mainSize[2], yaw, mainCol, packStyle(wm, rm, cul, FLAG.landmark), 0, d.prog);
      if (coarse || d.prog < 0.75) return head;
      for (let k = 0; k < nSup; k++) { const a = d.a + (k / nSup) * Math.PI * 2 + 0.5; const rr = d.rad * 1.15 + s * 0.4; const e = pickW(houses, rnd(700 + k)); push(support || e[0], d.x + Math.cos(a) * rr, d.z + Math.sin(a) * rr, s * 0.6, heightOf(e[0], 0.3) * 0.9, s * 0.6, yaw + (rnd(720 + k) - 0.5), colorOf(730 + k), packStyle(e[2], e[3], cul, 0), 0, d.prog < 1 ? clamp((d.prog - 0.75) / 0.25, 0.05, 1) : 1); }
      return head;
    };
    if (dist.temple) { const tk = era <= 2 ? (cul === 3 || cul === 5 ? 'ziggurat' : cul === 8 ? 'steppyramid' : 'stepped') : era === 3 ? 'temple' : LANDMARK[cname][band] === 'menhirs' ? 'temple' : (['cathedral', 'basilica', 'onion', 'station', 'stadium', 'spire', 'palace'].includes(LANDMARK[cname][band]) ? (cul === 3 || cul === 5 && era >= 5 ? 'mosque' : 'church') : LANDMARK[cname][band]); const sz = landmarkSize(tk, false); quarter(dist.temple, tk, [sz[0] * 0.7, sz[1] * 0.8, sz[2] * 0.7], tk === 'church' ? 0xd6cfc0 : tk === 'temple' ? 0xf1ebdd : 0xe6dcc4, tk === 'mosque' ? WALL.plaster : WALL.stone, tk === 'church' ? ROOF.slate : tk === 'mosque' ? ROOF.copper : ROOF.tile, null, 8); }
    if (dist.academy) quarter(dist.academy, era >= 6 ? 'palazzo' : era >= 3 ? 'temple' : 'courtyard', era >= 6 ? [36, 16, 22] : [26, 11, 34], 0xe7e0d2, era >= 6 ? WALL.brick : WALL.stone, era >= 6 ? ROOF.slate : ROOF.tile, null, 8);
    if (dist.palace) (quarter(dist.palace, era <= 2 ? (cul === 6 ? 'hall' : cul === 3 ? 'ziggurat' : cul === 8 ? 'steppyramid' : 'palace') : era <= 4 ? (cul === 6 ? 'hall' : 'keep') : era <= 5 ? (cul === 6 ? 'hall' : 'palace') : 'palace', era <= 2 ? [30, 10, 24] : era <= 4 ? [24, 26, 24] : [60, 18, 26], era >= 5 ? 0xf1e6cf : 0xd9cba8, WALL.stone, cul === 6 ? ROOF.glazed : ROOF.tile, null, coarse ? 0 : 4)).as = 'palace';
    if (dist.keep) { push('keep', dist.keep.x, dist.keep.z, 22, 28, 22, -axis, 0x8c8478, packStyle(WALL.stone, ROOF.flat, cul, FLAG.landmark)); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; push('roundtower', dist.keep.x + Math.cos(a) * 19, dist.keep.z + Math.sin(a) * 19, 7, 20, 7, 0, 0x85807a, packStyle(WALL.stone, ROOF.slate, cul, 0)); } }
    if (dist.market && !coarse) { const d = dist.market; push('hall', d.x, d.z, Math.max(14, d.rad * 0.9), 6 + (era >= 3 ? 4 : 0), Math.max(10, d.rad * 0.6), -(d.a + Math.PI / 2), 0xd9b98c, packStyle(era >= 3 ? WALL.stone : WALL.wood, era >= 6 ? ROOF.metal : ROOF.tile, cul, FLAG.landmark), 0, d.prog).as = 'market'; if (d.prog >= 0.6) for (let k = 0; k < 8; k++) { const a = d.a + k * 0.7; const rr = d.rad * (0.5 + rnd(800 + k) * 0.5); push('stall', d.x + Math.cos(a) * rr, d.z + Math.sin(a) * rr, 3.2, 2.8, 2.4, rnd(810 + k) * 3, [0xc84a3a, 0xd9a94a, 0x5a8a5a, 0xe6dcc4][k % 4], packStyle(WALL.wood, ROOF.thatch, cul, 0)); } }
    if (dist.mine && !coarse) { const d = dist.mine; const yaw = -(d.a + Math.PI / 2); push(era >= 6 ? 'chimney' : 'keep', d.x, d.z, era >= 6 ? 4 : 8, era >= 6 ? 30 : 14, era >= 6 ? 4 : 8, yaw, era >= 6 ? 0x4a4440 : 0x6e5537, packStyle(era >= 6 ? WALL.brick : WALL.timber, ROOF.flat, cul, FLAG.landmark), 0, d.prog).as = 'mine'; for (let k = 0; k < 2; k++) push('barn', d.x + Math.cos(d.a + 1.2 + k * 2) * d.rad * 0.5, d.z + Math.sin(d.a + 1.2 + k * 2) * d.rad * 0.5, 12, 5, 8, yaw + k, 0x7a6247, packStyle(WALL.wood, ROOF.shingle, cul, 0), 0, d.prog); for (let k = 0; k < 4; k++) push('rubble', d.x + Math.cos(d.a + k * 1.5) * d.rad * 0.8, d.z + Math.sin(d.a + k * 1.5) * d.rad * 0.8, 9, 3.5, 9, rnd(830 + k) * 3, 0x6f685e, packStyle(WALL.stone, ROOF.flat, cul, FLAG.ruin)); }
    if (dist.industry) { const d = dist.industry; const nF = coarse ? 2 : 3 + Math.min(4, lvl); for (let k = 0; k < nF; k++) { const a = d.a + (k - nF / 2) * 0.5; const rr = R * 0.12 * (k % 2 ? 1 : 0.4); push('factory', d.x + Math.cos(a) * rr, d.z + Math.sin(a) * rr, 42, 11, 26, -axis + (k % 2 ? 0 : Math.PI / 2), era >= 7 ? 0x9ea3a8 : 0x7a4a3c, packStyle(era >= 7 ? WALL.concrete : WALL.brick, ROOF.metal, cul, 0)); if (era === 6 || rnd(850 + k) < 0.4) push('chimney', d.x + Math.cos(a) * rr + 14, d.z + Math.sin(a) * rr + 9, 3.5, 36, 3.5, 0, 0x5a4a44, packStyle(WALL.brick, ROOF.flat, cul, 0)); } }
    if (dist.harbour) {
      const d = dist.harbour; const dirx = Math.cos(d.a), dirz = Math.sin(d.a); const pr = d.prog;
      const nP = coarse ? 1 : 2 + Math.min(3, lvl);
      for (let k = 0; k < nP; k++) { const off = (k - (nP - 1) / 2) * 22; const px = d.x + dirx * 40 - dirz * off, pz = d.z + dirz * 40 + dirx * off; const pp = clamp((pr - k * 0.12) / 0.5, 0, 1); if (pp <= 0) continue; push('pier', px, pz, 70 * Math.max(0.3, pp), 1.6, 4, -d.a, 0x6a563e, packStyle(WALL.wood, ROOF.flat, cul, 0), 0); if (!coarse && pr >= 0.8) push(era >= 6 ? 'ship' : 'boat', px + dirx * 30, pz + dirz * 30 + 5, era >= 6 ? 34 : 9, era >= 6 ? 8 : 2.5, era >= 6 ? 8 : 3, -d.a, era >= 6 ? 0x5b6068 : 0x7c5a38, packStyle(WALL.wood, ROOF.flat, cul, 0)); }
      const nW = coarse ? 1 : 3 + lvl; for (let k = 0; k < nW; k++) { const off = (k - nW / 2) * 18; const pp = clamp((pr - 0.2 - k * 0.1) / 0.5, 0, 1); if (pp <= 0) continue; push(era >= 6 ? 'warehouse' : 'gable', d.x - dirx * 22 - dirz * off, d.z - dirz * 22 + dirx * off, 16, era >= 6 ? 9 : 6, 10, -d.a + Math.PI / 2, era >= 6 ? 0x8a6a4e : colorOf(900 + k), packStyle(era >= 6 ? WALL.brick : WALL.wood, era >= 6 ? ROOF.metal : ROOF.tile, cul, 0), 0, pp); }
      if (era >= 3 && lvl >= 3 && pr >= 1) push('lighthouse', d.x + dirx * 120 - dirz * 60, d.z + dirz * 120 + dirx * 60, 8, 26, 8, 0, 0xf2efe8, packStyle(WALL.stone, ROOF.copper, cul, FLAG.landmark));
      if (era >= 7 && !coarse && pr >= 1) for (let k = 0; k < 3; k++) push('crane', d.x + dirx * 60 - dirz * (k - 1) * 40, d.z + dirz * 60 + dirx * (k - 1) * 40, 6, 40, 6, -d.a, 0xd9552f, packStyle(WALL.concrete, ROOF.flat, cul, 0));
    }
    // --- walls: a ring with towers and gates; bastions in the Renaissance; going up segment by segment when under construction ---
    const walls = [];
    if (wallStyle !== 'none') {
      const segs = Math.max(14, Math.round(wallR * 2 * Math.PI / (wallStyle === 'bastion' ? 40 : 24)));
      const lvlDrawn = wallsL || 1;
      const hW = wallStyle === 'palisade' ? 3.5 : wallStyle === 'mud' ? 5 + lvlDrawn * 1.2 : wallStyle === 'bastion' ? 7 : 7 + lvlDrawn * 2;
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
        if (isGate) { push('gatehouse', (x1 + x2) / 2, (z1 + z2) / 2, len, hW * 1.7, thick + 5, yaw, wCol, packStyle(wm, ROOF.slate, cul, 0), 0, segProg).th = hW; walls.push({ x: (x1 + x2) / 2, z: (z1 + z2) / 2, gate: true }); continue; }
        push(wKind, (x1 + x2) / 2, (z1 + z2) / 2, len, hW, thick, yaw, wCol, packStyle(wm, ROOF.flat, cul, 0), 0, segProg).th = hW;
        if (wallStyle === 'bastion') { if (k % 4 === 0) push('bastion', x1, z1, 26, hW * 1.1, 26, Math.atan2(z1, x1), wCol, packStyle(WALL.stone, ROOF.flat, cul, 0), 0, segProg); }
        else if (k % (wallStyle === 'palisade' ? 5 : 3) === 0) { const tw = push(wallStyle === 'palisade' ? 'keep' : 'roundtower', x1, z1, wallStyle === 'palisade' ? 4 : 6 + lvlDrawn, hW * (wallStyle === 'palisade' ? 1.5 : 1.6), wallStyle === 'palisade' ? 4 : 6 + lvlDrawn, wallStyle === 'palisade' ? 0 : Math.atan2(z1, x1) + Math.PI / 2, wCol, packStyle(wm, wallStyle === 'stone' ? ROOF.slate : ROOF.flat, cul, 0), 0, segProg); tw.th = hW; if (wallStyle === 'palisade') tw.as = 'watchtower'; }
      }
    }
    // --- farmsteads in the fields (more with every level of farming), the odd windmill; the newest are still being raised ---
    if (!coarse && era <= 7 && lvl >= 1) {
      const farmProg = workProg('farm'); const nDone = 2 + infra * 2 + (era >= 4 ? 1 : 0); const nF = nDone + (farmProg >= 0 ? 2 : 0);
      for (let k = 0; k < nF; k++) {
        const a = rnd(950 + k) * Math.PI * 2; const rr = R * (1.35 + rnd(960 + k) * 0.9 + 0.12 * Math.floor(k / 4)) + 40;
        const fx = Math.cos(a) * rr, fz = Math.sin(a) * rr; const e = pickW(houses, rnd(970 + k)); const pp = k >= nDone ? clamp(farmProg * 1.3 - (k - nDone) * 0.3, 0.05, 1) : 1;
        push(e[0] === 'block' || e[0] === 'tower' || e[0] === 'skyscraper' || e[0] === 'tenement' ? 'gable' : e[0], fx, fz, 9, 6, 7, rnd(980 + k) * 3, colorOf(990 + k), packStyle(e[2], e[3], cul, 0), 0, pp);
        if (era >= 1) push('barn', fx + 14, fz + 6, 14, 6.5, 8, rnd(981 + k) * 3, era >= 5 ? 0x8a3f33 : 0x7a6247, packStyle(WALL.wood, era >= 5 ? ROOF.metal : ROOF.thatch, cul, 0), 0, pp);
        if (era >= 4 && era <= 6 && rnd(995 + k) < 0.3) push('windmill', fx - 18, fz - 10, 7, 16, 7, rnd(996 + k) * 3, 0xd9d0bd, packStyle(WALL.stone, ROOF.thatch, cul, 0), 0, pp);
        if (era >= 1 && infra >= 3 && rnd(997 + k) < 0.5) push('granary', fx - 10, fz + 12, 6, 6, 6, 0, 0xc9b48c, packStyle(WALL.adobe, ROOF.thatch, cul, 0), 0, pp);
      }
    }
    if (!coarse && era >= 8 && lvl >= 2) for (let k = 0; k < 6; k++) { const a = rnd(1050 + k) * Math.PI * 2; const rr = R * (1.5 + rnd(1060 + k) * 0.9) + 80; push('turbine', Math.cos(a) * rr, Math.sin(a) * rr, 3, 90, 3, rnd(1070 + k) * 3, 0xf0f2f4, packStyle(WALL.concrete, ROOF.flat, cul, 0)); }
    // streetlamps along the main axis (near view only)
    if (!coarse && era >= 6 && lvl >= 2) { const nL = Math.min(40, Math.round(R / 22)); for (let k = 0; k < nL; k++) { const t = (k + 1) / nL * R * 0.95; const side = k % 2 ? 1 : -1; push('lamp', t * ca * side + (-sa) * s * 0.42, t * sa * side + ca * s * 0.42, 0.4, 7, 0.4, 0, 0x3b3f44, packStyle(WALL.concrete, ROOF.flat, cul, FLAG.neon)); } }
    // --- streets, for the ground decal: [x0, z0, x1, z1, halfWidth] in metres ---
    const streets = []; const cls = era <= 2 ? 0.56 : era <= 6 ? 0.68 : 0.88;   // trodden earth, cobbles, asphalt (the terrain shader reads the class)
    if (planned) {
      const step = (blockN + 1) * s; const hw = Math.max(1.5, street * (era >= 6 ? 0.5 : 0.32)); const ext = R * 1.15;
      for (let u = -Math.ceil(ext / step) * step; u <= ext; u += step) { const half = Math.sqrt(Math.max(0, ext * ext - u * u)); if (half < s) continue;
        streets.push([u * ca - (-half) * sa, u * sa + (-half) * ca, u * ca - half * sa, u * sa + half * ca, hw]);      // along v
        streets.push([(-half) * ca - u * sa, (-half) * sa + u * ca, half * ca - u * sa, half * sa + u * ca, hw]); }     // along u
    } else {
      const hw = Math.max(1.0, Math.min(s * 0.26, [1.3, 1.6, 2, 3, 2.6, 3.5, 5, 7, 8][era]));   // footpaths between huts, lanes in a town, streets in a city
      for (const a of lanes) { const r1 = R * 1.12; streets.push([Math.cos(a) * plaza * 0.85, Math.sin(a) * plaza * 0.85, Math.cos(a) * r1, Math.sin(a) * r1, hw]); }
      if (era >= 1) for (let rr = plaza + ringStep; rr < R * 0.98; rr += ringStep) { const n = Math.max(16, Math.round(rr / 12)); for (let k = 0; k < n; k++) { const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2; streets.push([Math.cos(a0) * rr, Math.sin(a0) * rr, Math.cos(a1) * rr, Math.sin(a1) * rr, hw * 0.9]); } }
    }
    // the plots a player can build on (drawn radius), with what already stands there
    const plots = []; for (let sl = 0; sl < SLOT_N; sl++) { const a = slotAngle(i, axis, sl); plots.push({ slot: sl, x: Math.cos(a) * distR * kS, z: Math.sin(a) * distR * kS, used: used.has(sl) }); }
    // --- to drawn scale ---
    for (const it of items) { it.x *= kS; it.z *= kS; it.w *= kS; it.d *= kS; it.h *= kH; }
    for (const st of streets) { st[0] *= kS; st[1] *= kS; st[2] *= kS; st[3] *= kS; st[4] *= kS; }
    for (const wv of walls) { wv.x *= kS; wv.z *= kS; }
    const out = { key, R: R * kS, Rt: R, k: kS, kh: kH, plaza: plaza * kS, axis, gates, items, walls, wallR: wallStyle !== 'none' ? wallR * kS : 0, culture: cul, era, coast, streets, streetCls: cls, plots, sites: nSites, growing: !!growing };
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
    const R = c ? radiusM(sim, i, c) : 100; const key = `${su.toFixed(3)}|${sv.toFixed(3)}|${Math.round(R / 50)}|${terrain && terrain.stats ? terrain.stats.packsE + '/' + terrain.stats.packsI : 0}|${decal && decal.segIndex ? 1 : 0}`;
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
    if (ru.era >= 3 && rnd(7) < 0.6) push('pillars', Math.cos(rnd(8) * 6) * R * 0.3, Math.sin(rnd(8) * 6) * R * 0.3, 26, 9 * (1 - decay * 0.5), 8, rnd(9) * 3, 0xd9d0c0, WALL.stone, ROOF.flat, FLAG.landmark);
    if (ru.wonder) { const kind = WONDER[cname][Math.min(8, ru.wonder - 1)]; const S = { menhirs: [40, 4, 40], ziggurat: [80, 36, 80], pyramid: [200, 130, 200], steppyramid: [80, 48, 80], temple: [60, 28, 100], colosseum: [280, 80, 230], cathedral: [84, 110, 180], church: [16, 22, 34], basilica: [110, 100, 170], mosque: [95, 76, 95], tajmosque: [110, 100, 110], mudmosque: [68, 34, 68], onion: [45, 64, 76], hall: [90, 34, 50], pagoda: [42, 80, 42], stupa: [76, 50, 76], shikhara: [50, 80, 64], stepped: [114, 64, 114], mound: [150, 26, 150], pueblo: [76, 23, 57], palace: [200, 42, 76], irontower: [78, 390, 78], crystal: [228, 57, 114], stadium: [360, 76, 285], spire: [91, 780, 91], lighthouse: [30, 104, 30] }[kind] || [60, 30, 60]; const keep = kind === 'pyramid' || kind === 'steppyramid' || kind === 'ziggurat' || kind === 'stepped' || kind === 'mound' ? 0.92 : 0.45 + 0.3 * (1 - decay); push(kind, 0, 0, S[0], S[1] * keep, S[2], rnd(10) * 3, stoneCol, WALL.stone, ROOF.flat, FLAG.landmark | FLAG.wonder); }
    for (const it of items) { it.x *= kS; it.z *= kS; it.w *= kS; it.d *= kS; it.h *= kH; }
    const out = { key, items, R: R * kS, k: kS }; ruinCache.set(i, out); if (ruinCache.size > 300) ruinCache.delete(ruinCache.keys().next().value); return out;
  }
  window.TOWN = { siteOf, gateToward, ruinLayout, CULTURES, WALL, ROOF, FLAG, cultureOf, civCulture, radiusM, radiusTrue, scaleOf, fieldsM, layout, packStyle, SLOT_N, cacheSize: () => cache.size, clearCache: () => cache.clear() };
})();
