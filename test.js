document.addEventListener('DOMContentLoaded', () => {

    // ✨ 모든 파일 확장자를 .mp3로 변경했습니다.
    const soundFiles = {
        bgm: 'bgm.mp3',
        jump: 'jump.mp3',
        super_jump: 'super_jump.mp3',
        hit: 'hit.mp3',
        boost: 'boost.mp3',
        freeze: 'freeze.mp3',
        alert: 'alert.mp3',
        gamble: 'gamble.mp3',
        invert: 'invert.mp3',
        clear: 'clear.mp3'
    };

    const statusDiv = document.getElementById('status');
    const buttonContainer = document.getElementById('button-container');
    let audioCtx;
    const loadedSounds = {};
    let bgmSourceNode = null;

    // 1. 오디오 컨텍스트 초기화
    function initAudio() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                statusDiv.textContent = '오디오 컨텍스트가 생성되었습니다. 사운드 로딩 중...';
                loadAllSounds();
            } catch (e) {
                statusDiv.textContent = '오류: 이 브라우저는 Web Audio API를 지원하지 않습니다.';
                console.error("Web Audio API is not supported in this browser", e);
            }
        } else if (audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => {
                statusDiv.textContent = '오디오가 활성화되었습니다.';
            });
        }
        
        document.body.removeEventListener('click', initAudio);
        document.body.removeEventListener('touchstart', initAudio);
    }

    document.body.addEventListener('click', initAudio);
    document.body.addEventListener('touchstart', initAudio);

    // 2. 사운드 로딩
    async function loadAllSounds() {
        const promises = Object.entries(soundFiles).map(async ([key, url]) => {
            const button = document.getElementById(`btn-${key}`);
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                loadedSounds[key] = audioBuffer;
                button.classList.add('loaded');
                console.log(`✅ Sound loaded: ${key}`);
            } catch (error) {
                button.classList.add('error');
                console.error(`❌ Failed to load sound "${key}" from "${url}":`, error);
            }
        });
        await Promise.all(promises);
        statusDiv.textContent = '모든 사운드 로딩 완료. 버튼을 눌러 테스트하세요.';
    }

    // 3. BGM 재생/정지 토글 함수
    function toggleBGM(key) {
        if (!loadedSounds[key]) {
            console.warn(`BGM "${key}" is not loaded.`);
            return;
        }

        if (bgmSourceNode) {
            bgmSourceNode.stop();
            // onended 이벤트에서 null로 설정되므로 여기서 바로 할 필요 없음
            console.log(`⏹️ Stopped BGM: ${key}`);
        } else {
            bgmSourceNode = audioCtx.createBufferSource();
            bgmSourceNode.buffer = loadedSounds[key];
            bgmSourceNode.loop = true;
            bgmSourceNode.connect(audioCtx.destination);
            bgmSourceNode.start(0);
            
            bgmSourceNode.onended = () => {
                bgmSourceNode = null;
            };
            console.log(`▶️ Playing BGM: ${key}`);
        }
    }

    // 4. 효과음(SFX) 재생 함수
    function playSFX(key) {
        if (!loadedSounds[key]) {
            console.warn(`SFX "${key}" is not loaded.`);
            return;
        }

        const source = audioCtx.createBufferSource();
        source.buffer = loadedSounds[key];
        source.connect(audioCtx.destination);
        source.start(0);
        console.log(`🔊 Playing SFX: ${key}`);
    }

    // 5. 동적으로 버튼 생성 및 이벤트 연결
    for (const key in soundFiles) {
        const button = document.createElement('button');
        button.id = `btn-${key}`;
        button.textContent = key;
        
        button.addEventListener('click', (e) => {
            e.stopPropagation();

            if (!audioCtx || audioCtx.state !== 'running') {
                statusDiv.textContent = '오디오가 활성화되지 않았습니다. 화면을 먼저 클릭해주세요.';
                return;
            }
            
            if (key === 'bgm') {
                toggleBGM(key);
            } else {
                playSFX(key);
            }
        });
        
        buttonContainer.appendChild(button);
    }
});