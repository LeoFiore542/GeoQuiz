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
let isPopupVisible = false;
const popup = document.getElementById('input-popup');
const popupInput = document.getElementById('entity-input');
const messageDiv = document.getElementById('message');

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
  messageDiv.textContent = '';
  messageDiv.className = 'message';
  loadMap(currentMap.svg, currentMap.data);
});

// Funzione per mostrare/nascondere popup
function showPopup(x, y) {
  popup.style.display = 'block';
  popup.style.left = Math.min(x, window.innerWidth - 270) + 'px';
  popup.style.top = (y - 60) + 'px';
  isPopupVisible = true;
  popupInput.value = '';
  popupInput.focus();
  popupInput.select();
}

function hidePopup() {
  popup.style.display = 'none';
  isPopupVisible = false;
}

// Movimento popup con mouse
document.addEventListener('mousemove', (e) => {
  if (isPopupVisible && selectedEntity) {
    popup.style.left = Math.min(e.clientX - 50, window.innerWidth - 270) + 'px';
    popup.style.top = (e.clientY - 60) + 'px';
  }
});

// Funzione per caricare SVG e dati (modulare)
async function loadMap(svgUrl, dataUrl) {
  // Carica SVG
  const response = await fetch(svgUrl);
  const svgText = await response.text();
  document.getElementById('map-container').innerHTML = svgText;
  const svgElement = document.querySelector('svg');
  svgElement.id = 'current-map';

  // Proviamo a caricare dati JSON; se non ci sono, ricaviamo i nomi direttamente dagli attributi `name` dei path SVG
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
      name: p.getAttribute('name') || p.id,
      aliases: []
    }));
  }

  // Aggiorna il totale dinamicamente se non specificato in config
  if (!currentMap.total) currentMap.total = entities.length;
  document.getElementById('total').textContent = currentMap.total;

  // Aggiungi eventi click ai path
  const paths = svgElement.querySelectorAll('path');
  paths.forEach(path => {
    path.addEventListener('click', (e) => {
      e.stopPropagation();
      if (path.classList.contains('correct')) return;
      selectedEntity = path.id;
      // Mostra popup al click del mouse
      showPopup(e.clientX, e.clientY);
    });
  });
}

// Funzione per elaborare l'input
function submitAnswer() {
  if (!selectedEntity) return;
  
  const input = popupInput.value.trim().toLowerCase();
  const entity = entities.find(e => e.id === selectedEntity);
  if (!entity) return;

  const correctNames = [entity.name.toLowerCase(), ...entity.aliases.map(a => a.toLowerCase())];
  if (correctNames.includes(input)) {
    // Corretto
    const path = document.getElementById(selectedEntity);
    path.classList.add('correct');
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
      setTimeout(() => {
        alert('🎉 Mappa completata! Punteggio: ' + score);
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
  hidePopup();
}

// Submit con Enter
popupInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitAnswer();
  }
});

// Chiudi popup cliccando fuori
document.addEventListener('click', (e) => {
  if (isPopupVisible && !popup.contains(e.target)) {
    hidePopup();
  }
});