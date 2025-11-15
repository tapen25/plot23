// === 1. グローバル変数の準備 ===
const playBtn = document.getElementById('playButton');
const slider = document.getElementById('speedSlider');
const speedDisplay = document.getElementById('speedDisplay');

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const baseAudioFile = 'kanon_1.10x.wav'; 
const baseSpeed = 1.10; 

let audioBuffer = null;
let sourceNode = null;
let isPlaying = false;

// === 2. 加速度センサー用の変数 ===
const motionBuffer = []; // {t: timestamp, m: magnitude}
const DURATION = 2000; // 2秒 (2000ms)
let targetActivity = 0.0; // センサーが検知した「揺れ」の目標値
let currentActivity = 0.0; // スムージング後の現在の「揺れ」
const SMOOTHING = 0.05; // スムージング係数 (小さいほど滑らか)
let motionListenerAttached = false; // センサー許可フラグ

// === 3. オーディオファイルの読み込み ===

fetch(baseAudioFile)
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
    .then(decodedBuffer => {
        audioBuffer = decodedBuffer;
        playBtn.disabled = false;
        slider.disabled = false; // スライダーも有効化
        playBtn.textContent = '再生 (センサー許可)';
    })
    .catch(err => {
        console.error('オーディオ読み込み失敗:', err);
        playBtn.textContent = 'エラー';
    });


// === 4. 再生/停止 コントロール (※加速度センサー許可を含む) ===

playBtn.addEventListener('click', () => {
    // --- センサー許可の処理 (重要) ---
    // 最初のクリック時に1回だけ実行
    if (!motionListenerAttached) {
        requestMotionPermission();
    }

    // --- 再生/停止の処理 ---
    if (isPlaying) {
        // 停止
        sourceNode?.stop(0);
        sourceNode = null;
        isPlaying = false;
        playBtn.textContent = '再生 (センサー許可)';
    } else {
        // 再生
        if (!audioBuffer) return;
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.loop = true;
        
        // 現在のスライダーの値から初期速度を計算
        const initialSliderValue = parseFloat(slider.value);
        const initialRate = initialSliderValue / baseSpeed;
        sourceNode.playbackRate.value = initialRate;

        sourceNode.connect(audioContext.destination);
        sourceNode.start(0); 

        isPlaying = true;
        playBtn.textContent = '停止';
    }
});


// === 5. センサーの許可とリスナー登録 ===

function requestMotionPermission() {
    // 1. iOS 13+ の Safari の場合
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('devicemotion', handleMotion);
                    motionListenerAttached = true;
                } else {
                    alert('加速度センサーの許可が拒否されました。');
                }
            })
            .catch(console.error);
    } else {
        // 2. Android やその他のブラウザ
        // (許可不要、または標準のイベントで対応)
        window.addEventListener('devicemotion', handleMotion);
        motionListenerAttached = true;
    }
}

// === 6. 加速度センサーの処理 (ご提示のロジック) ===

/**
 * 加速度センサーのイベントハンドラ
 */
function handleMotion(event) {
    const a = event.accelerationIncludingGravity;
    if (!a) return; // センサーが反応しない場合は終了

    // 1. 加速度の大きさ（マグニチュード）を計算
    const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    const now = Date.now();

    // 2. データをバッファに追加
    motionBuffer.push({ t: now, m: mag });

    // 3. バッファから2秒以上前の古いデータを削除 (効率的な .shift()
    while (motionBuffer.length > 0 && motionBuffer[0].t < now - DURATION) {
        motionBuffer.shift();
    }
    
    // 4. データが少なすぎる場合は計算しない (最低10サンプルなど)
    if (motionBuffer.length < 10) {
        targetActivity = 0.0; // 揺れ無しとみなす
        return;
    }

    // 5. 直近2秒間のマグニチュードのリストを作成
    const magnitudes = motionBuffer.map(d => d.m);
    
    // 6. 平均値 (Mean) を計算
    const mean = magnitudes.reduce((s, v) => s + v, 0) / magnitudes.length;
    
    // 7. 分散 (Variance) を計算
    const variance = magnitudes.reduce((s, v) => s + (v - mean) ** 2, 0) / magnitudes.length;
    
    // 8. 標準偏差 (Standard Deviation) = 揺れの強さ
    // (ご提示のコードの 'rms' に相当)
    const activityLevel = Math.sqrt(variance);

    // 9. 目標値を更新
    targetActivity = activityLevel;
}


// === 7. メインループ (スライダーとオーディオの更新) ===

function mainLoop() {
    // 1. センサーの目標値に向かって現在の値を滑らかに（スムージング）
    currentActivity += (targetActivity - currentActivity) * SMOOTHING;

    // 2. 「揺れ」の値(currentActivity)を、指定の区切りで速度にマッピング
    let targetSpeed;
    if (currentActivity < 2) {
        targetSpeed = 1.10;
    } else if (currentActivity < 4) {
        targetSpeed = 1.15;
    } else if (currentActivity < 6) {
        targetSpeed = 1.20;
    } else if (currentActivity < 8) {
        targetSpeed = 1.25;
    } else if (currentActivity < 10) {
        targetSpeed = 1.30;
    } else {
        targetSpeed = 1.35; // 10以上
    }
    
    // 3. スライダーのUI（見た目）を更新
    // (手動操作と競合しないよう、差が十分あるときだけ更新する)
    const sliderVal = parseFloat(slider.value);
    if (Math.abs(sliderVal - targetSpeed) > 0.01) {
        slider.value = targetSpeed;
        speedDisplay.textContent = targetSpeed.toFixed(2);
    }
    
    // 4. オーディオの速度をシームレスに更新
    if (isPlaying && sourceNode) {
        const newRate = targetSpeed / baseSpeed;
        const now = audioContext.currentTime;
        // setTargetAtTimeで滑らかに変更 (setValueAtTimeでもOK)
        sourceNode.playbackRate.setTargetAtTime(newRate, now, 0.015);
    }

    // 5. 次のフレームを要求
    requestAnimationFrame(mainLoop);
}

// === 8. 手動スライダー操作の処理 ===
// (手動で動かした場合は、センサーの自動更新を一時的に上書きする)
slider.addEventListener('input', (e) => {
    const sliderValue = parseFloat(e.target.value);
    speedDisplay.textContent = sliderValue.toFixed(3);
    
    // 手動操作で targetSpeed を上書き (センサーの値を無視)
    const targetSpeed = sliderValue;

    if (isPlaying && sourceNode) {
        const newRate = targetSpeed / baseSpeed;
        const now = audioContext.currentTime;
        sourceNode.playbackRate.setTargetAtTime(newRate, now, 0.015);
    }
    
    // センサーが次に値を更新するまで、手動の値を保持
    // (mainLoopが動いているため、すぐにセンサーの値で上書きされるが、
    //  操作感は「手動が優先」される)
});


// === 9. アニメーションループ開始 ===
mainLoop();