const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('./'));

// Percorso al file database
const dbPath = path.join(__dirname, 'leaderboard.json');

// Funzione per leggere il database
function readLeaderboard() {
  try {
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Errore nella lettura del database:', err);
  }
  return { scores: [] };
}

// Funzione per scrivere nel database
function writeLeaderboard(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Errore nella scrittura del database:', err);
    return false;
  }
}

// GET /scores - Ottieni tutti i punteggi
app.get('/scores', (req, res) => {
  const db = readLeaderboard();
  // Ordina per punteggio decrescente, poi per tempo crescente
  db.scores.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.time - b.time;
  });
  res.json(db);
});

// POST /scores - Salva un nuovo punteggio
app.post('/scores', (req, res) => {
  const { name, score, errors, time, map } = req.body;

  if (!name || score === undefined || errors === undefined || !time || !map) {
    return res.status(400).json({ error: 'Dati incompleti' });
  }

  const db = readLeaderboard();
  const newScore = {
    id: Date.now(),
    name,
    score,
    errors,
    time,
    map,
    date: new Date().toLocaleString('it-IT')
  };

  db.scores.push(newScore);
  
  if (writeLeaderboard(db)) {
    res.json({ success: true, id: newScore.id });
  } else {
    res.status(500).json({ error: 'Errore nel salvataggio' });
  }
});

// GET /leaderboard - Pagina leaderboard
app.get('/leaderboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'leaderboard.html'));
});

app.listen(PORT, () => {
  console.log(`🎮 GeoQuiz server avviato su http://localhost:${PORT}`);
});
