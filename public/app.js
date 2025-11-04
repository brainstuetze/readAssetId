const video = document.getElementById('videoPreview');
const captureButton = document.getElementById('captureButton');
const resultTextarea = document.getElementById('ocrResult');
const statusMessage = document.getElementById('statusMessage');
const canvas = document.getElementById('captureCanvas');
const ctx = canvas.getContext('2d');

const ASSET_ID_REGEX = /71080[-_]\d{4}[-_]\d{4}/;
const TESSERACT_SRC = 'https://unpkg.com/tesseract.js@4.1.1/dist/tesseract.min.js';
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

async function ensureTesseractLoaded() {
  if (window.Tesseract?.recognize) {
    return window.Tesseract;
  }

  if (!tesseractLoadPromise) {
    tesseractLoadPromise = (async () => {
      try {
        setStatus('Loading OCR engine…');
        const response = await fetch(TESSERACT_SRC);
        if (!response.ok) {
          throw new Error(`Failed to load OCR script (HTTP ${response.status}).`);
        }
        const scriptText = await response.text();
        const scriptElement = document.createElement('script');
        scriptElement.type = 'text/javascript';
        scriptElement.text = scriptText;
        document.head.appendChild(scriptElement);

        if (!window.Tesseract?.recognize) {
          throw new Error('OCR engine did not initialize correctly.');
        }

        return window.Tesseract;
      } catch (error) {
        console.error('Failed to load Tesseract.js', error);
        throw new Error(
          'Unable to load the OCR engine. Please verify your network connection or adjust the Content Security Policy to allow downloads from unpkg.com.'
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
  resultTextarea.value = '';

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  try {
    const dataUrl = canvas.toDataURL('image/png');
    const text = await runOcr(dataUrl);
    const assetId = extractAssetId(text);

    if (assetId) {
      resultTextarea.value = assetId;
      setStatus('Asset ID detected successfully.');
    } else {
      resultTextarea.value = text.trim();
      setStatus('No Asset ID found. Please ensure the code matches 71080-YYYY-NNNN.', 'warning');
    }
  } catch (error) {
    resultTextarea.value = '';
    setStatus(error.message || 'Unexpected error during OCR.', 'error');
  } finally {
    captureButton.disabled = false;
  }
}

captureButton.addEventListener('click', handleCapture);

initCamera();
