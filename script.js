// Popola menu mappe nello splash screen da config.js
const splashMapSelect = document.getElementById('splash-map-select');
maps.forEach(m => {
  const option = document.createElement('option');
  option.value = m.id;
  option.textContent = m.name;
  splashMapSelect.appendChild(option);
});

// Variabili globali
let currentMap = null;
let entities = [];
let score = 0;
let errors = 0;
let currentEntity = null; // Entità attualmente illuminata
const entityInput = document.getElementById('entity-input');
const messageDiv = document.getElementById('message');

// Timer
let timerStarted = false;
let startTime = 0;
let timerInterval = null;
let finalTime = '00:00';

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

// Evento click "Inizia" dal splash screen
document.getElementById('start-btn').addEventListener('click', () => {
  const mapId = splashMapSelect.value;
  if (!mapId) {
    alert('Seleziona una mappa!');
    return;
  }
  
  currentMap = maps.find(m => m.id === mapId);
  if (!currentMap) return;

  // Nascondi splash, mostra gioco
  document.getElementById('splash-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'flex';

  // Reset gioco
  score = 0; errors = 0; timerStarted = false;
  document.getElementById('score').textContent = score;
  document.getElementById('errors').textContent = errors;
  document.getElementById('total').textContent = currentMap.total;
  document.getElementById('timer').textContent = '00:00';
  messageDiv.textContent = '';
  messageDiv.className = 'message';

  // Carica mappa e inizia il gioco
  loadMap(currentMap.svg, currentMap.data);
});

// Funzione per caricare SVG e dati
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

  // Crea un wrapper per il pan/zoom
  const wrapper = document.createElement('div');
  wrapper.id = 'map-transform-wrapper';
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  wrapper.style.transformOrigin = 'center center';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  mapContainer.insertBefore(wrapper, svgElement);
  wrapper.appendChild(svgElement);

  // Rendi l'SVG responsivo: rimuovi width/height e usa viewBox
  const bbox = svgElement.getBBox();
  if (!svgElement.hasAttribute('viewBox')) {
    svgElement.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
  }
  svgElement.removeAttribute('width');
  svgElement.removeAttribute('height');
  svgElement.style.width = '100%';
  svgElement.style.height = '100%';
  svgElement.style.maxWidth = '100%';
  svgElement.style.maxHeight = '100%';

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

  // Setup pan/zoom
  const container = document.getElementById('map-container');
  container.style.touchAction = 'none';
  zScale = 1; zTx = 0; zTy = 0;
  wrapper.style.transform = `translate(${zTx}px, ${zTy}px) scale(${zScale})`;

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
    wrapper.style.transform = `translate(${zTx}px, ${zTy}px) scale(${zScale})`;
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
    wrapper.style.transform = `translate(${zTx}px, ${zTy}px) scale(${zScale})`;
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

  // Fit-to-screen and Reset handlers
  function fitToScreen() {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    // Se la mappa sta già nel viewport, non cambiare
    zScale = 1;
    zTx = 0;
    zTy = 0;
    wrapper.style.transform = `translate(${zTx}px, ${zTy}px) scale(${zScale})`;
  }

  function resetView() {
    zScale = 0.9; // Leggermente zoomed out per avere margine
    zTx = 0;
    zTy = 0;
    wrapper.style.transform = `translate(${zTx}px, ${zTy}px) scale(${zScale})`;
  }

  const fitBtn = document.getElementById('fit-btn');
  const resetBtn = document.getElementById('reset-btn');
  if (fitBtn) fitBtn.addEventListener('click', fitToScreen);
  if (resetBtn) resetBtn.addEventListener('click', resetView);

  // Inizializza con zoom ridotto
  resetView();

  // Seleziona la prima regione e inizia il gioco
  selectRandomEntity();
}

// Seleziona una regione casuale e la illumina
function selectRandomEntity() {
  const svgElement = document.getElementById('current-map');
  const svgPaths = svgElement.querySelectorAll('path');

  // Deseleziona tutte
  svgPaths.forEach(p => {
    p.classList.remove('selected');
    if (!p.classList.contains('correct')) {
      p.style.opacity = '0.6';
      p.style.filter = 'none';
    }
  });

  // Scegli casualmente una che non è stata già indovinata
  const available = entities.filter(e => {
    const path = document.getElementById(e.id);
    return path && !path.classList.contains('correct');
  });

  if (available.length === 0) {
    // Mappa completata!
    stopTimer();
    finalTime = document.getElementById('timer').textContent;
    
    // Mostra il modal di fine partita
    showEndModal();
    return;
  }

  currentEntity = available[Math.floor(Math.random() * available.length)];
  const pathElement = document.getElementById(currentEntity.id);

  // Illumina la regione
  pathElement.classList.add('selected');
  pathElement.style.opacity = '1';
  pathElement.style.filter = 'drop-shadow(0 0 8px rgba(255, 215, 0, 0.6))';

  // Focus all'input
  entityInput.focus();
  entityInput.value = '';
  messageDiv.textContent = '';
  messageDiv.className = 'message';
}

// Submit con Enter o click bottone
entityInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitAnswer();
  }
});

document.getElementById('submit-btn').addEventListener('click', submitAnswer);

function submitAnswer() {
  if (!currentEntity) {
    console.warn('Nessuna regione selezionata');
    return;
  }

  // Avvia il timer al primo submit
  if (!timerStarted) startTimer();

  const input = entityInput.value.trim().toLowerCase();
  const correctNames = [currentEntity.name.toLowerCase(), ...currentEntity.aliases.map(a => a.toLowerCase())];

  if (correctNames.includes(input)) {
    // Corretto
    const path = document.getElementById(currentEntity.id);
    path.classList.add('correct');
    path.classList.remove('selected');
    path.style.opacity = '1';
    path.style.filter = 'none';

    // Aggiungi label
    const bbox = path.getBBox();
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.textContent = currentEntity.name;
    label.setAttribute('x', bbox.x + bbox.width / 2);
    label.setAttribute('y', bbox.y + bbox.height / 2);
    label.setAttribute('text-anchor', 'middle');
    document.getElementById('current-map').appendChild(label);

    score++;
    document.getElementById('score').textContent = score;
    messageDiv.textContent = '✓ Corretto!';
    messageDiv.className = 'message success';

    // Seleziona la prossima regione
    setTimeout(() => {
      selectRandomEntity();
    }, 800);
  } else {
    // Sbagliato
    errors++;
    document.getElementById('errors').textContent = errors;
    messageDiv.textContent = '✗ Sbagliato! Riprova.';
    messageDiv.className = 'message error';

    const path = document.getElementById(currentEntity.id);
    path.classList.add('error');
    setTimeout(() => path.classList.remove('error'), 800);
    
    // Rimani sulla stessa regione, ma pulisci input
    entityInput.value = '';
    entityInput.focus();
  }
}

// Mostra il modal di fine partita
function showEndModal() {
  document.getElementById('end-score').textContent = score;
  document.getElementById('end-errors').textContent = errors;
  document.getElementById('end-time').textContent = finalTime;
  document.getElementById('player-name').value = '';
  document.getElementById('end-message').textContent = '';
  document.getElementById('save-score-btn').disabled = false;
  document.getElementById('end-modal').style.display = 'flex';
  document.getElementById('player-name').focus();
}

// Nascondi il modal di fine partita
function hideEndModal() {
  document.getElementById('end-modal').style.display = 'none';
}

// Salva il punteggio
async function saveScore() {
  const playerName = document.getElementById('player-name').value.trim();
  
  if (!playerName) {
    document.getElementById('end-message').textContent = 'Inserisci il tuo nome!';
    document.getElementById('end-message').style.color = '#e74c3c';
    return;
  }

  const saveBtn = document.getElementById('save-score-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvataggio...';

  try {
    const response = await fetch('/scores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: playerName,
        score: score,
        errors: errors,
        time: finalTime,
        map: currentMap.name
      })
    });

    const data = await response.json();

    if (response.ok) {
      document.getElementById('end-message').textContent = '✓ Punteggio salvato con successo!';
      document.getElementById('end-message').style.color = '#27ae60';
      setTimeout(() => {
        resetGame();
      }, 1500);
    } else {
      throw new Error(data.error || 'Errore nel salvataggio');
    }
  } catch (err) {
    console.error('Errore:', err);
    document.getElementById('end-message').textContent = 'Errore nel salvataggio: ' + err.message;
    document.getElementById('end-message').style.color = '#e74c3c';
    saveBtn.disabled = false;
    saveBtn.textContent = 'Salva Punteggio';
  }
}

// Reset alla schermata iniziale
function resetGame() {
  hideEndModal();
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('splash-screen').style.display = 'flex';
  
  // Reset variabili globali
  entities = [];
  currentEntity = null;
  score = 0;
  errors = 0;
  timerStarted = false;
  finalTime = '00:00';
  if (timerInterval) clearInterval(timerInterval);
}

// Event listener per il pulsante salva
document.getElementById('save-score-btn').addEventListener('click', saveScore);

// Event listener per il pulsante nuova partita
document.getElementById('restart-btn').addEventListener('click', resetGame);

// Salva al premere Enter nel campo nome
document.getElementById('player-name').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveScore();
  }
});