// Shareable result graphic, drawn on a canvas in the game's broadcast style,
// plus a plain-text summary and challenge links.

import { fmt, plural } from './util.js';
import { encodeChallenge } from './engine.js';

export function challengeUrl(round) {
  const base = location.origin + location.pathname;
  return `${base}?c=${encodeChallenge(round)}`;
}

export function resultText(match, round, st) {
  const lines = [`LINE TO GAIN · ${round.stat.label} · ${round.scope.label}`, `The line: ${fmt(round.target)} · ${round.n} each`];
  if (round.rules.length) lines.push(`Rule: ${round.rules.map(r => r.label).join(' + ')}`);
  for (const r of st.ranked) {
    const p = match.players[r.i];
    const pct = round.target ? ((100 * r.off) / round.target).toFixed(1) : '0';
    const tag = r.bust ? 'BUST' : r.off === 0 ? 'DEAD ON' : `${r.diff > 0 ? '+' : '−'}${fmt(r.off)}`;
    lines.push(`${r.place}. ${p.name}: ${fmt(r.total)} (${tag}, ${pct}% off)`);
  }
  lines.push(challengeUrl(round));
  return lines.join('\n');
}

const W = 1080;
const H = 1350;

export async function resultImage(match, round, st) {
  try { await document.fonts?.ready; } catch { /* draw with fallbacks */ }
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const display = '"Big Shoulders Display", Impact, sans-serif';
  const cond = '"Barlow Condensed", "Arial Narrow", sans-serif';

  // Night stadium background
  g.fillStyle = '#06110d';
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(150, -80, 10, 150, -80, 900);
  glow.addColorStop(0, 'rgba(255,244,214,.20)');
  glow.addColorStop(1, 'rgba(255,244,214,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // Header
  g.fillStyle = '#ff6a1a';
  g.fillRect(70, 70, 54, 40);
  g.fillStyle = '#c64b0a';
  g.fillRect(93, 110, 9, 44);
  g.fillStyle = '#f4f1e8';
  g.font = `900 64px ${display}`;
  g.fillText('LINE TO GAIN', 148, 128);
  g.fillStyle = '#a8bcb1';
  g.font = `700 28px ${cond}`;
  g.fillText(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(), 150, 166);

  // Category
  g.fillStyle = '#ffd23a';
  g.font = `800 28px ${cond}`;
  g.fillText(`${round.scope.label.toUpperCase()} · ${round.badge.toUpperCase()}`, 70, 250);
  g.fillStyle = '#f4f1e8';
  g.font = `900 ${round.stat.label.length > 22 ? 64 : 84}px ${display}`;
  wrapText(g, round.stat.label.toUpperCase(), 70, 330, W - 140, 80);
  let y = round.stat.label.length > 22 ? 420 : 400;
  if (round.rules.length) {
    g.fillStyle = '#ff4d5e';
    g.font = `800 30px ${cond}`;
    g.fillText(`RULE: ${round.rules.map(r => r.label.toUpperCase()).join(' + ')}`, 70, y);
    y += 50;
  }

  // The line (down marker)
  g.fillStyle = '#ff6a1a';
  roundRect(g, 70, y, 420, 170, 12);
  g.fill();
  g.fillStyle = '#0a0c0b';
  g.font = `800 26px ${cond}`;
  g.fillText('THE LINE', 100, y + 46);
  g.font = `900 ${fmt(round.target).length > 7 ? 92 : 116}px ${display}`;
  g.fillText(fmt(round.target), 98, y + 150);
  g.fillStyle = '#f4f1e8';
  g.font = `800 34px ${cond}`;
  g.fillText(`${round.n} ${plural(round.n, 'PLAYER', 'PLAYERS')} EACH`, 530, y + 70);
  g.fillStyle = '#a8bcb1';
  g.font = `700 28px ${cond}`;
  g.fillText(`${round.mode === 'pir' ? 'CLOSEST WITHOUT GOING OVER' : 'CLOSEST TO THE LINE WINS'}`, 530, y + 114);
  y += 230;

  // Field strip with drives
  const fx = 70;
  const fw = W - 140;
  const rowH = Math.min(84, Math.floor(520 / Math.max(1, st.rows.length)));
  const fh = rowH * st.rows.length + 40;
  g.fillStyle = '#0f3a2a';
  g.fillRect(fx, y, fw, fh);
  for (let k = 0; k <= 10; k++) {
    g.fillStyle = k % 5 === 0 ? 'rgba(244,241,232,.45)' : 'rgba(244,241,232,.2)';
    g.fillRect(fx + (fw * k) / 10, y, 2, fh);
  }
  const max = Math.max(round.target / 0.72, ...st.rows.map(r => Math.max(0, r.total) / 0.95));
  const lineX = fx + (fw * round.target) / max;
  st.ranked.forEach((r, n) => {
    const p = match.players[r.i];
    const cy = y + 20 + n * rowH + rowH / 2;
    const ex = fx + (fw * Math.max(0, r.total)) / max;
    g.fillStyle = p.color;
    g.fillRect(fx, cy - 7, Math.max(4, Math.min(ex, lineX) - fx), 14);
    if (ex > lineX) {
      g.save();
      g.globalAlpha = 0.55;
      g.fillRect(lineX, cy - 7, ex - lineX, 14);
      g.restore();
    }
    g.beginPath();
    g.arc(ex, cy, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f4f1e8';
    g.font = `900 30px ${display}`;
    g.fillText(p.name.toUpperCase().slice(0, 14), fx + 14, cy - 14);
  });
  g.fillStyle = '#ffd23a';
  g.fillRect(lineX - 4, y - 10, 8, fh + 20);
  y += fh + 60;

  // Leaderboard
  st.ranked.slice(0, 6).forEach((r, n) => {
    const p = match.players[r.i];
    const rowY = y + n * 62;
    g.fillStyle = n === 0 ? p.color : '#11241b';
    g.fillRect(70, rowY, W - 140, 52);
    g.fillStyle = n === 0 ? '#0a0c0b' : '#f4f1e8';
    g.font = `900 34px ${display}`;
    g.fillText(`${r.place}. ${p.name.toUpperCase().slice(0, 16)}`, 90, rowY + 38);
    const tag = r.bust ? 'BUST' : r.off === 0 ? 'DEAD ON' : `${r.diff > 0 ? '+' : '−'}${fmt(r.off)}`;
    g.font = `800 30px ${cond}`;
    const txt = `${fmt(r.total)}  ·  ${tag}`;
    g.fillText(txt, W - 90 - g.measureText(txt).width, rowY + 37);
  });

  // Crop to the content so small groups don't leave a blank card.
  const endY = Math.min(H, y + Math.min(6, st.ranked.length) * 62 + 70);
  g.fillStyle = '#6f857a';
  g.font = `700 24px ${cond}`;
  g.fillText(location.host + location.pathname.replace(/\/$/, ''), 70, endY - 24);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = endY;
  out.getContext('2d').drawImage(cv, 0, 0);
  return new Promise(res => out.toBlob(res, 'image/png'));
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrapText(g, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y);
      line = w;
      y += lineH;
    } else line = test;
  }
  g.fillText(line, x, y);
}

export async function shareResult(match, round, st) {
  const text = resultText(match, round, st);
  const blob = await resultImage(match, round, st);
  const file = blob ? new File([blob], 'line-to-gain.png', { type: 'image/png' }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title: 'Line to Gain' });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  if (blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'line-to-gain.png';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'downloaded';
  }
  return 'failed';
}
