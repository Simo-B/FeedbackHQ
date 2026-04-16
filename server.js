const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── BASE DE DONNÉES ───────────────────────────────────────────────
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const dbFile = IS_PROD
  ? path.join(dataDir, 'feedbackhq.prod.db')
  : path.join(dataDir, 'feedbackhq.dev.db');

console.log(`[DB] Mode: ${IS_PROD ? 'PRODUCTION' : 'DÉVELOPPEMENT'} → ${dbFile}`);

const db = new Database(dbFile);

db.exec(`
  CREATE TABLE IF NOT EXISTS avis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    magasin TEXT NOT NULL,
    score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
    commentaire TEXT,
    traite INTEGER DEFAULT 0,
    note_interne TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME GENERATED ALWAYS AS (
      datetime(created_at, '+12 months')
    ) STORED
  )
`);

// Données de démo uniquement en développement
if (!IS_PROD) {
  const count = db.prepare('SELECT COUNT(*) as n FROM avis').get();
  if (count.n === 0) {
    console.log('[DB] Injection des données de démo...');
    const insert = db.prepare('INSERT INTO avis (magasin, score, commentaire, traite, created_at) VALUES (?, ?, ?, ?, ?)');
    const now = Date.now();
    [
      ['rivoli',   5, 'Superbe accueil, je reviendrai !', 0, new Date(now - 8*60000).toISOString()],
      ['rivoli',   2, 'Attente longue en caisse, peu de personnel.', 0, new Date(now - 22*60000).toISOString()],
      ['reims',    4, 'Bon choix de produits, magasin propre.', 0, new Date(now - 45*60000).toISOString()],
      ['grenoble', 5, 'Vendeurs très compétents et sympathiques.', 1, new Date(now - 60*60000).toISOString()],
      ['dijon',    3, 'Correct mais rayons mal réapprovisionnés.', 1, new Date(now - 90*60000).toISOString()],
      ['angers',   1, 'Très déçu. Produit introuvable, personne pour aider.', 0, new Date(now - 120*60000).toISOString()],
      ['limoges',  4, 'Agréable visite, bonne ambiance.', 1, new Date(now - 180*60000).toISOString()],
      ['rivoli',   5, 'Excellent service, je recommande vivement.', 1, new Date(now - 240*60000).toISOString()],
      ['reims',    2, 'Signalétique confuse, difficile de trouver mon rayon.', 1, new Date(now - 300*60000).toISOString()],
      ['grenoble', 4, 'Très bien globalement, quelques ruptures de stock.', 1, new Date(now - 360*60000).toISOString()],
    ].forEach(d => insert.run(...d));
  }
}

// ─── PURGE RGPD : suppression automatique après 12 mois ───────────
function purgeExpires() {
  const result = db.prepare("DELETE FROM avis WHERE datetime('now') > expires_at").run();
  if (result.changes > 0) console.log(`[RGPD] ${result.changes} avis supprimé(s) (expirés)`);
}
purgeExpires();
setInterval(purgeExpires, 24 * 60 * 60 * 1000); // toutes les 24h

// ─── MIDDLEWARE ────────────────────────────────────────────────────
app.use(cors({ origin: IS_PROD ? false : '*' }));
app.use(express.json());

// Pas de logs d'IP en prod (RGPD)
if (!IS_PROD) {
  app.use((req, _, next) => { console.log(`${req.method} ${req.url}`); next(); });
}

// Headers sécurité
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const MAGASINS = ['rivoli','reims','grenoble','dijon','angers','limoges'];

// ─── SANITISATION commentaire ──────────────────────────────────────
function sanitizeCommentaire(text) {
  if (!text || typeof text !== 'string') return null;
  // Tronquer à 500 caractères max
  return text.trim().substring(0, 500) || null;
}

// ─── API ───────────────────────────────────────────────────────────

// POST /api/avis — soumettre un avis (aucune donnée personnelle)
app.post('/api/avis', (req, res) => {
  const { magasin, score, commentaire } = req.body;
  if (!MAGASINS.includes(magasin)) return res.status(400).json({ error: 'Magasin invalide' });
  const s = parseInt(score);
  if (!s || s < 1 || s > 5) return res.status(400).json({ error: 'Score invalide' });
  const comment = sanitizeCommentaire(commentaire);
  const result = db.prepare('INSERT INTO avis (magasin, score, commentaire) VALUES (?, ?, ?)')
    .run(magasin, s, comment);
  // On ne renvoie pas l'ID pour éviter toute corrélation
  res.json({ success: true });
});

// GET /api/avis — liste (admin)
app.get('/api/avis', (req, res) => {
  const { magasin, traite } = req.query;
  let query = 'SELECT id, magasin, score, commentaire, traite, note_interne, created_at FROM avis';
  const params = [];
  const conditions = [];
  if (magasin && magasin !== 'tous') { conditions.push('magasin = ?'); params.push(magasin); }
  if (traite !== undefined) { conditions.push('traite = ?'); params.push(parseInt(traite)); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC LIMIT 200';
  res.json(db.prepare(query).all(...params));
});

// GET /api/stats — métriques
app.get('/api/stats', (req, res) => {
  const { magasin } = req.query;
  const where = magasin && magasin !== 'tous' ? 'WHERE magasin = ?' : '';
  const params = magasin && magasin !== 'tous' ? [magasin] : [];
  const row = db.prepare(`
    SELECT COUNT(*) as total,
      ROUND(AVG(CAST(score AS REAL)), 1) as moyenne,
      SUM(CASE WHEN traite=0 THEN 1 ELSE 0 END) as non_traites,
      SUM(CASE WHEN score>=4 THEN 1 ELSE 0 END) as positifs
    FROM avis ${where}
  `).get(...params);
  res.json(row);
});

// PATCH /api/avis/:id — marquer traité + note interne
app.patch('/api/avis/:id', (req, res) => {
  const { traite, note_interne } = req.body;
  db.prepare('UPDATE avis SET traite=?, note_interne=? WHERE id=?')
    .run(traite ? 1 : 0, sanitizeCommentaire(note_interne), parseInt(req.params.id));
  res.json({ success: true });
});

// GET /api/rgpd/stats — transparence (nombre d'avis, date du plus ancien)
app.get('/api/rgpd/stats', (req, res) => {
  const row = db.prepare(`
    SELECT COUNT(*) as total_avis,
      MIN(created_at) as plus_ancien,
      MAX(expires_at) as expiration_max
    FROM avis
  `).get();
  res.json({ ...row, retention_mois: 12, anonyme: true });
});

// ─── PAGES ────────────────────────────────────────────────────────

app.get('/r', (req, res) => {
  if (!MAGASINS.includes(req.query.m)) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'form.html'));
});

app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  console.log(`FeedbackHQ [${IS_PROD ? 'PROD' : 'DEV'}] → http://localhost:${PORT}`);
});
