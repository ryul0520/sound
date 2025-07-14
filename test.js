document.addEventListener('DOMContentLoaded', () => {

    const soundFiles = {
        bgm: 'sounds/bgm.mp3',
        jump: 'sounds/jump.wav',
        super_jump: 'sounds/super_jump.wav',
        hit: 'sounds/hit.wav',
        boost: 'sounds/boost.wav',
        freeze: 'sounds/freeze.wav',
        alert: 'sounds/alert.wav',
        gamble: 'sounds/gamble.wav',
        invert: 'sounds/invert.wav',
        clear: 'sounds/clear.wav'
    };

    const statusDiv = document.getElementById('status');
    const buttonContainer = document.getElementById('button-container');
    let audioCtx;
    const loadedSounds = {};

    // 1. 오디오 컨텍스트 초기화 및 사용자 상호작용 리스너
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
        
        // 첫 상호작용 후 리스너 제거
        document.body.removeEventListener('click', initAudio);
        document.body.removeEventListener('touchstart', initAudio);
    }

    document.body.addEventListener('click', initAudio);
    document.body.addEventListener('touchstart', initAudio);

    // 2. 사운드 로딩 함수
    async function loadAllSounds() {
        const promises = Object.entries(soundFiles).map(async ([key, url]) => {
            const button = document.getElementById(`btn-${key}`);
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                loadedSounds[key] = audioBuffer;
                button.classList.add('loaded'); // 로딩 성공 시 버튼 스타일 변경
                console.log(`Sound loaded: ${key}`);
            } catch (error) {
                button.classList.add('error'); // 로딩 실패 시 버튼 스타일 변경
                console.error(`Failed to load sound "${key}" from "${url}":`, error);
            }
        });

        await Promise.all(promises);
        statusDiv.textContent = '모든 사운드 로딩 시도 완료. 버튼을 눌러 테스트하세요.';
    }

    // 3. 사운드 재생 함수
    function playSound(key) {
        if (!loadedSounds[key]) {
            console.warn(`Sound "${key}" is not loaded.`);
            return;
        }
        if (!audioCtx || audioCtx.state !== 'running') {
            statusDiv.textContent = '오디오가 활성화되지 않았습니다. 화면을 먼저 클릭해주세요.';
            console.warn('AudioContext is not running. Please interact with the page first.');
            return;
        }

        const source = audioCtx.createBufferSource();
        source.buffer = loadedSounds[key];
        source.connect(audioCtx.destination);
        source.start(0);
    }

    // 4. 동적으로 버튼 생성
    for (const key in soundFiles) {
        const button = document.createElement('button');
        button.id = `btn-${key}`;
        button.textContent = key;
        button.addEventListener('click', (e) => {
            e.stopPropagation(); // body의 클릭 이벤트와 분리
            playSound(key);
        });
        buttonContainer.appendChild(button);
    }
});