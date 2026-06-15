// Rich inline SVG cover art for launch games — no external assets required.

export const LAUNCH_THUMBS = {
run3: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#03040A"/><stop offset="100%" stop-color="#12102A"/></linearGradient>
<radialGradient id="glow" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#28E08A" stop-opacity=".35"/><stop offset="100%" stop-color="#28E08A" stop-opacity="0"/></radialGradient>
</defs>
<rect width="640" height="360" fill="url(#bg)"/>
<rect width="640" height="360" fill="url(#glow)"/>
<g fill="#fff" opacity=".85"><circle cx="48" cy="42" r="1.2"/><circle cx="120" cy="88" r="1"/><circle cx="520" cy="56" r="1.4"/><circle cx="580" cy="120" r="1"/><circle cx="90" cy="210" r="1.2"/><circle cx="410" cy="34" r="1"/><circle cx="300" cy="70" r=".9"/></g>
<polygon points="420,118 560,92 640,210 640,360" fill="#28E08A" opacity=".42" stroke="#FFE135" stroke-width="3"/>
<polygon points="180,118 420,118 640,360 40,360" fill="#28E08A" stroke="#FFE135" stroke-width="4"/>
<polygon points="290,168 350,168 372,248 268,248" fill="#03040A"/>
<circle cx="310" cy="208" r="38" fill="#C9C9D4" stroke="#1A1A2E" stroke-width="4"/>
<circle cx="296" cy="248" r="12" fill="#C9C9D4" stroke="#1A1A2E" stroke-width="3"/>
<circle cx="326" cy="248" r="12" fill="#C9C9D4" stroke="#1A1A2E" stroke-width="3"/>
<line x1="292" y1="176" x2="282" y2="156" stroke="#1A1A2E" stroke-width="4"/>
<line x1="328" y1="176" x2="338" y2="156" stroke="#1A1A2E" stroke-width="4"/>
<text x="48" y="52" font-family="Arial,sans-serif" font-size="42" font-weight="900" fill="#FFE135">RUN 3</text>
<text x="48" y="320" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#4ECAFF">gravity tunnel runner</text>
</svg>`)}`,

slopkart: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#12082A"/><stop offset="100%" stop-color="#FF4EB8"/></linearGradient>
<linearGradient id="track" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#4ECAFF"/><stop offset="50%" stop-color="#B94EFF"/><stop offset="100%" stop-color="#FFE135"/></linearGradient>
</defs>
<rect width="640" height="360" fill="url(#sky)"/>
<ellipse cx="320" cy="380" rx="420" ry="120" fill="#1A1A2E" opacity=".55"/>
<path d="M40 260 Q320 120 600 260 L640 360 L0 360 Z" fill="url(#track)" opacity=".75"/>
<path d="M120 250 Q320 170 520 250" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="18 14" opacity=".55"/>
<rect x="250" y="198" width="140" height="52" rx="14" fill="#FF7A35" stroke="#1A1A2E" stroke-width="4"/>
<rect x="220" y="214" width="36" height="28" rx="8" fill="#FF4EB8" stroke="#1A1A2E" stroke-width="3"/>
<circle cx="248" cy="258" r="22" fill="#1A1A2E" stroke="#FFE135" stroke-width="4"/>
<circle cx="392" cy="258" r="22" fill="#1A1A2E" stroke="#FFE135" stroke-width="4"/>
<circle cx="248" cy="258" r="8" fill="#4ECAFF"/>
<circle cx="392" cy="258" r="8" fill="#4ECAFF"/>
<text x="40" y="56" font-family="Arial,sans-serif" font-size="40" font-weight="900" fill="#fff">SLOPKART</text>
<text x="40" y="320" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#FFE135">neon drift racing</text>
</svg>`)}`,

'sloppy-zombies': `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
<rect width="640" height="360" fill="#0B1410"/>
<defs><radialGradient id="szg" cx="50%" cy="20%" r="55%"><stop offset="0%" stop-color="#3DFFB0" stop-opacity=".12"/><stop offset="100%" stop-color="#3DFFB0" stop-opacity="0"/></radialGradient></defs>
<rect width="640" height="360" fill="url(#szg)"/>
<rect x="180" y="90" width="280" height="200" fill="#2A3D28" stroke="#1A1A2E" stroke-width="4"/>
<rect x="210" y="120" width="50" height="50" fill="#4ECAFF" stroke="#1A1A2E" stroke-width="3"/>
<rect x="380" y="120" width="50" height="50" fill="#4ECAFF" stroke="#1A1A2E" stroke-width="3"/>
<rect x="295" y="220" width="50" height="70" fill="#5C4030" stroke="#1A1A2E" stroke-width="3"/>
<polygon points="320,70 350,90 290,90" fill="#3D2B1F" stroke="#1A1A2E" stroke-width="3"/>
<circle cx="120" cy="260" r="18" fill="#3DFFB0" opacity=".85"/>
<circle cx="520" cy="240" r="16" fill="#3DFFB0" opacity=".85"/>
<circle cx="80" cy="180" r="14" fill="#3DFFB0" opacity=".7"/>
<text x="40" y="52" font-family="Arial,sans-serif" font-size="34" font-weight="900" fill="#3DFFB0">SLOPPY ZOMBIES</text>
<text x="40" y="320" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#FF7A35">co-op survival</text>
</svg>`)}`,

'dungeon-panic': `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
<rect width="640" height="360" fill="#120A18"/>
<g opacity=".9">
<rect x="120" y="60" width="80" height="80" fill="#2A2038" stroke="#4A3A58" stroke-width="2"/>
<rect x="200" y="60" width="80" height="80" fill="#3D2B55" stroke="#B94EFF" stroke-width="3"/>
<rect x="280" y="60" width="80" height="80" fill="#2A2038" stroke="#4A3A58" stroke-width="2"/>
<rect x="360" y="60" width="80" height="80" fill="#2A2038" stroke="#4A3A58" stroke-width="2"/>
<rect x="120" y="140" width="80" height="80" fill="#2A2038" stroke="#4A3A58" stroke-width="2"/>
<rect x="200" y="140" width="80" height="80" fill="#FF4EB8" opacity=".35" stroke="#FF4EB8" stroke-width="2"/>
<rect x="280" y="140" width="80" height="80" fill="#2A2038" stroke="#4A3A58" stroke-width="2"/>
<rect x="360" y="140" width="80" height="80" fill="#5C2040" stroke="#FF3B3B" stroke-width="3"/>
<rect x="120" y="220" width="80" height="80" fill="#2A2038" stroke="#4A3A58" stroke-width="2"/>
<rect x="200" y="220" width="80" height="80" fill="#2A2038" stroke="#4A3A58" stroke-width="2"/>
<rect x="280" y="220" width="80" height="80" fill="#FFE135" opacity=".25" stroke="#FFE135" stroke-width="2"/>
<rect x="360" y="220" width="80" height="80" fill="#2A2038" stroke="#4A3A58" stroke-width="2"/>
</g>
<circle cx="240" cy="180" r="22" fill="#4ECAFF" stroke="#1A1A2E" stroke-width="3"/>
<circle cx="400" cy="100" r="14" fill="#FF3B3B" stroke="#1A1A2E" stroke-width="2"/>
<text x="40" y="52" font-family="Arial,sans-serif" font-size="36" font-weight="900" fill="#B94EFF">DUNGEON PANIC</text>
<text x="40" y="320" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#FFE135">roguelike co-op</text>
</svg>`)}`,

'umbral-red': `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
<defs><linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1A0810"/><stop offset="100%" stop-color="#801818"/></linearGradient></defs>
<rect width="640" height="360" fill="url(#dusk)"/>
<ellipse cx="320" cy="300" rx="280" ry="40" fill="#000" opacity=".35"/>
<rect x="0" y="250" width="640" height="110" fill="#2A5A28"/>
<g fill="#1E4020"><rect x="40" y="230" width="24" height="50" rx="4"/><rect x="120" y="220" width="20" height="60" rx="4"/><rect x="500" y="225" width="26" height="55" rx="4"/><rect x="560" y="235" width="18" height="45" rx="4"/></g>
<circle cx="320" cy="170" r="48" fill="#FFD86B" stroke="#1A1A2E" stroke-width="4" opacity=".95"/>
<rect x="304" y="218" width="32" height="70" fill="#5C3018" stroke="#1A1A2E" stroke-width="3"/>
<ellipse cx="380" cy="260" rx="36" ry="28" fill="#2A1020" stroke="#FF4EB8" stroke-width="3"/>
<circle cx="368" cy="252" r="6" fill="#FF3B3B"/><circle cx="392" cy="252" r="6" fill="#FF3B3B"/>
<text x="40" y="52" font-family="Arial,sans-serif" font-size="38" font-weight="900" fill="#FFD86B">UMBRAL RED</text>
<text x="40" y="320" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#FF9DC9">creature-taming RPG</text>
</svg>`)}`,

slopcraft: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
<rect width="640" height="360" fill="#87CEEB"/>
<rect x="0" y="200" width="640" height="160" fill="#5FA855"/>
<g>
<rect x="140" y="140" width="40" height="40" fill="#795548" stroke="#1A1A2E" stroke-width="2"/>
<rect x="180" y="100" width="40" height="40" fill="#5FA855" stroke="#1A1A2E" stroke-width="2"/>
<rect x="220" y="140" width="40" height="40" fill="#795548" stroke="#1A1A2E" stroke-width="2"/>
<rect x="260" y="100" width="40" height="40" fill="#5FA855" stroke="#1A1A2E" stroke-width="2"/>
<rect x="300" y="140" width="40" height="40" fill="#8B6914" stroke="#1A1A2E" stroke-width="2"/>
<rect x="340" y="100" width="40" height="40" fill="#5FA855" stroke="#1A1A2E" stroke-width="2"/>
<rect x="380" y="140" width="40" height="40" fill="#795548" stroke="#1A1A2E" stroke-width="2"/>
<rect x="420" y="100" width="40" height="40" fill="#5FA855" stroke="#1A1A2E" stroke-width="2"/>
</g>
<rect x="470" y="168" width="14" height="48" fill="#8B6914" stroke="#1A1A2E" stroke-width="2" transform="rotate(-35 477 192)"/>
<polygon points="470,168 490,148 510,168" fill="#888" stroke="#1A1A2E" stroke-width="2" transform="rotate(-35 490 158)"/>
<text x="40" y="52" font-family="Arial,sans-serif" font-size="38" font-weight="900" fill="#fff" stroke="#1A1A2E" stroke-width="2">SLOPCRAFT</text>
<text x="40" y="320" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#1A1A2E">voxel sandbox</text>
</svg>`)}`,
};
