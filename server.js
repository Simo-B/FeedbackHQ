const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── STOCKAGE JSON (pur Node.js, sans compilation) ─────────────────
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbFile = IS_PROD
  ? path.join(dataDir, 'prod.json')
  : path.join(dataDir, 'dev.json');

console.log(`[DB] Mode: ${IS_PROD ? 'PRODUCTION' : 'DEV'} → ${dbFile}`);

function readDB() {
  try { return JSON.parse(fs.readFileSync(dbFile, 'utf8')); }
  catch { return { avis: [] }; }
}

function writeDB(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// Init + données de démo en dev
if (!IS_PROD && !fs.existsSync(dbFile)) {
  const now = Date.now();
  const demo = { avis: [
    { id: uuidv4(), magasin:'rivoli',   score:5, commentaire:'Superbe accueil, je reviendrai !', traite:false, note_interne:null, created_at: new Date(now-8*60000).toISOString() },
    { id: uuidv4(), magasin:'rivoli',   score:2, commentaire:'Attente longue en caisse.', traite:false, note_interne:null, created_at: new Date(now-22*60000).toISOString() },
    { id: uuidv4(), magasin:'reims',    score:4, commentaire:'Bon choix de produits, magasin propre.', traite:false, note_interne:null, created_at: new Date(now-45*60000).toISOString() },
    { id: uuidv4(), magasin:'grenoble', score:5, commentaire:'Vendeurs très compétents.', traite:true, note_interne:null, created_at: new Date(now-60*60000).toISOString() },
    { id: uuidv4(), magasin:'dijon',    score:3, commentaire:'Correct mais rayons mal réapprovisionnés.', traite:true, note_interne:null, created_at: new Date(now-90*60000).toISOString() },
    { id: uuidv4(), magasin:'angers',   score:1, commentaire:'Très déçu. Personne pour aider.', traite:false, note_interne:null, created_at: new Date(now-120*60000).toISOString() },
    { id: uuidv4(), magasin:'limoges',  score:4, commentaire:'Agréable visite, bonne ambiance.', traite:true, note_interne:null, created_at: new Date(now-180*60000).toISOString() },
    { id: uuidv4(), magasin:'rivoli',   score:5, commentaire:'Excellent service, je recommande.', traite:true, note_interne:null, created_at: new Date(now-240*60000).toISOString() },
    { id: uuidv4(), magasin:'reims',    score:2, commentaire:'Signalétique confuse.', traite:true, note_interne:null, created_at: new Date(now-300*60000).toISOString() },
    { id: uuidv4(), magasin:'grenoble', score:4, commentaire:'Très bien, quelques ruptures de stock.', traite:true, note_interne:null, created_at: new Date(now-360*60000).toISOString() },
  ]};
  writeDB(demo);
  console.log('[DB] Données de démo injectées');
}

// ─── PURGE RGPD : suppression après 12 mois ───────────────────────
function purgeExpired() {
  const db = readDB();
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 12);
  const avant = db.avis.length;
  db.avis = db.avis.filter(a => new Date(a.created_at) > limite);
  if (db.avis.length < avant) {
    writeDB(db);
    console.log(`[RGPD] ${avant - db.avis.length} avis supprimé(s) (expirés)`);
  }
}
purgeExpired();
setInterval(purgeExpired, 24 * 60 * 60 * 1000);

// ─── MIDDLEWARE ────────────────────────────────────────────────────
app.use(cors({ origin: IS_PROD ? false : '*' }));
app.use(express.json());
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

const MAGASINS = ['rivoli','reims','grenoble','dijon','angers','limoges'];

function sanitize(text) {
  if (!text || typeof text !== 'string') return null;
  return text.trim().substring(0, 500) || null;
}

// ─── API ───────────────────────────────────────────────────────────

app.post('/api/avis', (req, res) => {
  const { magasin, score, commentaire } = req.body;
  if (!MAGASINS.includes(magasin)) return res.status(400).json({ error: 'Magasin invalide' });
  const s = parseInt(score);
  if (!s || s < 1 || s > 5) return res.status(400).json({ error: 'Score invalide' });
  const db = readDB();
  db.avis.push({
    id: uuidv4(),
    magasin, score: s,
    commentaire: sanitize(commentaire),
    traite: false,
    note_interne: null,
    created_at: new Date().toISOString()
  });
  writeDB(db);
  res.json({ success: true });
});

app.get('/api/avis', (req, res) => {
  const { magasin, traite } = req.query;
  let list = readDB().avis;
  if (magasin && magasin !== 'tous') list = list.filter(a => a.magasin === magasin);
  if (traite !== undefined) list = list.filter(a => a.traite === (traite === '1'));
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(list.slice(0, 200));
});

app.get('/api/stats', (req, res) => {
  const { magasin } = req.query;
  let list = readDB().avis;
  if (magasin && magasin !== 'tous') list = list.filter(a => a.magasin === magasin);
  const total = list.length;
  const moyenne = total ? (list.reduce((s, a) => s + a.score, 0) / total).toFixed(1) : null;
  const non_traites = list.filter(a => !a.traite).length;
  const positifs = list.filter(a => a.score >= 4).length;
  res.json({ total, moyenne: parseFloat(moyenne), non_traites, positifs });
});

app.patch('/api/avis/:id', (req, res) => {
  const { traite, note_interne } = req.body;
  const db = readDB();
  const avis = db.avis.find(a => a.id === req.params.id);
  if (!avis) return res.status(404).json({ error: 'Non trouvé' });
  avis.traite = !!traite;
  avis.note_interne = sanitize(note_interne);
  writeDB(db);
  res.json({ success: true });
});

app.get('/r', (req, res) => {
  if (!MAGASINS.includes(req.query.m)) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'form.html'));
});

app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => console.log(`FeedbackHQ [${IS_PROD ? 'PROD' : 'DEV'}] → http://localhost:${PORT}`));
