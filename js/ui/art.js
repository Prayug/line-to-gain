// Original football illustrations, drawn as inline SVG so they theme with CSS.
// No league or team marks anywhere: helmets are generic shapes in a player's colors.

export function helmet(primary = '#5cb3ff', secondary = '#0b1712', stripe = '#f4f1e8', size = 56) {
  return `<svg class="helmet" viewBox="0 0 64 56" width="${size}" height="${size * 0.875}" aria-hidden="true">
    <path d="M8 34C8 17 20 6 36 6c13 0 23 9 23 22 0 6-2 10-6 13l-6 2H27l-5 7H12l-3-7C8 40 8 37 8 34z" fill="${primary}"/>
    <path d="M30 6c-3 8-4 19-3 37" stroke="${stripe}" stroke-width="3.5" fill="none" opacity=".9"/>
    <path d="M44 31h17M44 37h15M48 29v12M56 29v12" stroke="${secondary}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M40 27c0 6 2 10 6 12" stroke="${secondary}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <circle cx="23" cy="30" r="4.5" fill="${secondary}" opacity=".85"/>
  </svg>`;
}

export function downMarker(text = '1', size = 60) {
  return `<svg class="marker-icon" viewBox="0 0 40 60" width="${size * 0.66}" height="${size}" aria-hidden="true">
    <rect x="4" y="2" width="32" height="24" rx="3" fill="var(--stick)"/>
    <text x="20" y="21" text-anchor="middle" font-family="Big Shoulders Display, Impact" font-weight="900" font-size="20" fill="var(--ink)">${text}</text>
    <rect x="18" y="26" width="5" height="32" fill="var(--stick-deep)"/>
  </svg>`;
}

export function ball(size = 22) {
  return `<svg class="ball" viewBox="0 0 40 24" width="${size}" height="${size * 0.6}" aria-hidden="true">
    <ellipse cx="20" cy="12" rx="18" ry="10" fill="#8a4a22"/>
    <path d="M6 12h28" stroke="#f4f1e8" stroke-width="1.6"/>
    <path d="M15 9v6M18 9v6M21 9v6M24 9v6" stroke="#f4f1e8" stroke-width="1.4"/>
  </svg>`;
}

// Stat-group pictograms for the round identity.
export function groupIcon(group, size = 44) {
  const s = `width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true" class="group-icon"`;
  switch (group) {
    case 'pass': return `<svg ${s}><path d="M6 40C14 14 30 8 42 8" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="4 4"/><ellipse cx="40" cy="9" rx="6" ry="3.6" transform="rotate(-30 40 9)" fill="currentColor"/><circle cx="8" cy="40" r="4" fill="none" stroke="currentColor" stroke-width="3"/></svg>`;
    case 'rush': return `<svg ${s}><path d="M6 34h22l6-10 8 0" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M36 18l8 6-8 6" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><circle cx="8" cy="34" r="4" fill="currentColor"/></svg>`;
    case 'rec': return `<svg ${s}><path d="M8 40V18h18v-8" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><path d="M20 12l6-6 6 6" fill="none" stroke="currentColor" stroke-width="3.5"/><circle cx="8" cy="40" r="4.5" fill="none" stroke="currentColor" stroke-width="3"/><ellipse cx="38" cy="10" rx="6" ry="3.4" fill="currentColor"/></svg>`;
    case 'def': return `<svg ${s}><path d="M24 4l16 6v12c0 11-7 18-16 22C15 40 8 33 8 22V10z" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M17 17l14 14M31 17L17 31" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>`;
    case 'kick': return `<svg ${s}><path d="M14 6v18h20V6M24 24v20" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="24" cy="12" rx="5" ry="3" fill="currentColor"/></svg>`;
    case 'ret': return `<svg ${s}><path d="M42 30H18c-6 0-10-4-10-9s4-9 10-9h14" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M36 22l8 8-8 8" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>`;
    case 'team': return helmet('currentColor', 'var(--night)', 'var(--night)', size);
    case 'honors': return `<svg ${s}><path d="M14 6h20v8c0 7-4 12-10 12s-10-5-10-12z" fill="currentColor"/><path d="M14 9H7c0 6 3 9 7 9M34 9h7c0 6-3 9-7 9" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 26v8M15 42h18l-3-8H18z" fill="currentColor" stroke="currentColor" stroke-width="2"/></svg>`;
    default: return `<svg ${s}><path d="M6 24h36M24 6v36" stroke="currentColor" stroke-width="3.5"/><circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="3.5"/></svg>`;
  }
}

// X's and O's, seeded so a round always gets the same diagram.
export function playDiagram(seed = 1) {
  let a = seed >>> 0;
  const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  const os = [];
  for (let i = 0; i < 7; i++) os.push(`<circle cx="${120 + i * 40}" cy="300" r="11" fill="none" stroke="currentColor" stroke-width="3"/>`);
  const routes = [];
  for (let i = 0; i < 4; i++) {
    const x = 60 + rnd() * 480;
    const y1 = 270 - rnd() * 60;
    const x2 = x + (rnd() - 0.5) * 220;
    const y2 = 40 + rnd() * 120;
    routes.push(`<path d="M${x} 300 L${x} ${y1} Q ${x} ${y2 + 40} ${x2} ${y2}" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="${i % 2 ? '0' : '9 7'}" marker-end="url(#arr${seed})"/>`);
  }
  const xs = [];
  for (let i = 0; i < 6; i++) {
    const x = 80 + rnd() * 440;
    const y = 120 + rnd() * 100;
    xs.push(`<path d="M${x - 9} ${y - 9}l18 18M${x + 9} ${y - 9}l-18 18" stroke="currentColor" stroke-width="3"/>`);
  }
  return `<svg class="play" viewBox="0 0 600 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><marker id="arr${seed}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>
    <path d="M0 290H600" stroke="currentColor" stroke-width="2" stroke-dasharray="2 10"/>
    ${os.join('')}${xs.join('')}${routes.join('')}
  </svg>`;
}

// A top-down field strip. Used on the home hero (in perspective) and results.
export function fieldSvg({ width = 1200, height = 420, numbers = true, id = 'f' } = {}) {
  const ez = width * 0.0833;
  const yd = (width - ez * 2) / 100;
  const lines = [];
  for (let y = 0; y <= 100; y += 5) {
    const x = ez + y * yd;
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="rgba(244,241,232,${y % 10 ? 0.25 : 0.55})" stroke-width="${y % 10 ? 1.5 : 3}"/>`);
  }
  for (let y = 1; y < 100; y++) {
    if (y % 5 === 0) continue;
    const x = ez + y * yd;
    lines.push(`<line x1="${x}" y1="${height * 0.33}" x2="${x}" y2="${height * 0.33 + 9}" stroke="rgba(244,241,232,.35)" stroke-width="1.5"/><line x1="${x}" y1="${height * 0.67 - 9}" x2="${x}" y2="${height * 0.67}" stroke="rgba(244,241,232,.35)" stroke-width="1.5"/>`);
  }
  const nums = [];
  if (numbers) {
    for (let y = 10; y <= 90; y += 10) {
      const label = y <= 50 ? y : 100 - y;
      const x = ez + y * yd;
      nums.push(`<text x="${x}" y="${height * 0.86}" text-anchor="middle" font-family="Big Shoulders Display, Impact" font-weight="800" font-size="${height * 0.11}" fill="rgba(244,241,232,.5)">${label}</text>`);
      nums.push(`<text x="${x}" y="${height * 0.2}" text-anchor="middle" font-family="Big Shoulders Display, Impact" font-weight="800" font-size="${height * 0.11}" fill="rgba(244,241,232,.5)" transform="rotate(180 ${x} ${height * 0.16})">${label}</text>`);
    }
  }
  const stripes = [];
  for (let y = 0; y < 100; y += 10) stripes.push(`<rect x="${ez + y * yd}" y="0" width="${yd * 5}" height="${height}" fill="rgba(255,255,255,.025)"/>`);
  return `<svg class="field-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}-turf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#14533a"/><stop offset="1" stop-color="#0d3a29"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#${id}-turf)"/>
    ${stripes.join('')}
    <rect width="${ez}" height="${height}" fill="rgba(0,0,0,.18)"/><rect x="${width - ez}" width="${ez}" height="${height}" fill="rgba(0,0,0,.18)"/>
    ${lines.join('')}${nums.join('')}
  </svg>`;
}

// Mode artwork: each mode gets its own scene.
export function modeArt(id) {
  const svg = (body, extra = '') => `<svg class="mode-art" viewBox="0 0 240 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true" ${extra}>${body}</svg>`;
  switch (id) {
    case 'classic': return svg(`
      <path d="M0 118H240" stroke="var(--chalk)" stroke-width="3"/>
      <path d="M8 124h224" stroke="var(--chalk-dim)" stroke-width="3" stroke-dasharray="1 8" stroke-linecap="round"/>
      <rect x="150" y="10" width="64" height="44" rx="4" fill="var(--stick)"/>
      <text x="182" y="45" text-anchor="middle" font-family="Big Shoulders Display, Impact" font-weight="900" font-size="34" fill="var(--ink)">10</text>
      <rect x="178" y="54" width="8" height="64" fill="var(--stick-deep)"/>
      <rect x="28" y="40" width="6" height="78" fill="var(--first-down)" class="sweep"/>
      <ellipse cx="96" cy="104" rx="16" ry="9" fill="#8a4a22"/><path d="M86 104h20" stroke="var(--chalk)" stroke-width="2"/>`);
    case 'daily': return svg(`
      <rect x="40" y="18" width="110" height="116" rx="8" fill="var(--chalk)"/>
      <rect x="40" y="18" width="110" height="30" rx="8" fill="var(--stick)"/>
      <rect x="40" y="38" width="110" height="10" fill="var(--stick)"/>
      <text x="95" y="104" text-anchor="middle" font-family="Big Shoulders Display, Impact" font-weight="900" font-size="54" fill="var(--ink)" class="daily-num">1</text>
      <path d="M160 120 C 180 100, 170 70, 200 60 S 226 30, 232 20" fill="none" stroke="var(--first-down)" stroke-width="5" stroke-linecap="round" stroke-dasharray="6 7"/>
      <circle cx="232" cy="20" r="6" fill="var(--first-down)"/>`);
    case 'pir': return svg(`
      <path d="M20 120H220" stroke="var(--chalk)" stroke-width="3"/>
      <rect x="150" y="20" width="6" height="100" fill="var(--first-down)"/>
      <g class="flag"><path d="M92 18 L136 30 L104 58 Z" fill="var(--first-down)"/><circle cx="98" cy="24" r="6" fill="var(--ink)" opacity=".3"/><path d="M92 18 L92 70" stroke="var(--ink)" stroke-width="3"/></g>
      <text x="196" y="80" text-anchor="middle" font-family="Big Shoulders Display, Impact" font-weight="900" font-size="26" fill="var(--danger)">BUST</text>`);
    case 'redzone': return svg(`
      <rect x="0" y="0" width="240" height="150" fill="rgba(255,77,94,.16)"/>
      ${[0, 1, 2, 3, 4, 5].map(i => `<path d="M${i * 46 - 20} 150 L${i * 46 + 40} 0" stroke="rgba(255,77,94,.35)" stroke-width="14"/>`).join('')}
      <circle cx="120" cy="80" r="46" fill="var(--night)" stroke="var(--chalk)" stroke-width="6"/>
      <rect x="112" y="22" width="16" height="12" rx="2" fill="var(--chalk)"/>
      <path d="M120 80 L120 48" stroke="var(--danger)" stroke-width="6" stroke-linecap="round" class="hand"/>
      <text x="120" y="112" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="18" fill="var(--chalk)">:20</text>`);
    case 'noeasy': return svg(`
      <path d="M120 22l14 30 32 3-24 21 7 32-29-17-29 17 7-32-24-21 32-3z" fill="var(--first-down)"/>
      <circle cx="120" cy="72" r="58" fill="none" stroke="var(--danger)" stroke-width="10"/>
      <path d="M79 31l82 82" stroke="var(--danger)" stroke-width="10" stroke-linecap="round"/>`);
    case 'gauntlet': return svg(`
      ${[0, 1, 2, 3, 4].map(i => `<g transform="translate(${18 + i * 44} ${110 - i * 20})"><rect width="36" height="${30 + i * 20}" rx="3" fill="${i === 4 ? 'var(--first-down)' : 'var(--chalk)'}" opacity="${0.45 + i * 0.13}"/><text x="18" y="22" text-anchor="middle" font-family="Big Shoulders Display, Impact" font-weight="900" font-size="20" fill="var(--ink)">${i + 1}</text></g>`).join('')}`);
    case 'twominute': return svg(`
      <rect x="22" y="30" width="196" height="90" rx="10" fill="#000" stroke="rgba(244,241,232,.25)" stroke-width="3"/>
      <text x="120" y="98" text-anchor="middle" font-family="Big Shoulders Display, Impact" font-weight="900" font-size="72" fill="var(--danger)" class="clock-digits">2:00</text>
      <circle cx="120" cy="20" r="6" fill="var(--danger)" class="blink"/>`);
    case 'sicko': return svg(`
      <path d="M20 120H220" stroke="var(--chalk)" stroke-width="2" stroke-dasharray="2 8"/>
      ${[0, 1, 2, 3, 4].map(i => `<circle cx="${50 + i * 35}" cy="120" r="9" fill="none" stroke="var(--chalk)" stroke-width="3"/>`).join('')}
      <path d="M50 110 C 40 60, 120 90, 100 40 S 190 70, 200 20" fill="none" stroke="var(--first-down)" stroke-width="4" stroke-dasharray="7 6"/>
      <path d="M120 110 C 170 90, 60 70, 150 45 S 70 30, 50 18" fill="none" stroke="var(--stick)" stroke-width="4"/>
      <path d="M190 110 Q 230 60 180 80 T 220 30" fill="none" stroke="#c9a0ff" stroke-width="4" stroke-dasharray="2 6" stroke-linecap="round"/>`);
    default: return svg('');
  }
}

export function packIcon(id, size = 34) {
  const map = { classic: 'rec', deep: 'rush', playoffs: 'honors', history: 'pass', teams: 'team', sicko: 'def' };
  return groupIcon(map[id] || 'all', size);
}
