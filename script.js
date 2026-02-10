// Popola menu mappe da config.js
const select = document.getElementById('map-select');
maps.forEach(m => {
  const option = document.createElement('option');
  option.value = m.id;
  option.textContent = m.name;
  select.appendChild(option);
});

// Variabili globali
let currentMap = null;
let entities = [];
let score = 0;
let errors = 0;
let selectedEntity = null;
const popupInput = document.getElementById('entity-input');
const messageDiv = document.getElementById('message');
const inputSection = document.getElementById('input-section');

// Timer
let timerStarted = false;
let startTime = 0;
let timerInterval = null;

// Pan & Zoom state
let zScale = 1;
let zMin = 0.5;
let zMax = 4;
let zTx = 0;
let zTy = 0;
let isPanning = false;
let panStart = {x:0,y:0};
let translateStart = {x:0,y:0};

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
}

function startTimer() {
  if (timerStarted) return;
  timerStarted = true;
  startTime = Date.now();
  document.getElementById('timer').textContent = '00:00';
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    document.getElementById('timer').textContent = formatTime(elapsed);
  }, 250);
}

function stopTimer() {
  if (!timerStarted) return;
  clearInterval(timerInterval);
  timerInterval = null;
  timerStarted = false;
}

// Evento cambio mappa
select.addEventListener('change', (e) => {
  const mapId = e.target.value;
  currentMap = maps.find(m => m.id === mapId);
  if (!currentMap) return;

  // Reset gioco
  score = 0; errors = 0;
  document.getElementById('score').textContent = score;
  document.getElementById('errors').textContent = errors;
  document.getElementById('total').textContent = currentMap.total;
  document.getElementById('ui').style.display = 'block';
  document.getElementById('map-wrapper').style.display = 'block';
  inputSection.style.display = 'flex';
  messageDiv.textContent = '';
  messageDiv.className = 'message';
  loadMap(currentMap.svg, currentMap.data);
});

// Funzione per caricare SVG e dati (modulare)
async function loadMap(svgUrl, dataUrl) {
  // Carica SVG
  const response = await fetch(svgUrl);
  const svgText = await response.text();
  const mapContainer = document.getElementById('map-container');
  mapContainer.innerHTML = svgText;
  
  // Attendi un frame per assicurarsi che il DOM sia aggiornato
  await new Promise(resolve => setTimeout(resolve, 50));
  
  const svgElement = document.querySelector('#map-container svg');
  if (!svgElement) {
    console.error('SVG non trovato');
    return;
  }
  svgElement.id = 'current-map';

  // Proviamo a caricare dati JSON
  let loadedFromJson = false;
  try {
    const dataResponse = await fetch(dataUrl);
    if (dataResponse.ok) {
      const data = await dataResponse.json();
      if (data && Array.isArray(data.entities) && data.entities.length) {
        entities = data.entities;
        loadedFromJson = true;
      }
    }
  } catch (e) {
    loadedFromJson = false;
  }

  if (!loadedFromJson) {
    const svgPaths = svgElement.querySelectorAll('path');
    entities = Array.from(svgPaths).map(p => ({
      id: p.id,
      name: p.getAttribute('title') || p.getAttribute('name') || p.id,
      aliases: []
    }));
  }

  // Aggiorna il totale
  if (!currentMap.total) currentMap.total = entities.length;
  document.getElementById('total').textContent = currentMap.total;

  // Setup pan/zoom on the container
  const container = document.getElementById('map-container');
  container.style.touchAction = 'none';
  svgElement.style.transformOrigin = '0 0';
  svgElement.style.willChange = 'transform';
  zScale = 1; zTx = 0; zTy = 0;
  svgElement.style.transform = `translate(${zTx}px, ${zTy}px) scale(${zScale})`;

  // Wheel to zoom (prevent page scroll)
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = -e.deltaY;
    const factor = Math.exp(delta * 0.001);
    const newScale = Math.max(zMin, Math.min(zMax, zScale * factor));
    const scaleRatio = newScale / zScale;
    zTx = mx - (mx - zTx) * scaleRatio;
    zTy = my - (my - zTy) * scaleRatio;
    zScale = newScale;
    // Apply transform with clamping
    clampAndApply();
  }, { passive: false });

  // Pointer panning
  let activePointerId = null;
  container.addEventListener('pointerdown', (e) => {
    activePointerId = e.pointerId;
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    translateStart = { x: zTx, y: zTy };
    container.setPointerCapture(activePointerId);
    container.classList.add('grabbing');
  });
  container.addEventListener('pointermove', (e) => {
    if (!isPanning || e.pointerId !== activePointerId) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    zTx = translateStart.x + dx;
    zTy = translateStart.y + dy;
    clampAndApply();
  });
  container.addEventListener('pointerup', (e) => {
    if (e.pointerId === activePointerId) {
      isPanning = false;
      container.releasePointerCapture(activePointerId);
      activePointerId = null;
      container.classList.remove('grabbing');
    }
  });
  container.addEventListener('pointercancel', (e) => {
    if (e.pointerId === activePointerId) {
      isPanning = false;
      activePointerId = null;
      container.classList.remove('grabbing');
    }
  });

  // Aggiungi event listener ai path SVG per il click
  const svgPaths = svgElement.querySelectorAll('path');

  // Helper: clamp translation so the SVG stays visible in container
  function clampAndApply() {
    const bbox = svgElement.getBBox();
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scaledW = bbox.width * zScale;
    const scaledH = bbox.height * zScale;

    // Compute min/max translations so bbox remains visible
    const minTx = cw - (bbox.x + bbox.width) * zScale;
    const maxTx = -bbox.x * zScale;
    const minTy = ch - (bbox.y + bbox.height) * zScale;
    const maxTy = -bbox.y * zScale;

    if (scaledW <= cw) {
      zTx = (cw - scaledW) / 2 - bbox.x * zScale;
    } else {
      zTx = Math.min(maxTx, Math.max(minTx, zTx));
    }

    if (scaledH <= ch) {
      zTy = (ch - scaledH) / 2 - bbox.y * zScale;
    } else {
      zTy = Math.min(maxTy, Math.max(minTy, zTy));
    }

    svgElement.style.transform = `translate(${zTx}px, ${zTy}px) scale(${zScale})`;
  }

  // Fit-to-screen and Reset handlers
  function fitToScreen() {
    const bbox = svgElement.getBBox();
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (bbox.width <= 0 || bbox.height <= 0) return;
    const scaleX = cw / bbox.width;
    const scaleY = ch / bbox.height;
    const fitScale = Math.max(zMin, Math.min(zMax, Math.min(scaleX, scaleY) * 0.95));
    zScale = fitScale;
    // center the map
    zTx = (cw - bbox.width * zScale) / 2 - bbox.x * zScale;
    zTy = (ch - bbox.height * zScale) / 2 - bbox.y * zScale;
    clampAndApply();
  }

  function resetView() {
    zScale = 1;
    zTx = 0;
    zTy = 0;
    clampAndApply();
  }

  // Wire buttons (if present)
  const fitBtn = document.getElementById('fit-btn');
  const resetBtn = document.getElementById('reset-btn');
  if (fitBtn) fitBtn.addEventListener('click', fitToScreen);
  if (resetBtn) resetBtn.addEventListener('click', resetView);
  svgPaths.forEach(path => {
    path.style.cursor = 'pointer';
    path.addEventListener('click', (e) => {
      e.stopPropagation();
      const pathId = path.id;
      const entity = entities.find(ent => ent.id === pathId);
      if (!entity) {
        console.warn('Entità non trovata per:', pathId);
        return;
      }

      // Rimuovi classe selected da altri path
      svgPaths.forEach(p => {
        p.classList.remove('selected');
        p.style.opacity = '0.6';
        p.style.filter = 'none';
      });

      // Seleziona questo path
      selectedEntity = pathId;
      path.classList.add('selected');
      path.style.opacity = '1';
      path.style.filter = 'drop-shadow(0 0 8px rgba(102, 126, 234, 0.8))';

      // Focus sull'input
      popupInput.focus();
      console.log('Selezionato:', entity.name);
    });
  });
}

// Funzione per elaborare l'input
function submitAnswer() {
  if (!selectedEntity) {
    console.warn('Nessuna regione selezionata');
    return;
  }
  // Avvia il timer alla prima submission
  if (!timerStarted) startTimer();
  
  const input = popupInput.value.trim().toLowerCase();
  const entity = entities.find(e => e.id === selectedEntity);
  if (!entity) {
    console.warn('Entità non trovata:', selectedEntity);
    return;
  }

  const correctNames = [entity.name.toLowerCase(), ...entity.aliases.map(a => a.toLowerCase())];
  if (correctNames.includes(input)) {
    // Corretto
    const path = document.getElementById(selectedEntity);
    path.classList.add('correct');
    path.style.opacity = '1';
    path.style.filter = 'none';
    
    // Aggiungi label
    const bbox = path.getBBox();
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.textContent = entity.name;
    label.setAttribute('x', bbox.x + bbox.width / 2);
    label.setAttribute('y', bbox.y + bbox.height / 2);
    label.setAttribute('text-anchor', 'middle');
    document.getElementById('current-map').appendChild(label);
    score++;
    document.getElementById('score').textContent = score;
    messageDiv.textContent = '✓ Corretto!';
    messageDiv.className = 'message success';
    if (score === currentMap.total) {
      // stop timer when complete
      stopTimer();
      setTimeout(() => {
        alert('🎉 Mappa completata! Punteggio: ' + score + ' - Tempo: ' + document.getElementById('timer').textContent);
      }, 500);
    }
  } else {
    // Errore
    errors++;
    document.getElementById('errors').textContent = errors;
    messageDiv.textContent = '✗ Sbagliato! Riprova.';
    messageDiv.className = 'message error';
    
    const path = document.getElementById(selectedEntity);
    path.classList.add('error');
    setTimeout(() => path.classList.remove('error'), 1000);
  }
  popupInput.value = '';
}

// Submit con Enter o click bottone
popupInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitAnswer();
  }
});

document.getElementById('submit-btn').addEventListener('click', submitAnswer);