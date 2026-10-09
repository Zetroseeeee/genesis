// GENESIS procedural ruler portraits: a small canvas painting of whoever holds the throne.
// Everything is derived from (seed, culture, era, sex, trait, realm colour), so the same ruler always looks the same; a house
// (o.house: its seed) gives its people its own look, which three in four of them have feature by feature, and a child (o.child)
// has a child's face: rounder, no beard, nothing on its head. o.rank: 'ruler' (the default) wears what rulers of the age wear,
// 'royal' (a consort, a prince) a circlet at most, 'none' nothing on the head.
(function () {
  // culture keys follow TOWN.CULTURES: med north east mena africa sasia easia seasia america namerica
  const SKIN = { med: ['#e8c3a0', '#dcb08a', '#cfa07a'], north: ['#f1d2b6', '#e8c4a2', '#dcb28f'], east: ['#edcdb0', '#e0bb98', '#d2a983'], mena: ['#d9a977', '#c9975f', '#b8834f'], africa: ['#7a4a2a', '#5e3820', '#472a17'], sasia: ['#b97b4e', '#a46940', '#8e5733'], easia: ['#f0d3b0', '#e4c196', '#d2ab7c'], seasia: ['#d2a06c', '#c08c5a', '#a9784a'], america: ['#c58a5a', '#b67a4b', '#a56a3e'], namerica: ['#c9906a', '#b77c57', '#a56a48'] };
  const HAIR = { med: ['#2a1d14', '#4a3222', '#1c1512'], north: ['#3b2a1c', '#6b4a2b', '#b48a4a', '#2a2420', '#8a3b1f'], east: ['#2a1d14', '#4a3222', '#7a5a34'], mena: ['#1f1712', '#2e2018', '#4a3122'], africa: ['#120e0c', '#1e1613'], sasia: ['#15100d', '#2a1c14'], easia: ['#15110f', '#231a16'], seasia: ['#15110f', '#1f1713'], america: ['#161210', '#23191a'], namerica: ['#161210', '#23191a'] };
  // the features a house hands down: skin, hair, the head's breadth and length, the eyes, the beard
  const FAMILY = { 1: 1, 2: 1, 4: 1, 5: 1, 8: 1, 10: 1 };
  const rnd01 = (seed, k) => { let x = (seed * 374761393 + k * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  const shade = (hex, f) => { const m = hex.match(/[0-9a-f]{2}/gi).map(h => parseInt(h, 16)); return `rgb(${m.map(v => Math.max(0, Math.min(255, Math.round(v * f)))).join(',')})`; };
  const rgbShade = (rgb, f) => { const m = rgb.match(/\d+/g); if (!m) return rgb; return `rgb(${m.slice(0, 3).map(v => Math.max(0, Math.min(255, Math.round(+v * f)))).join(',')})`; };

  function draw(canvas, o) {
    const S = canvas.width; const ctx = canvas.getContext('2d'); const u = S / 64; // design in a 64-unit square
    const seed = (o.seed | 0) >>> 0, cul = o.culture || 'north', era = o.era | 0, fem = !!o.fem, trait = o.trait || 'steward', col = o.color || 'rgb(120,120,140)';
    const hs = (o.house | 0) >>> 0, kid = !!o.child, rank = o.rank || 'ruler';
    const r = (k) => (hs && FAMILY[k] && rnd01(seed, 50 + k) < 0.75 ? rnd01(hs, k) : rnd01(seed, k));
    const skin = (SKIN[cul] || SKIN.north)[Math.floor(r(1) * 3)], hair = (HAIR[cul] || HAIR.north)[Math.floor(r(2) * (HAIR[cul] || HAIR.north).length)];
    const grey = o.age > 45 ? 0.3 + Math.min(0.6, (o.age - 45) / 40) : 0; const hairC = grey ? `rgb(${[170, 165, 160].map((v, i) => Math.round(v * grey + parseInt(hair.slice(1 + i * 2, 3 + i * 2), 16) * (1 - grey))).join(',')})` : hair;
    ctx.clearRect(0, 0, S, S); ctx.save(); ctx.scale(u, u);
    // backdrop: the realm's colour, darkened, with a soft light
    const bg = ctx.createRadialGradient(28, 22, 4, 32, 32, 34); bg.addColorStop(0, rgbShade(col, 0.75)); bg.addColorStop(1, rgbShade(col, 0.28)); ctx.fillStyle = bg; ctx.fillRect(0, 0, 64, 64);
    // shoulders and robe
    const robe = era >= 7 ? (fem ? rgbShade(col, 0.9) : '#2a2f3a') : rank === 'ruler' ? rgbShade(col, 1.15) : rank === 'royal' ? rgbShade(col, 0.75 + r(21) * 0.5) : ['#5b4a3a', '#3e4a5c', '#4f5a3a', '#6a3f3a', '#4a4058'][Math.floor(r(21) * 5)];
    ctx.fillStyle = robe; ctx.beginPath(); ctx.moveTo(6, 64); ctx.quadraticCurveTo(10, 44, 24, 42); ctx.lineTo(40, 42); ctx.quadraticCurveTo(54, 44, 58, 64); ctx.closePath(); ctx.fill();
    if (era >= 6) { ctx.fillStyle = '#e9e2d2'; ctx.beginPath(); ctx.moveTo(26, 42); ctx.lineTo(32, 52); ctx.lineTo(38, 42); ctx.closePath(); ctx.fill(); } // collar
    if (trait === 'merchant' || era >= 4 && r(3) < 0.4) { ctx.strokeStyle = '#d9b45a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(23, 44); ctx.quadraticCurveTo(32, 54, 41, 44); ctx.stroke(); } // chain
    // neck
    ctx.fillStyle = shade(skin, 0.86); ctx.fillRect(27, 34, 10, 10);
    // head
    const jaw = fem || kid ? 1 : 1.08; const hw = 11 * (0.95 + r(4) * 0.12) * (kid ? 1.03 : 1), hh = 13.5 * (0.95 + r(5) * 0.1) * (kid ? 0.9 : 1);
    const headY = 24;
    // hair behind (long hair / bun)
    const style = r(6); const long = fem ? style < 0.7 : style < 0.15; const bald = !fem && era >= 0 && r(7) < 0.14 && (o.age || 40) > 35;
    if (long) { ctx.fillStyle = hairC; ctx.beginPath(); ctx.ellipse(32, headY + 6, hw + 3.5, hh + 6, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(32, headY, hw, hh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(skin, 0.92); ctx.beginPath(); ctx.ellipse(32, headY + 4, hw * 0.98 * jaw, hh * 0.72, 0, 0, Math.PI); ctx.fill(); // lower face shading
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(32, headY + 1, hw * 0.9, hh * 0.78, 0, 0, Math.PI); ctx.fill();
    // ears
    ctx.fillStyle = shade(skin, 0.95); ctx.beginPath(); ctx.ellipse(32 - hw, headY + 1, 1.8, 2.8, 0, 0, Math.PI * 2); ctx.ellipse(32 + hw, headY + 1, 1.8, 2.8, 0, 0, Math.PI * 2); ctx.fill();
    // eyes
    const eyeY = headY - 1.5, eyeDX = 4.3; const tired = trait === 'tyrant';
    ctx.fillStyle = '#f4efe6'; ctx.beginPath(); ctx.ellipse(32 - eyeDX, eyeY, 2.3, 1.5, 0, 0, Math.PI * 2); ctx.ellipse(32 + eyeDX, eyeY, 2.3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    const iris = ['#3a2a1c', '#2b3a5c', '#4d6b3a', '#1c1510', '#5a4a2a'][Math.floor(r(8) * (cul === 'north' ? 5 : cul === 'east' || cul === 'med' || cul === 'mena' ? 3 : 1))];
    ctx.fillStyle = iris; ctx.beginPath(); ctx.arc(32 - eyeDX, eyeY, 1.1, 0, Math.PI * 2); ctx.arc(32 + eyeDX, eyeY, 1.1, 0, Math.PI * 2); ctx.fill();
    // brows: trait sets the mood
    ctx.strokeStyle = hairC; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.beginPath();
    const browTilt = trait === 'conqueror' || tired ? 0.9 : trait === 'scholar' ? -0.4 : 0; const browY = eyeY - 3.2;
    ctx.moveTo(32 - eyeDX - 2.4, browY - browTilt * 0.4); ctx.lineTo(32 - eyeDX + 2.2, browY + browTilt); ctx.moveTo(32 + eyeDX - 2.2, browY + browTilt); ctx.lineTo(32 + eyeDX + 2.4, browY - browTilt * 0.4); ctx.stroke();
    // nose and mouth
    ctx.strokeStyle = shade(skin, 0.7); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(32, eyeY + 1); ctx.lineTo(31, eyeY + 5.5); ctx.lineTo(33, eyeY + 5.8); ctx.stroke();
    const smile = trait === 'merchant' || trait === 'builder' ? 1 : trait === 'tyrant' || trait === 'conqueror' ? -1 : 0;
    ctx.strokeStyle = fem ? '#9e4a4a' : shade(skin, 0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(29.5, eyeY + 9); ctx.quadraticCurveTo(32, eyeY + 9 + smile * 1.6, 34.5, eyeY + 9); ctx.stroke();
    // facial hair
    if (!fem && !kid && r(9) < (era >= 7 ? 0.35 : 0.65)) { ctx.fillStyle = hairC; const kind = r(10); if (kind < 0.45) { ctx.beginPath(); ctx.ellipse(32, headY + 10.5, hw * 0.8, 4.5 + r(11) * 4, 0, 0, Math.PI); ctx.fill(); } else if (kind < 0.8) { ctx.beginPath(); ctx.ellipse(32, eyeY + 7.6, 3.6, 1.2, 0, 0, Math.PI * 2); ctx.fill(); } else { ctx.beginPath(); ctx.ellipse(32, headY + 11.8, 2.4, 1.7, 0, 0, Math.PI * 2); ctx.fill(); } }
    // hair on top
    if (!bald) { ctx.fillStyle = hairC; ctx.beginPath(); ctx.ellipse(32, headY - hh * 0.55, hw + 0.8, hh * 0.62, 0, Math.PI, Math.PI * 2); ctx.fill(); if (r(12) < 0.5) { ctx.beginPath(); ctx.ellipse(32 - hw * 0.4, headY - hh * 0.3, hw * 0.55, hh * 0.45, 0.3, Math.PI, Math.PI * 2); ctx.fill(); } }
    // scar for a conqueror, spectacles for a late scholar
    if (trait === 'conqueror' && r(13) < 0.6) { ctx.strokeStyle = shade(skin, 0.6); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(32 + eyeDX + 1, eyeY - 4); ctx.lineTo(32 + eyeDX + 3, eyeY + 4); ctx.stroke(); }
    if (trait === 'scholar' && era >= 5) { ctx.strokeStyle = '#2b2622'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(32 - eyeDX, eyeY, 3, 0, Math.PI * 2); ctx.arc(32 + eyeDX, eyeY, 3, 0, Math.PI * 2); ctx.moveTo(32 - eyeDX + 3, eyeY); ctx.lineTo(32 + eyeDX - 3, eyeY); ctx.stroke(); }
    // headgear by era
    const gold = '#d9b45a', goldD = '#a67f2c', topY = headY - hh;
    const gem = ['#b8323a', '#2e6fbf', '#2f9e5a'][Math.floor(r(14) * 3)];
    // (a prince or a consort: a thin circlet from the Classical age, a ruler's own headgear only for the ruler)
    if (!kid && rank === 'royal' && era >= 3 && era <= 6) { ctx.strokeStyle = gold; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(32 - hw + 0.5, topY + 4.2); ctx.quadraticCurveTo(32, topY + 2.4, 32 + hw - 0.5, topY + 4.2); ctx.stroke(); }
    switch (kid || rank !== 'ruler' ? -1 : era) {
      case 0: // stone age: leather band, maybe feathers
        ctx.fillStyle = '#6b4a2b'; ctx.fillRect(32 - hw - 0.5, topY + 3.5, hw * 2 + 1, 2.2);
        if (r(15) < 0.5) { ctx.fillStyle = trait === 'pious' ? '#e9e2d2' : '#c84b2f'; for (let k = 0; k < 2 + Math.floor(r(16) * 2); k++) { ctx.beginPath(); ctx.ellipse(32 + hw - 2 + k * 1.3, topY - 1 - k * 2.5, 1.1, 4, 0.5 - k * 0.2, 0, Math.PI * 2); ctx.fill(); } } break;
      case 1: // bronze: circlet or horned helm
        if (trait === 'conqueror' || r(17) < 0.3) { ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.ellipse(32, topY + 3, hw + 1.2, 6, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e5dcc8'; ctx.beginPath(); ctx.moveTo(32 - hw - 1, topY + 3); ctx.quadraticCurveTo(32 - hw - 6, topY - 2, 32 - hw - 2, topY - 8); ctx.lineTo(32 - hw + 1, topY + 1); ctx.moveTo(32 + hw + 1, topY + 3); ctx.quadraticCurveTo(32 + hw + 6, topY - 2, 32 + hw + 2, topY - 8); ctx.lineTo(32 + hw - 1, topY + 1); ctx.fill(); }
        else { ctx.strokeStyle = gold; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(32 - hw, topY + 4.5); ctx.quadraticCurveTo(32, topY + 1.5, 32 + hw, topY + 4.5); ctx.stroke(); } break;
      case 2: // iron age: helmet band with cheek guards, or a plain fillet
        if (trait === 'conqueror' || r(17) < 0.4) { ctx.fillStyle = '#5c6068'; ctx.beginPath(); ctx.ellipse(32, topY + 4, hw + 1, 7, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillRect(32 - hw - 1, topY + 3, 2.2, 9); ctx.fillRect(32 + hw - 1.2, topY + 3, 2.2, 9); if (r(18) < 0.5) { ctx.fillStyle = '#b8323a'; ctx.fillRect(30.5, topY - 7, 3, 11); } }
        else { ctx.fillStyle = '#e9e2d2'; ctx.fillRect(32 - hw, topY + 3.5, hw * 2, 1.6); } break;
      case 3: // classical: laurel
        ctx.strokeStyle = '#4f8a3a'; ctx.lineWidth = 1.2; for (let k = 0; k < 7; k++) { const a = Math.PI * (1.05 + k * 0.13); ctx.beginPath(); ctx.ellipse(32 + Math.cos(a) * (hw + 0.5), topY + 6 + Math.sin(a) * hh * 0.5, 2.2, 1, a + 0.4, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.ellipse(32 - Math.cos(a) * (hw + 0.5), topY + 6 + Math.sin(a) * hh * 0.5, 2.2, 1, -a - 0.4, 0, Math.PI * 2); ctx.stroke(); } break;
      case 4: // medieval: crown
      case 5: { // renaissance: taller crown with velvet, or a plumed cap
        if (era === 5 && r(19) < 0.45) { ctx.fillStyle = trait === 'pious' ? '#e9e2d2' : rgbShade(col, 0.9); ctx.beginPath(); ctx.ellipse(32, topY + 2, hw + 2.5, 5.5, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(32 + hw + 2, topY - 2, 1.4, 5, 0.6, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillStyle = gold; const b = topY + 5, h = era === 5 ? 9 : 7; ctx.beginPath(); ctx.moveTo(32 - hw, b); ctx.lineTo(32 - hw, b - h + 2); ctx.lineTo(32 - hw * 0.5, b - h + 5); ctx.lineTo(32, b - h); ctx.lineTo(32 + hw * 0.5, b - h + 5); ctx.lineTo(32 + hw, b - h + 2); ctx.lineTo(32 + hw, b); ctx.closePath(); ctx.fill(); ctx.strokeStyle = goldD; ctx.lineWidth = 0.6; ctx.stroke(); ctx.fillStyle = gem; ctx.beginPath(); ctx.arc(32, b - 2.5, 1.3, 0, Math.PI * 2); ctx.fill(); if (era === 5) { ctx.fillStyle = '#7a1f3a'; ctx.beginPath(); ctx.ellipse(32, b - h + 2, hw * 0.6, 3, 0, Math.PI, Math.PI * 2); ctx.fill(); } } break; }
      case 6: // industrial: top hat / bonnet
        if (fem) { ctx.fillStyle = rgbShade(col, 1.2); ctx.beginPath(); ctx.ellipse(32, topY + 2, hw + 3, 6, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#f0e8d8'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(32 - hw - 3, topY + 2.5); ctx.lineTo(32 + hw + 3, topY + 2.5); ctx.stroke(); }
        else { ctx.fillStyle = '#17161a'; ctx.fillRect(32 - hw - 2.5, topY + 2, hw * 2 + 5, 2); ctx.fillRect(32 - hw + 1, topY - 11, hw * 2 - 2, 13.5); ctx.fillStyle = '#5a4a2a'; ctx.fillRect(32 - hw + 1, topY + 0.5, hw * 2 - 2, 1.6); } break;
      case 7: // modern: bare head, or a peaked cap for a conqueror
        if (trait === 'conqueror') { ctx.fillStyle = '#3b4a3a'; ctx.beginPath(); ctx.ellipse(32, topY + 2.5, hw + 1.5, 5, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillRect(32 - hw - 1, topY + 2, hw * 2 + 2, 1.5); ctx.fillStyle = '#17161a'; ctx.fillRect(32 - hw + 0.5, topY + 3.5, hw * 2 - 1, 1.6); ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(32, topY + 0.5, 1.2, 0, Math.PI * 2); ctx.fill(); } break;
      default: break; // information age: as they are
    }
    // pious: a small pendant
    if (trait === 'pious') { ctx.strokeStyle = gold; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(32, 46); ctx.lineTo(32, 52); ctx.moveTo(29.5, 48.5); ctx.lineTo(34.5, 48.5); ctx.stroke(); }
    // vignette
    const vg = ctx.createRadialGradient(32, 30, 20, 32, 32, 40); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, 64, 64);
    ctx.restore();
  }
  window.PORTRAIT = { draw };
})();
