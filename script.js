let video = document.getElementById('video');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let targetImage = document.getElementById('targetImage');
let alarmSound = document.getElementById('alarmSound');
let statusText = document.getElementById('status');
let startBtn = document.getElementById('startBtn');
let stopBtn = document.getElementById('stopBtn');
let imageUpload = document.getElementById('imageUpload');
let uploadStatus = document.getElementById('uploadStatus');

let stream = null;
let scanInterval = null;
let isMonitoring = false;
let targetMat = null;
let isCvReady = false;
let isImageLoaded = false; // 이미지 로드 확인용

// 디스코드 웹훅 주소
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1508775916673831053/SAgQUKBm81PHyAgHUXYMHSGm_2he-Kwt9A8UFq7hzyeGQAURvInizm6XvaqrEVt2yF1g";

function onOpenCvReady() {
    isCvReady = true;
    checkReadyState();
}

// 🔥 사용자가 직접 파일을 선택하면 실행됨 (404 에러 원천 차단)
imageUpload.addEventListener('change', (e) => {
    let file = e.target.files[0];
    if (file) {
        let reader = new FileReader();
        reader.onload = function(event) {
            targetImage.src = event.target.result;
            targetImage.onload = () => {
                isImageLoaded = true;
                uploadStatus.innerText = "✅ 타겟 이미지 준비 완료!";
                uploadStatus.style.color = "#2ecc71";
                checkReadyState();
            }
        }
        reader.readAsDataURL(file);
    }
});

// OpenCV와 이미지가 둘 다 준비되어야만 시작 버튼 활성화
function checkReadyState() {
    if (isCvReady && isImageLoaded) {
        startBtn.innerText = "화면 선택 및 감시 시작";
        startBtn.disabled = false;
    }
}

startBtn.addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "never" }, audio: false });
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            targetMat = cv.imread(targetImage); // 100% 정상 작동함
            
            isMonitoring = true;
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');
            statusText.innerText = "👀 화면 감시 중 (오른쪽 50% 스캔)...";
            statusText.style.color = "#2ecc71";

            scanInterval = setInterval(scanScreen, 1000);
        };
        stream.getVideoTracks()[0].onended = stopMonitoring;
    } catch (err) {
        alert("화면 공유를 허용해야 합니다.");
    }
});

stopBtn.addEventListener('click', stopMonitoring);

function stopMonitoring() {
    isMonitoring = false;
    clearInterval(scanInterval);
    if (stream) stream.getTracks().forEach(track => track.stop());
    if (targetMat) { targetMat.delete(); targetMat = null; }
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    statusText.innerText = "대기 중...";
    statusText.style.color = "white";
}

function scanScreen() {
    if (!isMonitoring || !isCvReady || !targetMat) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    try {
        let src = cv.imread(canvas);
        let dst = new cv.Mat();
        let mask = new cv.Mat();

        let rect = new cv.Rect(canvas.width * 0.5, 0, canvas.width * 0.5, canvas.height); 
        let roi = src.roi(rect);

        cv.matchTemplate(roi, targetMat, dst, cv.TM_CCOEFF_NORMED, mask);
        let result = cv.minMaxLoc(dst, mask);
        
        if (result.maxVal > 0.8) {
            statusText.innerText = `🚨 거탐 감지! (일치율: ${Math.round(result.maxVal * 100)}%)`;
            statusText.style.color = "#e74c3c";
            
            alarmSound.currentTime = 0;
            alarmSound.play().catch(e => console.log(e));
            
            fetch(DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: '🚨 **거짓말 탐지기(LIE DETECTOR) 감지!** 화면을 확인하세요!' })
            }).catch(e => console.log('디스코드 전송 실패:', e));

            clearInterval(scanInterval);
            setTimeout(() => {
                if (isMonitoring) {
                    statusText.innerText = "👀 다시 화면 감시 중...";
                    statusText.style.color = "#2ecc71";
                    scanInterval = setInterval(scanScreen, 1000);
                }
            }, 10000);
        }

        src.delete();
        roi.delete();
        dst.delete();
        mask.delete();
        
    } catch (err) {
        console.error(err);
    }
}