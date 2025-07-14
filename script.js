window.onload = function() {
    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');
    
    // --- 사운드 시스템 ---
    let audioCtx;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) { console.error("Web Audio API is not supported in this browser"); }
    const soundManager = {
        sounds: {}, musicSource: null, loopingSounds: {}, isMusicPlaying: false, isMuted: false,
        loadSounds: async function(soundList) { if (!audioCtx) return; const promises = Object.entries(soundList).map(async ([key, url]) => { try { const response = await fetch(url); if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for ${url}`); const audioBuffer = await audioCtx.decodeAudioData(await response.arrayBuffer()); this.sounds[key] = audioBuffer; } catch (error) { console.error(`Error loading sound: ${key} from ${url}`, error); } }); await Promise.all(promises); },
        playSound: function(key) { if (this.isMuted || !this.sounds[key] || !audioCtx || audioCtx.state === 'suspended') return; const source = audioCtx.createBufferSource(); source.buffer = this.sounds[key]; source.connect(audioCtx.destination); source.start(0); },
        playMusic: function(key) { if (!audioCtx || !this.sounds[key] || this.isMusicPlaying) return; if (audioCtx.state === 'suspended') { console.warn('AudioContext is suspended. Cannot play music yet.'); return; } this.stopMusic(); this.musicSource = audioCtx.createBufferSource(); this.musicSource.buffer = this.sounds[key]; this.musicSource.loop = true; this.musicSource.connect(audioCtx.destination); this.musicSource.start(0); this.isMusicPlaying = true; },
        stopMusic: function() { if (this.musicSource) { this.musicSource.stop(); this.musicSource = null; this.isMusicPlaying = false; } },
        startLoop: function(key) { if (this.isMuted || !this.sounds[key] || this.loopingSounds[key] || !audioCtx || audioCtx.state === 'suspended') return; const source = audioCtx.createBufferSource(); source.buffer = this.sounds[key]; source.loop = true; source.connect(audioCtx.destination); source.start(0); this.loopingSounds[key] = source; },
        stopLoop: function(key) { if (this.loopingSounds[key]) { this.loopingSounds[key].stop(); delete this.loopingSounds[key]; } },
        muteFX: function(isMuted) { this.isMuted = isMuted; }
    };
    
    // --- 게임 변수 ---
    let width, height, viewWidth, viewHeight;
    let isGameActive = false; // 게임 활성화 상태 (가장 중요)
    const CAMERA_ZOOM = 1.5;
    ctx.imageSmoothingEnabled = false;
    
    // ### 수정: 속도 및 게임 밸런스 값 조정 ###
    const BASE_GRAVITY = 1.0;
    const BASE_JUMP_FORCE = -18;
    const BASE_PLAYER_ACCEL = 1.0; // 너무 빨라서 1.0으로 수정
    const BASE_FRICTION = 0.90;
    const BASE_MAX_SPEED = 8;
    
    let GRAVITY = BASE_GRAVITY, PLAYER_ACCEL = BASE_PLAYER_ACCEL, FRICTION = BASE_FRICTION, MAX_SPEED = BASE_MAX_SPEED;
    const PLAYER_TEXTURE_SIZE = 128, PORTAL_BORDER_SIZE = 16, STAGE_RESET_DELAY = 3000, SPAWN_CHECK_INTERVAL = 4000;
    const MAX_ICE_COINS = 3, MAX_RAINBOW_COINS = 1, MAX_RED_COINS = 2, MAX_GAMBLE_COINS = 1, RAINBOW_PLATFORM_CHANCE = 0.0375;
    let coyoteTimeCounter = 0, jumpBufferTime = 0;
    const COYOTE_TIME_DURATION = 100, JUMP_BUFFER_DURATION = 150;

    const player = {
        worldX: 200, worldY: 0, dx: 0, dy: 0, radius: 24, onGround: false,
        rotationAngle: 0, initialX: 200, initialY: 0,
        isFrozen: false, freezeEndTime: 0,
        isBoosted: false, boostEndTime: 0,
        controlsInverted: false, invertEndTime: 0,
        standingOnPlatform: null, isDead: false,
    };

    const camera = { x: 0, y: 0 };
    let worldObjects = [], portal = null, iceCoins = [], rainbowCoins = [], redCoins = [], gambleCoins = [];
    let hostileProjectiles = [], attackEvents = [], rockets = [], particles = [];
    let spawnCheckTimer = null, highestX = 0, currentMapSeed = 0;
    let currentStage = 1, gameCleared = false, fireworksLaunched = false;
    const bgCanvas = document.createElement('canvas'), bgCtx = bgCanvas.getContext('2d');
    let bgPattern;
    const playerTextureCanvas = document.createElement('canvas'), pTextureCtx = playerTextureCanvas.getContext('2d');
    playerTextureCanvas.width = PLAYER_TEXTURE_SIZE; playerTextureCanvas.height = PLAYER_TEXTURE_SIZE;
    let portalBorderCanvas, portalNoiseMaskCanvas, portalCompositeCanvas;
    const keys = {}, jumpButton = {}, leftButton = {}, rightButton = {}, resetButton = {};
    let isTouchingLeft = false, isTouchingRight = false;
    
    function updateControlButtonsPosition() { jumpButton.x = width - 90; jumpButton.y = height - 90; jumpButton.radius = 50; leftButton.x = 90; leftButton.y = height - 90; leftButton.radius = 40; rightButton.x = leftButton.x + leftButton.radius * 2 + 20; rightButton.y = height - 90; rightButton.radius = 40; resetButton.x = width - 40; resetButton.y = 40; }
    function handleTouches(e) { e.preventDefault(); if (!isGameActive) return; if (e.type === 'touchstart') { for (let i = 0; i < e.changedTouches.length; i++) { const touch = e.changedTouches[i]; if (Math.sqrt((touch.clientX - jumpButton.x)**2 + (touch.clientY - jumpButton.y)**2) < jumpButton.radius) handleJumpInput(); if (Math.sqrt((touch.clientX - resetButton.x)**2 + (touch.clientY - resetButton.y)**2) < resetButton.radius) resetGame(); } } isTouchingLeft = false; isTouchingRight = false; for (let i = 0; i < e.touches.length; i++) { const touch = e.touches[i]; if (Math.sqrt((touch.clientX - leftButton.x)**2 + (touch.clientY - leftButton.y)**2) < leftButton.radius) isTouchingLeft = true; if (Math.sqrt((touch.clientX - rightButton.x)**2 + (touch.clientY - rightButton.y)**2) < rightButton.radius) isTouchingRight = true; } }
    window.addEventListener('keydown', (e) => { const code = e.code.toLowerCase(); if (!keys[code] && (code === 'keyw' || code === 'arrowup' || code === 'space')) handleJumpInput(); keys[code] = true; });
    window.addEventListener('keyup', (e) => { keys[e.code.toLowerCase()] = false; });
    window.addEventListener('touchstart', handleTouches, { passive: false }); window.addEventListener('touchmove', handleTouches, { passive: false }); window.addEventListener('touchend', handleTouches, { passive: false });
    window.addEventListener('click', (e) => { if (isGameActive && !gameCleared && Math.sqrt((e.clientX - resetButton.x)**2 + (e.clientY - resetButton.y)**2) < resetButton.radius) resetGame(); });
    function getStaticNoiseValue(x, y) { let seed = Math.floor(x) * 1357 + Math.floor(y) * 2468; let t = seed += 1831565813; t = Math.imul(t ^ t >>> 15, 1 | t); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) % 2 === 0 ? 0 : 255; }
    function createSeededRandom(seed) { return function() { seed = Math.imul(1664525, seed) + 1013904223; let t = seed; t = Math.imul(t ^ t >>> 15, 1 | t); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); t = (t ^ t >>> 14) >>> 0; return t / 4294967296; } }
    function createPlayerTexture() { const iD = pTextureCtx.createImageData(PLAYER_TEXTURE_SIZE, PLAYER_TEXTURE_SIZE); const d = iD.data; for (let i = 0; i < d.length; i+=4) { const s = Math.random() < 0.5 ? 0 : 255; d[i]=s; d[i+1]=s; d[i+2]=s; d[i+3]=255; } pTextureCtx.putImageData(iD, 0, 0); }
    function createBackgroundPattern() { const pS = 1024; bgCanvas.width=pS; bgCanvas.height=pS; const iD=bgCtx.createImageData(pS, pS); const d = iD.data; for(let i=0; i<d.length; i+=4) { const s = getStaticNoiseValue(i%pS, Math.floor(i/pS)); d[i]=s; d[i+1]=s; d[i+2]=s; d[i+3]=255; } bgCtx.putImageData(iD, 0, 0); bgPattern = ctx.createPattern(bgCanvas, 'repeat'); }
    function handleJumpInput() { if (!isGameActive) return; jumpBufferTime = Date.now(); }

    function updatePlayer(time) {
        if (gameCleared || player.isDead) return;
        if (player.controlsInverted && time > player.invertEndTime) player.controlsInverted = false;
        let currentJumpForce = BASE_JUMP_FORCE; PLAYER_ACCEL = BASE_PLAYER_ACCEL; MAX_SPEED = BASE_MAX_SPEED;
        if (player.isFrozen) { if (time > player.freezeEndTime) player.isFrozen = false; return; }
        if (player.isBoosted) { if (time > player.boostEndTime) { player.isBoosted = false; } else { MAX_SPEED = BASE_MAX_SPEED * 1.5; currentJumpForce = BASE_JUMP_FORCE * 1.5; } }
        const onRainbowPlatform = player.onGround && player.standingOnPlatform && player.standingOnPlatform.type === 'rainbow';
        if (onRainbowPlatform) { PLAYER_ACCEL = BASE_PLAYER_ACCEL * 1.5; MAX_SPEED = BASE_MAX_SPEED * 1.5; }
        const moveLeft = keys['keya'] || keys['arrowleft'] || isTouchingLeft;
        const moveRight = keys['keyd'] || keys['arrowright'] || isTouchingRight;
        if (player.controlsInverted) { if (moveLeft) player.dx += PLAYER_ACCEL; if (moveRight) player.dx -= PLAYER_ACCEL; } else { if (moveLeft) player.dx -= PLAYER_ACCEL; if (moveRight) player.dx += PLAYER_ACCEL; }
        const jumpBufferValid = Date.now() - jumpBufferTime < JUMP_BUFFER_DURATION;
        const coyoteTimeValid = Date.now() - coyoteTimeCounter < COYOTE_TIME_DURATION;
        if (jumpBufferValid && coyoteTimeValid) {
            const isOnRainbow = player.standingOnPlatform && player.standingOnPlatform.type === 'rainbow';
            if (isOnRainbow) { soundManager.playSound('super_jump'); player.dy = BASE_JUMP_FORCE * 2.0; } // 슈퍼점프 강화
            else { soundManager.playSound('jump'); player.dy = currentJumpForce; }
            jumpBufferTime = 0; coyoteTimeCounter = 0;
        }
        player.dx *= FRICTION; if (Math.abs(player.dx) < 0.1) player.dx = 0; if (Math.abs(player.dx) > MAX_SPEED) player.dx = Math.sign(player.dx) * MAX_SPEED; if (!player.onGround) player.dy += GRAVITY;
        const physicalObjects = worldObjects.filter(o => o.isPhysical);
        const lastPlayerY = player.worldY;
        player.worldX += player.dx;
        for (const p of physicalObjects) { if (checkPlatformCollision(player, p)) { if (player.dx > 0) player.worldX = p.worldX - player.radius; else if (player.dx < 0) player.worldX = p.worldX + p.width + player.radius; player.dx = 0; } }
        player.onGround = false; player.standingOnPlatform = null;
        player.worldY += player.dy;
        for (const p of physicalObjects) { if (checkPlatformCollision(player, p)) { if (player.dy >= 0 && lastPlayerY + player.radius <= p.worldY + 1) { player.worldY = p.worldY - player.radius; player.dy = 0; player.onGround = true; player.standingOnPlatform = p; coyoteTimeCounter = Date.now(); } else if (player.dy < 0) { player.worldY = p.worldY + p.height + player.radius; player.dy = 0; } } }
        if (player.onGround) { coyoteTimeCounter = Date.now(); }
        for (const coin of iceCoins) { if (coin.active) { if ((player.worldX - coin.worldX)**2 + (player.worldY - coin.worldY)**2 < (player.radius + coin.radius)**2) { coin.active = false; player.isFrozen = true; player.freezeEndTime = time + 2000; player.dx = 0; player.dy = 0; soundManager.playSound('freeze'); } } }
        for (const coin of rainbowCoins) { if (coin.active) { if ((player.worldX - coin.worldX)**2 + (player.worldY - coin.worldY)**2 < (player.radius + coin.radius)**2) { coin.active = false; player.isBoosted = true; player.boostEndTime = time + 5000; soundManager.playSound('boost'); } } }
        for (const coin of redCoins) { if (coin.active) { if ((player.worldX - coin.worldX)**2 + (player.worldY - coin.worldY)**2 < (player.radius + coin.radius)**2) { coin.active = false; soundManager.playSound('alert'); const newAttackEvent = { count: 10, nextSpawnTime: time + 2000, loopSound: 'danger_loop' }; setTimeout(() => { if (!player.isDead && attackEvents.includes(newAttackEvent)) { soundManager.startLoop(newAttackEvent.loopSound); } }, 2000); attackEvents.push(newAttackEvent); } } }
        for (const coin of gambleCoins) { if (coin.active) { if ((player.worldX - coin.worldX)**2 + (player.worldY - coin.worldY)**2 < (player.radius + coin.radius)**2) { coin.active = false; soundManager.playSound('gamble'); const effect = Math.floor(Math.random() * 3); setTimeout(() => { if (player.isDead) return; switch (effect) { case 0: player.isBoosted = true; player.boostEndTime = time + 5000; soundManager.playSound('boost'); break; case 1: player.controlsInverted = true; player.invertEndTime = time + 5000; soundManager.playSound('invert'); break; case 2: hostileProjectiles = []; createExplosion(player.worldX - camera.x + viewWidth / 2, player.worldY - camera.y + viewHeight/2, 60); soundManager.playSound('hit'); break; } }, 100); } } }
        if (portal && !gameCleared) { if (checkPlatformCollision(player, portal)) clearGame(); }
        player.rotationAngle += player.dx * 0.02; if (player.worldX > highestX) highestX = player.worldX;
        if (player.worldY > viewHeight / 2 + height + 800) { if (!gameCleared) { player.isDead = true; soundManager.playSound('hit'); soundManager.muteFX(true); attackEvents.forEach(e => soundManager.stopLoop(e.loopSound)); attackEvents = []; setTimeout(() => { init(currentStage, false); }, 500); } }
    }
    function checkPlatformCollision(p, plat) { const cX = Math.max(plat.worldX, Math.min(p.worldX, plat.worldX + plat.width)); const cY = Math.max(plat.worldY, Math.min(p.worldY, plat.worldY + plat.height)); return ((p.worldX - cX)**2 + (p.worldY - cY)**2) < (p.radius**2); }
    function resetPlayer() { highestX = 0; player.worldX = player.initialX; player.worldY = player.initialY; player.dx = 0; player.dy = 0; player.isFrozen = false; player.freezeEndTime = 0; player.isBoosted = false; player.boostEndTime = 0; player.controlsInverted = false; player.invertEndTime = 0; player.standingOnPlatform = null; player.isDead = false; jumpBufferTime = 0; coyoteTimeCounter = 0; soundManager.muteFX(false); }
    function renderWorld(time) { ctx.save(); const scaledViewWidth = viewWidth; const scaledViewHeight = viewHeight; ctx.translate(-(camera.x * 0.2) % 1024, -(camera.y * 0.2) % 1024); ctx.fillStyle = bgPattern; ctx.fillRect((camera.x * 0.2) % 1024, (camera.y * 0.2) % 1024, scaledViewWidth + 1024, scaledViewHeight + 1024); ctx.restore(); const physicalObjects = worldObjects.filter(o => o.isPhysical); physicalObjects.forEach(obj => { const screenX = Math.floor(obj.worldX - camera.x); const screenY = Math.floor(obj.worldY - camera.y); if (screenX + obj.width < 0 || screenX > scaledViewWidth || screenY + obj.height < 0 || screenY > scaledViewHeight) return; if (obj.type === 'rainbow') { const gradient = ctx.createRadialGradient(screenX + obj.width / 2, screenY + obj.height / 2, 0, screenX + obj.width / 2, screenY + obj.height / 2, obj.width * 0.8); const hue = (time / 20) % 360; gradient.addColorStop(0, `hsla(${hue}, 85%, 75%, 0.8)`); gradient.addColorStop(0.5, `hsla(${(hue + 120) % 360}, 85%, 75%, 0.5)`); gradient.addColorStop(1, `hsla(${(hue + 240) % 360}, 85%, 75%, 0.2)`); ctx.fillStyle = gradient; ctx.fillRect(screenX, screenY, obj.width, obj.height); } else { ctx.save(); ctx.beginPath(); ctx.rect(screenX, screenY, obj.width, obj.height); ctx.clip(); ctx.translate(-(camera.x % 1024), -(camera.y % 1024)); ctx.fillStyle = bgPattern; ctx.fillRect(camera.x % 1024, camera.y % 1024, scaledViewWidth + 1024, scaledViewHeight + 1024); ctx.restore(); } }); }
    function createPortalAssets() { if (!portal) return; const outerWidth = portal.width + PORTAL_BORDER_SIZE * 2; const outerHeight = portal.height + PORTAL_BORDER_SIZE * 2; portalBorderCanvas = document.createElement('canvas'); portalBorderCanvas.width = outerWidth; portalBorderCanvas.height = outerHeight; const borderCtx = portalBorderCanvas.getContext('2d'); for(let y=0; y<outerHeight; y++) for(let x=0; x<outerWidth; x++) if (x<PORTAL_BORDER_SIZE || x>=outerWidth-PORTAL_BORDER_SIZE || y<PORTAL_BORDER_SIZE || y>=outerHeight-PORTAL_BORDER_SIZE) if(getStaticNoiseValue(x,y)>128) { const lightness=15+Math.random()*15; borderCtx.fillStyle=`hsl(0, 75%, ${lightness}%)`; borderCtx.fillRect(x,y,1,1); } portalNoiseMaskCanvas = document.createElement('canvas'); portalNoiseMaskCanvas.width = portal.width; portalNoiseMaskCanvas.height = portal.height; const maskCtx = portalNoiseMaskCanvas.getContext('2d'); for (let y=0; y<portal.height; y++) for (let x=0; x<portal.width; x++) if(getStaticNoiseValue(x,y)>128) { maskCtx.fillStyle='black'; maskCtx.fillRect(x,y,1,1); } portalCompositeCanvas = document.createElement('canvas'); portalCompositeCanvas.width = outerWidth; portalCompositeCanvas.height = outerHeight; }
    function drawPortal(time) { if (!portal || !portalCompositeCanvas) return; const pCtx = portalCompositeCanvas.getContext('2d'); const outerWidth = portalCompositeCanvas.width; const outerHeight = portalCompositeCanvas.height; pCtx.clearRect(0, 0, outerWidth, outerHeight); const gradient = pCtx.createLinearGradient(0, PORTAL_BORDER_SIZE, 0, PORTAL_BORDER_SIZE + portal.height); const hue = (time / 20) % 360; gradient.addColorStop(0, `hsla(${hue}, 80%, 40%, 0.8)`); gradient.addColorStop(1, `hsla(${(hue + 40) % 360}, 80%, 40%, 0.8)`); pCtx.fillStyle = gradient; pCtx.fillRect(PORTAL_BORDER_SIZE, PORTAL_BORDER_SIZE, portal.width, portal.height); pCtx.globalCompositeOperation = 'destination-in'; pCtx.drawImage(portalNoiseMaskCanvas, PORTAL_BORDER_SIZE, PORTAL_BORDER_SIZE); pCtx.globalCompositeOperation = 'source-over'; pCtx.drawImage(portalBorderCanvas, 0, 0); const screenX = Math.floor(portal.worldX - camera.x); const screenY = Math.floor(portal.worldY - camera.y); ctx.drawImage(portalCompositeCanvas, screenX - PORTAL_BORDER_SIZE, screenY - PORTAL_BORDER_SIZE); }
    function updateCoins() { [...iceCoins, ...rainbowCoins, ...redCoins, ...gambleCoins].forEach(coin => { if (coin.active) { coin.worldX += coin.dx; coin.worldY += coin.dy; const screenLeft = camera.x + coin.radius; const screenRight = camera.x + viewWidth - coin.radius; const screenTop = camera.y + coin.radius; const screenBottom = camera.y + viewHeight - coin.radius; if (coin.worldX < screenLeft || coin.worldX > screenRight) { coin.dx *= -1; coin.worldX = Math.max(screenLeft, Math.min(coin.worldX, screenRight)); } if (coin.worldY < screenTop || coin.worldY > screenBottom) { coin.dy *= -1; coin.worldY = Math.max(screenTop, Math.min(coin.worldY, screenBottom)); } } }); }
    function drawCoins(time) { ctx.save(); iceCoins.forEach(coin => { if (coin.active) { const screenX = coin.worldX - camera.x; const screenY = coin.worldY - camera.y; ctx.fillStyle = 'black'; ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(screenX, screenY, coin.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; ctx.beginPath(); ctx.arc(screenX - coin.radius * 0.3, screenY - coin.radius * 0.3, coin.radius * 0.3, 0, Math.PI * 2); ctx.fill(); } }); rainbowCoins.forEach(coin => { if (coin.active) { const screenX = coin.worldX - camera.x; const screenY = coin.worldY - camera.y; const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, coin.radius); const hue = (time / 10) % 360; gradient.addColorStop(0, `hsl(${hue}, 100%, 70%)`); gradient.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 100%, 70%)`); gradient.addColorStop(1, `hsl(${(hue + 240) % 360}, 100%, 70%)`); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(screenX, screenY, coin.radius, 0, Math.PI * 2); ctx.fill(); } }); redCoins.forEach(coin => { if (coin.active) { const screenX = coin.worldX - camera.x; const screenY = coin.worldY - camera.y; ctx.fillStyle = 'red'; ctx.strokeStyle = '#800000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(screenX, screenY, coin.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } }); gambleCoins.forEach(coin => { if(coin.active) { const screenX = coin.worldX - camera.x; const screenY = coin.worldY - camera.y; ctx.fillStyle = 'white'; ctx.strokeStyle = '#888'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(screenX, screenY, coin.radius, 0, Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'black'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', screenX, screenY); } }); ctx.restore(); }
    function updateAttackEvents(time) { for (let i = attackEvents.length - 1; i >= 0; i--) { const event = attackEvents[i]; if (event.count > 0 && time >= event.nextSpawnTime) { event.count--; event.nextSpawnTime = time + 1500; hostileProjectiles.push({ worldX: player.worldX, worldY: camera.y - 30, dx: 0, dy: 5, radius: 8, life: 400 }); } if (event.count <= 0) { soundManager.stopLoop(event.loopSound); attackEvents.splice(i, 1); } } }
    function updateProjectiles() { const projectileSpeedMultiplier = 1 + (currentStage - 1) * 0.08; for (let i = hostileProjectiles.length - 1; i >= 0; i--) { const p = hostileProjectiles[i]; p.life--; if (p.life <= 0) { hostileProjectiles.splice(i, 1); continue; } p.dy += 0.2; const dirX = player.worldX - p.worldX; const dirY = player.worldY - p.worldY; const dist = Math.sqrt(dirX * dirX + dirY * dirY); if (dist > 1) { p.dx += (dirX / dist) * 0.225 * projectileSpeedMultiplier; if (dirY > 0) { p.dy += (dirY / dist) * 0.1125 * projectileSpeedMultiplier; } } const speed = Math.sqrt(p.dx * p.dx + p.dy * p.dy); const maxSpeed = 15 * projectileSpeedMultiplier; if (speed > maxSpeed) { p.dx = (p.dx / speed) * maxSpeed; p.dy = (p.dy / speed) * maxSpeed; } p.worldX += p.dx; p.worldY += p.dy; const distSqToPlayer = (player.worldX - p.worldX)**2 + (player.worldY - p.worldY)**2; if (!player.isDead && distSqToPlayer < (player.radius + p.radius)**2) { player.isDead = true; soundManager.playSound('hit'); soundManager.muteFX(true); attackEvents.forEach(e => soundManager.stopLoop(e.loopSound)); attackEvents = []; createExplosion(viewWidth / 2, viewHeight / 2, 0); setTimeout(() => { init(currentStage, false); }, 500); return; } } }
    function drawProjectiles(time) { ctx.save(); hostileProjectiles.forEach(p => { const screenX = p.worldX - camera.x; const screenY = p.worldY - camera.y; const radius = p.radius + Math.sin(time / 50) * 2; const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, radius); gradient.addColorStop(0, 'white'); gradient.addColorStop(0.4, 'yellow'); gradient.addColorStop(1, 'rgba(255, 0, 0, 0.7)'); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(screenX, screenY, radius, 0, Math.PI * 2); ctx.fill(); }); ctx.restore(); }
    function drawPlayer(time) { if (player.isDead) return; const screenX = viewWidth / 2, screenY = viewHeight / 2; ctx.save(); if (player.onGround && player.standingOnPlatform && player.standingOnPlatform.type === 'rainbow') { const auraRadius = player.radius + 12 + Math.sin(time / 80) * 5; const gradient = ctx.createRadialGradient(screenX, screenY, player.radius, screenX, screenY, auraRadius); const hue = (time / 10) % 360; gradient.addColorStop(0, `hsla(${hue}, 100%, 80%, 0.7)`); gradient.addColorStop(0.5, `hsla(${(hue + 180) % 360}, 100%, 80%, 0.4)`); gradient.addColorStop(1, `hsla(${(hue + 180) % 360}, 100%, 80%, 0)`); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(screenX, screenY, auraRadius, 0, 2 * Math.PI); ctx.fill(); } else if (player.isBoosted) { const auraRadius = player.radius + 8 + Math.sin(time / 100) * 3; const gradient = ctx.createRadialGradient(screenX, screenY, player.radius, screenX, screenY, auraRadius); const hue = (time / 15) % 360; gradient.addColorStop(0, `hsla(${hue}, 90%, 70%, 0.5)`); gradient.addColorStop(1, `hsla(${(hue + 60) % 360}, 90%, 70%, 0)`); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(screenX, screenY, auraRadius, 0, 2 * Math.PI); ctx.fill(); } if (player.isFrozen) { ctx.fillStyle = 'black'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(screenX, screenY, player.radius, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); } else { ctx.beginPath(); ctx.arc(screenX, screenY, player.radius, 0, 2 * Math.PI); ctx.clip(); ctx.translate(screenX, screenY); ctx.rotate(player.rotationAngle); ctx.drawImage(playerTextureCanvas, -player.radius, -player.radius, player.radius * 2, player.radius * 2); } ctx.restore(); }
    function clearGame() { if(gameCleared) return; gameCleared = true; soundManager.playSound('clear'); attackEvents.forEach(e => soundManager.stopLoop(e.loopSound)); attackEvents = []; const nextStage = currentStage + 1; const savedHighestStage = parseInt(localStorage.getItem('highestStage')) || 1; if (nextStage > savedHighestStage) { localStorage.setItem('highestStage', nextStage); } setTimeout(() => { init(nextStage, true); }, STAGE_RESET_DELAY); }
    function launchFireworks() { const numRockets = 12; for (let i = 0; i < numRockets; i++) { setTimeout(() => { rockets.push({ x: Math.random() * width, y: height, dx: Math.random() * 6 - 3, dy: -(Math.random() * 8 + 15), targetY: Math.random() * (height / 2.5), hue: Math.random() * 360 }); }, i * 150); } }
    function createExplosion(x, y, hue) { const particleCount = 40 + Math.random() * 20; for (let i = 0; i < particleCount; i++) { const angle = Math.random() * Math.PI * 2; const speed = Math.random() * 12 + 4; particles.push({ x: x, y: y, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, life: Math.random() * 60 + 60, size: Math.random() * 5 + 4, hue: hue + (Math.random() * 60 - 30) }); } }
    function updateAndDrawClearEffects() { if (!fireworksLaunched) { launchFireworks(); fireworksLaunched = true; } for (let i = rockets.length - 1; i >= 0; i--) { const r = rockets[i]; r.x += r.dx; r.y += r.dy; r.dy += 0.2; ctx.fillStyle = `hsl(${r.hue}, 100%, 75%)`; ctx.beginPath(); ctx.arc(r.x, r.y, 3, 0, Math.PI * 2); ctx.fill(); if (r.y <= r.targetY) { createExplosion(r.x, r.y, r.hue); soundManager.playSound('firework'); rockets.splice(i, 1); } } let lastCompositeOperation = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.dx; p.y += p.dy; p.dy += GRAVITY * 0.08; p.dx *= 0.98; p.life--; if (p.life <= 0) { particles.splice(i, 1); continue; } ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${p.life / 90})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); } ctx.globalCompositeOperation = lastCompositeOperation; ctx.font = 'bold 70px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'white'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 8; ctx.strokeText('NEXT STAGE', width / 2, height / 2); ctx.fillText('NEXT STAGE', width / 2, height / 2); }
    function drawStageUI() { const cX = width / 2; const cY = 25; const bW = 160; const bH = 50; const mW = 110; const mH = 40; const wR = 8 * (currentStage - 1); const hR = 2 * (currentStage - 1); const uW = Math.max(mW, bW - wR); const uH = Math.max(mH, bH - hR); ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 2; ctx.fillRect(cX - uW / 2, cY - uH / 2, uW, uH); ctx.strokeRect(cX - uW / 2, cY - uH / 2, uW, uH); ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('STAGE ' + currentStage, cX, cY); }
    function drawResetButton() { const r = resetButton; ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r.x, r.y, r.radius * 0.6, Math.PI * 0.3, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.moveTo(r.x + r.radius * 0.6 * Math.cos(Math.PI * 0.3), r.y + r.radius * 0.6 * Math.sin(Math.PI * 0.3)); ctx.lineTo(r.x + r.radius * 0.6 * Math.cos(Math.PI * 0.3) + 8, r.y + r.radius * 0.6 * Math.sin(Math.PI * 0.3) - 8); ctx.lineTo(r.x + r.radius * 0.6 * Math.cos(Math.PI * 0.3) + 8, r.y + r.radius * 0.6 * Math.sin(Math.PI * 0.3) + 2); ctx.stroke(); }
    function drawControlButtons() { const bS = 'rgba(255, 255, 255, 0.35)'; const brS = 'rgba(255, 255, 255, 0.7)'; const iS = 'rgba(255, 255, 255, 0.9)'; ctx.lineWidth = 2; ctx.fillStyle = bS; ctx.strokeStyle = brS; ctx.beginPath(); ctx.arc(jumpButton.x, jumpButton.y, jumpButton.radius, 0, 2*Math.PI); ctx.fill(); ctx.stroke(); ctx.fillStyle = iS; ctx.beginPath(); ctx.moveTo(jumpButton.x, jumpButton.y-jumpButton.radius*0.4); ctx.lineTo(jumpButton.x-jumpButton.radius*0.5, jumpButton.y+jumpButton.radius*0.3); ctx.lineTo(jumpButton.x+jumpButton.radius*0.5, jumpButton.y+jumpButton.radius*0.3); ctx.closePath(); ctx.fill(); ctx.fillStyle = bS; ctx.strokeStyle = brS; ctx.beginPath(); ctx.arc(leftButton.x, leftButton.y, leftButton.radius, 0, 2*Math.PI); ctx.fill(); ctx.stroke(); ctx.fillStyle = iS; ctx.beginPath(); ctx.moveTo(leftButton.x-leftButton.radius*0.4, leftButton.y); ctx.lineTo(leftButton.x+leftButton.radius*0.4, leftButton.y-leftButton.radius*0.5); ctx.lineTo(leftButton.x+leftButton.radius*0.4, leftButton.y+leftButton.radius*0.5); ctx.closePath(); ctx.fill(); ctx.fillStyle = bS; ctx.strokeStyle = brS; ctx.beginPath(); ctx.arc(rightButton.x, rightButton.y, rightButton.radius, 0, 2*Math.PI); ctx.fill(); ctx.stroke(); ctx.fillStyle = iS; ctx.beginPath(); ctx.moveTo(rightButton.x+rightButton.radius*0.4, rightButton.y); ctx.lineTo(rightButton.x-rightButton.radius*0.4, rightButton.y-rightButton.radius*0.5); ctx.lineTo(rightButton.x-rightButton.radius*0.4, rightButton.y+rightButton.radius*0.5); ctx.closePath(); ctx.fill(); }

    function animate(time) {
        if (!isGameActive) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0,0,width,height);
            ctx.font = 'bold 24px sans-serif';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.fillText('Touch to Start', width / 2, height / 2);
            requestAnimationFrame(animate);
            return;
        }

        updatePlayer(time); updateCoins(); updateAttackEvents(time); updateProjectiles();
        camera.x = player.worldX - (viewWidth / 2); camera.y = player.worldY - (viewHeight / 2);
        ctx.save(); ctx.scale(1 / CAMERA_ZOOM, 1 / CAMERA_ZOOM);
        renderWorld(time);
        if(!player.isDead) drawPlayer(time); // 플레이어는 죽었을때 안그림
        drawPortal(time); drawCoins(time); drawProjectiles(time);
        ctx.restore(); 
        if (!gameCleared) { 
            drawControlButtons(); 
            drawStageUI(); 
            drawResetButton(); // 리셋 버튼 다시 그리기
        }
        if (gameCleared) { updateAndDrawClearEffects(); }
        requestAnimationFrame(animate);
    }
    
    function spawnManager() { if (currentStage >= 1 && rainbowCoins.filter(c => c.active).length < MAX_RAINBOW_COINS) { if (Math.random() < 0.05) generateCoin('rainbow'); } if (currentStage >= 3 && iceCoins.filter(c => c.active).length < MAX_ICE_COINS) { const chance = Math.min(0.5, 0.10 + (currentStage - 3) * 0.02); if (Math.random() < chance) generateCoin('ice'); } if (currentStage >= 5 && redCoins.filter(c => c.active).length < MAX_RED_COINS) { const chance = Math.min(0.6, 0.15 + (currentStage - 5) * 0.025); if (Math.random() < chance) generateCoin('red'); } if (currentStage >= 8 && gambleCoins.filter(c => c.active).length < MAX_GAMBLE_COINS) { const chance = Math.min(0.5, 0.10 + (currentStage - 3) * 0.02); if (Math.random() < chance) generateCoin('gamble'); } }
    
    function generateCoin(type) { 
        // ### 수정: 코인 속도 하향 조정 ###
        const stageSpeedMultiplier = 1 + (currentStage - 1) * 0.05; // 속도 증가폭 완화
        const baseSpeedX = 2.8; // 기본 속도 하향
        const baseSpeedY = 1.4; // 기본 속도 하향
        let dx = (Math.random() - 0.5) * baseSpeedX * stageSpeedMultiplier; 
        let dy = (Math.random() - 0.5) * baseSpeedY * stageSpeedMultiplier; 
        const newCoin = { worldX: camera.x + Math.random() * viewWidth, worldY: camera.y + Math.random() * viewHeight, radius: 15, active: true, dx: dx, dy: dy }; 
        if (type === 'ice') iceCoins.push(newCoin); else if (type === 'rainbow') rainbowCoins.push(newCoin); else if (type === 'red') redCoins.push(newCoin); else if (type === 'gamble') gambleCoins.push(newCoin); 
    }

    function resetGame() { localStorage.removeItem('highestStage'); soundManager.stopMusic(); attackEvents.forEach(e => soundManager.stopLoop(e.loopSound)); attackEvents = []; init(1, true); }
    function loadProgress() { const savedStage = localStorage.getItem('highestStage'); return parseInt(savedStage, 10) || 1; }
    
    function init(stageLevel = 1, isFullReset = false) {
        currentStage = stageLevel;
        width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight;
        viewWidth = width * CAMERA_ZOOM; viewHeight = height * CAMERA_ZOOM;
        updateControlButtonsPosition();
        gameCleared = false; fireworksLaunched = false;
        rockets = []; particles = []; hostileProjectiles = [];
        
        if (isFullReset) {
            currentMapSeed = Date.now() + Math.random();
            iceCoins = []; rainbowCoins = []; redCoins = []; gambleCoins = [];
            attackEvents.forEach(e => soundManager.stopLoop(e.loopSound));
            attackEvents = [];
            soundManager.playMusic('bgm');
        }
        
        if (!spawnCheckTimer) { spawnCheckTimer = setInterval(spawnManager, SPAWN_CHECK_INTERVAL); }
        
        const platforms = [];
        const startPlatformY = viewHeight - 100;
        let currentX = -200; let prevY = startPlatformY;
        const startPlatformSegmentWidth = 100;
        for (let i = 0; i < 10; i++) { platforms.push({ worldX: currentX, worldY: prevY, width: startPlatformSegmentWidth, height: startPlatformSegmentWidth / 1.7, isPhysical: true }); currentX += startPlatformSegmentWidth; }
        
        const seededRandom = createSeededRandom(currentMapSeed);
        const s = stageLevel - 1;
        
        // ### 수정: 맵 생성 밸런스 조정 ###
        const platformCount = 10 + s * 5;
        const MIN_X_GAP_BASE = Math.min(250, 110 + s * 6);  // 증가폭 완화
        const MAX_X_GAP_BASE = Math.min(300, 160 + s * 8);  // 증가폭 완화
        const MAX_Y_CHANGE = 40 + s * 8;                    // 증가폭 완화

        const platformMaxWidth = Math.max(60, 200 - s * 10);
        const platformMinWidth = Math.max(40, 100 - s * 8);
        let previousPlatformWasRainbow = false; let makeNextPlatformWider = false;
        for (let i = 0; i < platformCount; i++) {
            let MIN_X_GAP = MIN_X_GAP_BASE, MAX_X_GAP = MAX_X_GAP_BASE;
            if (previousPlatformWasRainbow) { MIN_X_GAP *= 1.6; MAX_X_GAP *= 1.8; previousPlatformWasRainbow = false; }
            const xGap = MIN_X_GAP + seededRandom() * (MAX_X_GAP - MIN_X_GAP);
            const yChange = (seededRandom() - 0.45) * 2 * MAX_Y_CHANGE;
            let pW = platformMinWidth + seededRandom() * (platformMaxWidth - platformMinWidth);
            if (makeNextPlatformWider) { pW = Math.min(pW * 1.5, platformMaxWidth * 1.2); makeNextPlatformWider = false; }
            let pH = pW / 1.7; currentX += xGap; let newY = prevY + yChange;
            if (newY > viewHeight - pH - 20) newY = viewHeight - pH - 20; if (newY < 150) newY = 150;
            const newPlatform = { worldX: currentX, worldY: newY, width: pW, height: pH, isPhysical: true };
            if (i > 0 && !previousPlatformWasRainbow && seededRandom() < RAINBOW_PLATFORM_CHANCE) { newPlatform.type = 'rainbow'; previousPlatformWasRainbow = true; makeNextPlatformWider = true; }
            platforms.push(newPlatform);
            prevY = newY;
        }
        const portalX = currentX + MAX_X_GAP_BASE + 100;
        portal = { worldX: portalX, worldY: prevY - 150, width: 120, height: 300, isPhysical: false };
        worldObjects = [ { worldX: -100000, worldY: -10000, width: 200000, height: 20000, isPhysical: false }, ...platforms ];
        createPortalAssets();
        
        player.initialX = 150;
        player.initialY = startPlatformY - 150;
        resetPlayer();
    }
    
    const soundFiles = { jump: 'jump.mp3', super_jump: 'super_jump.mp3', hit: 'hit.mp3', boost: 'boost.mp3', freeze: 'freeze.mp3', alert: 'alert.dmp3', danger_loop: 'danger_loop.mp3', gamble: 'gamble.mp3', invert: 'invert.mp3', clear: 'clear.mp3', bgm: 'bgm.mp3', firework: 'firework.mp3' };

    async function preloader() {
        width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight;
        await soundManager.loadSounds(soundFiles);
        createPlayerTexture();
        createBackgroundPattern(); 
        window.addEventListener('resize', () => { if (isGameActive) init(currentStage, false); });
        requestAnimationFrame(animate);
    }

    // ### 수정: 게임 시작 로직 (오디오 안정성 해결) ###
    function initGame() {
        if (isGameActive || !audioCtx) return;
        
        // 오디오 컨텍스트 활성화 (가장 중요)
        audioCtx.resume().then(() => {
            console.log("AudioContext Resumed Successfully.");
            
            isGameActive = true;
            
            // 모든 초기화 및 게임 시작
            init(loadProgress(), true);
            
        }).catch(e => console.error("AudioContext resume failed:", e));
    }

    window.addEventListener('click', initGame, { once: true });
    window.addEventListener('touchstart', initGame, { once: true });

    preloader();
};