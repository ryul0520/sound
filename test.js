document.addEventListener('DOMContentLoaded', () => {

    const soundFiles = {
        bgm: 'bgm.mp3',
        jump: 'jump.wav',
        super_jump: 'super_jump.wav',
        hit: 'hit.wav',
        boost: 'boost.wav',
        freeze: 'freeze.wav',
        alert: 'alert.wav',
        gamble: 'gamble.wav',
        invert: 'invert.wav',
        clear: 'clear.wav'
    };

    const statusDiv = document.getElementById('status');
    const buttonContainer = document.getElementById('button-container');
    let audioCtx;
    const loadedSounds = {};
    
    // ✨ BGM 전용 소스 노드를 저장할 변수
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
        // ... (이전 코드와 동일, 생략 가능)
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

    // 3. ✨ 수정된 사운드 재생 함수들 ✨

    // BGM 재생/정지 토글 함수
    function toggleBGM(key) {
        if (!loadedSounds[key]) {
            console.warn(`BGM "${key}" is not loaded.`);
            return;
        }

        if (bgmSourceNode) {
            // BGM이 재생 중이면 멈춤
            bgmSourceNode.stop();
            bgmSourceNode = null;
            console.log(`⏹️ Stopped BGM: ${key}`);
        } else {
            // BGM이 멈춰있으면 재생
            bgmSourceNode = audioCtx.createBufferSource();
            bgmSourceNode.buffer = loadedSounds[key];
            bgmSourceNode.loop = true;
            bgmSourceNode.connect(audioCtx.destination);
            bgmSourceNode.start(0);
            
            // BGM이 멈추면 (stop() 호출 시) bgmSourceNode를 null로 설정
            bgmSourceNode.onended = () => {
                bgmSourceNode = null;
            };
            console.log(`▶️ Playing BGM: ${key}`);
        }
    }

    // 효과음(SFX) 재생 함수 (누를 때마다 새로 재생)
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


    // 4. 동적으로 버튼 생성 및 이벤트 연결
    for (const key in soundFiles) {
        const button = document.createElement('button');
        button.id = `btn-${key}`;
        button.textContent = key;
        
        button.addEventListener('click', (e) => {
            e.stopPropagation();

            // 오디오 컨텍스트 활성화 확인
            if (!audioCtx || audioCtx.state !== 'running') {
                statusDiv.textContent = '오디오가 활성화되지 않았습니다. 화면을 먼저 클릭해주세요.';
                return;
            }
            
            // ✨ 키(key)에 따라 다른 함수를 호출
            if (key === 'bgm') {
                toggleBGM(key);
            } else {
                playSFX(key);
            }
        });
        
        buttonContainer.appendChild(button);
    }
});