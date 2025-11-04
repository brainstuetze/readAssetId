const video = document.getElementById('videoPreview');
const captureButton = document.getElementById('captureButton');
const resultTextarea = document.getElementById('ocrResult');
const statusMessage = document.getElementById('statusMessage');
const canvas = document.getElementById('captureCanvas');
const ctx = canvas.getContext('2d');

const ASSET_ID_REGEX = /71080[-_]\d{4}[-_]\d{4}/;
const TESSERACT_SRC = 'vendor/tesseract/tesseract.min.js';
const TESSERACT_OPTIONS = {
  workerPath: 'vendor/tesseract/worker.min.js',
  corePath: 'vendor/tesseract/tesseract-core.wasm.js',
  langPath: 'vendor/tesseract/lang/',
  workerBlobURL: false,
};
let tesseractLoadPromise = null;

function setStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.dataset.type = type;
}

async function initCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('Camera access is not supported in this browser.', 'error');
    captureButton.disabled = true;
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    video.srcObject = stream;
    setStatus('Camera ready. Align the Asset ID and press Capture.');
  } catch (error) {
    console.error('Camera initialization failed', error);
    if (error.name === 'NotAllowedError') {
      setStatus('Camera access was denied. Please allow camera permissions and reload.', 'error');
    } else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      setStatus('No suitable camera device was found.', 'error');
    } else {
      setStatus('Unable to access the camera. Please try again.', 'error');
    }
    captureButton.disabled = true;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureTesseractLoaded() {
  if (window.Tesseract?.recognize) {
    return window.Tesseract;
  }

  if (!tesseractLoadPromise) {
    tesseractLoadPromise = (async () => {
      try {
        setStatus('Loading OCR engine…');
        await loadScript(TESSERACT_SRC);
        if (!window.Tesseract?.recognize) {
          throw new Error('OCR engine did not initialize correctly.');
        }
        return window.Tesseract;
      } catch (error) {
        console.error('Failed to load Tesseract.js', error);
        throw new Error(
          'Unable to load the OCR engine. Please verify the static assets are available.'
        );
      }
    })();
  }

  return tesseractLoadPromise;
}

async function runOcr(image) {
  try {
    const Tesseract = await ensureTesseractLoaded();
    setStatus('Processing image…');
    const { data } = await Tesseract.recognize(image, 'eng', {
      ...TESSERACT_OPTIONS,
      logger: (m) => {
        if (m.status === 'recognizing text') {
          setStatus(`Recognizing text… ${Math.round(m.progress * 100)}%`);
        }
      },
    });
    return data.text;
  } catch (error) {
    console.error('OCR failed', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('OCR processing failed. Please try again.');
  }
}

function extractAssetId(rawText) {
  if (!rawText) return null;

  const normalized = rawText.replace(/\s+/g, '');
  const match = normalized.match(ASSET_ID_REGEX);
  return match ? match[0] : null;
}

async function handleCapture() {
  if (!video.videoWidth || !video.videoHeight) {
    setStatus('Camera is not ready yet. Please wait a moment.', 'warning');
    return;
  }

  captureButton.disabled = true;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  try {
    const dataUrl = canvas.toDataURL('image/png');
    const text = await runOcr(dataUrl);
    const assetId = extractAssetId(text);

    if (assetId) {
      const existing = resultTextarea.value.trim();
      resultTextarea.value = existing ? `${existing}\n${assetId}` : assetId;
      setStatus('Asset ID detected successfully.');
    } else {
      setStatus('No Asset ID found. Please ensure the code matches 71080-YYYY-NNNN.', 'warning');
    }
  } catch (error) {
    setStatus(error.message || 'Unexpected error during OCR.', 'error');
  } finally {
    captureButton.disabled = false;
  }
}

captureButton.addEventListener('click', handleCapture);

initCamera();
