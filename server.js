const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

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

// Données de démo en dev
if (!IS_PROD && !fs.existsSync(dbFile)) {
  const now = Date.now();
  const demoReponses = [
    { question: 'Avez-vous été accueilli rapidement ?', reponse: true },
    { question: 'Le vendeur a-t-il répondu à vos besoins ?', reponse: true },
    { question: 'Avez-vous trouvé ce que vous cherchiez ?', reponse: true },
    { question: 'Le magasin était-il propre et bien organisé ?', reponse: true },
    { question: 'Recommanderiez-vous ce magasin à un proche ?', reponse: true }
  ];
  writeDB({ avis: [
    { id: uuidv4(), magasin:'rivoli',   score:5, vendeur_id:'V-012', reponses: demoReponses, traite:false, note_interne:null, created_at: new Date(now-8*60000).toISOString() },
    { id: uuidv4(), magasin:'rivoli',   score:2, vendeur_id:'V-007', reponses: [{question:'Avez-vous été accueilli rapidement ?',reponse:false},{question:'Le vendeur a-t-il répondu à vos besoins ?',reponse:false},{question:'Avez-vous trouvé ce que vous cherchiez ?',reponse:false},{question:'Le magasin était-il propre et bien organisé ?',reponse:true},{question:'Recommanderiez-vous ce magasin à un proche ?',reponse:false}], traite:false, note_interne:null, created_at: new Date(now-22*60000).toISOString() },
    { id: uuidv4(), magasin:'reims',    score:4, vendeur_id:'V-023', reponses: demoReponses, traite:false, note_interne:null, created_at: new Date(now-45*60000).toISOString() },
    { id: uuidv4(), magasin:'grenoble', score:5, vendeur_id:'V-031', reponses: demoReponses, traite:true,  note_interne:null, created_at: new Date(now-60*60000).toISOString() },
    { id: uuidv4(), magasin:'dijon',    score:3, vendeur_id:'V-018', reponses: demoReponses, traite:true,  note_interne:null, created_at: new Date(now-90*60000).toISOString() },
    { id: uuidv4(), magasin:'angers',   score:1, vendeur_id:'V-005', reponses: [{question:'Avez-vous été accueilli rapidement ?',reponse:false},{question:'Le vendeur a-t-il répondu à vos besoins ?',reponse:false},{question:'Avez-vous trouvé ce que vous cherchiez ?',reponse:false},{question:'Le magasin était-il propre et bien organisé ?',reponse:false},{question:'Recommanderiez-vous ce magasin à un proche ?',reponse:false}], traite:false, note_interne:null, created_at: new Date(now-120*60000).toISOString() },
    { id: uuidv4(), magasin:'limoges',  score:4, vendeur_id:'V-042', reponses: demoReponses, traite:true,  note_interne:null, created_at: new Date(now-180*60000).toISOString() },
  ]});
  console.log('[DB] Données de démo injectées');
}

// Purge RGPD 12 mois
function purgeExpired() {
  const db = readDB();
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 12);
  const avant = db.avis.length;
  db.avis = db.avis.filter(a => new Date(a.created_at) > limite);
  if (db.avis.length < avant) { writeDB(db); console.log(`[RGPD] ${avant - db.avis.length} avis supprimé(s)`); }
}
purgeExpired();
setInterval(purgeExpired, 24 * 60 * 60 * 1000);

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
function sanitize(t) { return (typeof t==='string' && t.trim()) ? t.trim().substring(0,200) : null; }

// POST /api/avis
app.post('/api/avis', (req, res) => {
  const { magasin, score, vendeur_id, reponses } = req.body;
  if (!MAGASINS.includes(magasin)) return res.status(400).json({ error: 'Magasin invalide' });
  const s = parseInt(score);
  if (!s || s < 1 || s > 5) return res.status(400).json({ error: 'Score invalide' });
  if (!vendeur_id) return res.status(400).json({ error: 'Identifiant vendeur requis' });
  const db = readDB();
  db.avis.push({
    id: uuidv4(),
    magasin, score: s,
    vendeur_id: sanitize(vendeur_id),
    reponses: Array.isArray(reponses) ? reponses : [],
    traite: false,
    note_interne: null,
    created_at: new Date().toISOString()
  });
  writeDB(db);
  res.json({ success: true });
});

// GET /api/avis
app.get('/api/avis', (req, res) => {
  const { magasin, traite } = req.query;
  let list = readDB().avis;
  if (magasin && magasin !== 'tous') list = list.filter(a => a.magasin === magasin);
  if (traite !== undefined) list = list.filter(a => a.traite === (traite === '1'));
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(list.slice(0, 200));
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const { magasin } = req.query;
  let list = readDB().avis;
  if (magasin && magasin !== 'tous') list = list.filter(a => a.magasin === magasin);
  const total = list.length;
  const moyenne = total ? (list.reduce((s, a) => s + a.score, 0) / total).toFixed(1) : null;
  res.json({
    total,
    moyenne: parseFloat(moyenne),
    non_traites: list.filter(a => !a.traite).length,
    positifs: list.filter(a => a.score >= 4).length
  });
});

// PATCH /api/avis/:id
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

// GET /api/export — CSV
app.get('/api/export', (req, res) => {
  const { magasin } = req.query;
  let list = readDB().avis;
  if (magasin && magasin !== 'tous') list = list.filter(a => a.magasin === magasin);
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const questions = [
    'Accueil rapide','Besoins couverts','Produit trouvé','Propreté','Recommandation'
  ];
  const header = ['Date','Magasin','Vendeur','Note', ...questions,'Note interne'].join(';');
  const rows = list.map(a => {
    const reps = questions.map((_, i) => {
      const r = a.reponses && a.reponses[i];
      return r ? (r.reponse ? 'Oui' : 'Non') : '';
    });
    return [
      new Date(a.created_at).toLocaleDateString('fr-FR'),
      a.magasin, a.vendeur_id || '', a.score,
      ...reps,
      a.note_interne || ''
    ].join(';');
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="feedbackhq-${magasin||'tous'}-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.listen(PORT, () => console.log(`FeedbackHQ [${IS_PROD?'PROD':'DEV'}] → http://localhost:${PORT}`));
