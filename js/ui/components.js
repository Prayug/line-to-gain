// Shared UI pieces. All of them return HTML strings or work on DOM nodes.

import { esc, fmt, plural } from '../util.js';
import { helmet } from './art.js';

export const REDUCED = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2"/></svg>',
  locker: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="7" height="18" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="3" width="7" height="18" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 7h1M16 7h1" stroke="currentColor" stroke-width="2"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14M12 17.5v.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  trophy: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 6h20v8c0 7-4 12-10 12s-10-5-10-12z" fill="currentColor"/><path d="M14 9H7c0 6 3 9 7 9M34 9h7c0 6-3 9-7 9" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 26v8M15 42h18l-3-8H18z" fill="currentColor"/></svg>',
};

// ---------------------------------------------------------------- people

export function avatar(p, D, cls = '') {
  const team = p.team && D?.team(p.team);
  const primary = team ? team.color : p.color;
  const secondary = team ? team.color2 : '#0b1712';
  return `<span class="avatar ${cls}" style="--c:${p.color}">${helmet(primary, secondary, team ? '#f4f1e8' : 'rgba(255,255,255,.85)')}</span>`;
}

export function headshotUrl(key, size = 120) {
  if (!key) return '';
  const upload = key.startsWith('u:');
  const id = upload ? key.slice(2) : key;
  return `https://static.www.nfl.com/image/${upload ? 'upload' : 'private'}/f_auto,q_auto,w_${size},h_${size},c_fill,g_face/league/${id}`;
}

export function initials(name) {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function headshot(player, size = 120) {
  const url = player?.head ? headshotUrl(player.head, size) : '';
  return `<span class="headshot">${esc(initials(player?.name || '?'))}${url ? `<img src="${url}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}</span>`;
}

export function teamChip(id, D) {
  const t = D.team(id);
  if (!t) return '';
  return `<span class="teamchip" style="--tc:${t.color};--tc2:${t.color2}" title="${esc(t.name)}">${esc(id)}</span>`;
}

export function years(p) {
  if (!p.from) return '';
  if (p.active) return `${p.from}–`;
  return p.to && p.to !== p.from ? `${p.from}–${String(p.to).slice(-2)}` : String(p.from);
}

export function scorebug(match, bump = -1) {
  const label = match.mode === 'gauntlet' ? `Round ${match.roundNo}/5` : match.length > 1 ? `Round ${match.roundNo}` : 'Round';
  const nums = match.mode === 'gauntlet' ? match.points : match.wins;
  return `<div class="scorebug">
    <span class="sb-round">${label}</span>
    ${match.players.map((p, i) => `<span class="sb-team" style="--c:${p.color}"><b>${esc(p.name)}</b><span class="sb-num${i === bump ? ' bump' : ''}">${nums[i]}</span></span>`).join('')}
  </div>`;
}

export function badgeFor(round) {
  const cls = round.badge === 'Postseason' ? 'post' : round.badge === 'Super Bowl' ? 'sb' : round.entity === 'team' ? 'team' : '';
  return `<span class="badge ${cls}">${esc(round.badge)}</span>`;
}

export function unitText(v, stat) {
  return `${fmt(v)} ${plural(v, stat.one, stat.many)}`;
}

// ---------------------------------------------------------------- motion

export function odometer(v) {
  const strip = Array.from({ length: 30 }, (_, i) => `<span>${i % 10}</span>`).join('');
  return [...fmt(v)].map(ch => (/\d/.test(ch)
    ? `<span class="odo-d" data-d="${ch}" aria-hidden="true"><span class="odo-strip">${strip}</span></span>`
    : `<span class="odo-s" aria-hidden="true">${ch}</span>`)).join('');
}

export function rollOdometer(root, animate, delay = 0) {
  root.querySelectorAll('.odo-d').forEach((el, i) => {
    const strip = el.firstElementChild;
    const to = `translateY(${-(20 + Number(el.dataset.d))}em)`;
    if (!animate || REDUCED) { strip.style.transform = to; return; }
    strip.style.transform = 'translateY(0)';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      strip.style.transition = `transform ${900 + i * 160}ms cubic-bezier(.12,.75,.2,1) ${delay}ms`;
      strip.style.transform = to;
    }));
  });
}

export function countUp(el, from, to, ms = 700) {
  if (!el) return;
  if (REDUCED || from === to) { el.textContent = fmt(to); return; }
  const start = performance.now();
  let done = false;
  const step = now => {
    if (done) return;
    const t = Math.min(1, (now - start) / ms);
    el.textContent = fmt(from + (to - from) * (1 - (1 - t) ** 3));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // Frames stop on a locked phone; the true number can't wait for them.
  setTimeout(() => { done = true; el.textContent = fmt(to); }, ms + 30);
}

export function replay(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function confetti(colors) {
  if (REDUCED) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  cv.setAttribute('aria-hidden', 'true');
  document.body.append(cv);
  const ctx = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = (cv.width = innerWidth * dpr);
  const H = (cv.height = innerHeight * dpr);
  const pal = [...colors, '#f4f1e8', '#ffd23a', '#ff6a1a'];
  const bits = Array.from({ length: 190 }, (_, i) => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.5, y: H * 0.42,
    vx: (Math.random() - 0.5) * 17 * dpr, vy: (-Math.random() * 19 - 6) * dpr,
    w: (6 + Math.random() * 7) * dpr, h: (3 + Math.random() * 4) * dpr,
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35, c: pal[i % pal.length], ball: i % 11 === 0,
  }));
  const t0 = performance.now();
  const life = 3000;
  const frame = now => {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = Math.max(0, 1 - t / life);
    for (const b of bits) {
      b.vy += 0.42 * dpr; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      if (b.ball) {
        ctx.fillStyle = '#8a4a22';
        ctx.beginPath();
        ctx.ellipse(0, 0, 9 * dpr, 5.5 * dpr, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f4f1e8';
        ctx.fillRect(-3 * dpr, -0.6 * dpr, 6 * dpr, 1.2 * dpr);
      } else {
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      }
      ctx.restore();
    }
    if (t < life) requestAnimationFrame(frame);
    else cv.remove();
  };
  requestAnimationFrame(frame);
  setTimeout(() => cv.remove(), life + 500);
}

// ---------------------------------------------------------------- layers

export function toast(text, ms = 2600) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

export function modal(html, { onClose, label = 'Dialog' } = {}) {
  const layer = document.getElementById('layer');
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(label)}"><button class="close" aria-label="Close">×</button>${html}</div>`;
  layer.append(wrap);
  const prev = document.activeElement;
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    prev?.focus?.();
    onClose?.();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('.close')) close(); });
  setTimeout(() => (wrap.querySelector('[autofocus]') || wrap.querySelector('button:not(.close)') || wrap.querySelector('.close'))?.focus(), 30);
  return { el: wrap.querySelector('.modal'), close };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
