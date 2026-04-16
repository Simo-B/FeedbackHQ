# FeedbackHQ

Plateforme interne de collecte d'avis clients via QR code.

## Pages

| URL | Description |
|-----|-------------|
| `/` | Accueil |
| `/r?m=rivoli` | Formulaire client (remplacer `rivoli` par le magasin) |
| `/admin` | Interface d'administration |

## Magasins disponibles

`rivoli` · `reims` · `grenoble` · `dijon` · `angers` · `limoges`

---

## Déploiement sur Render

### 1. Pousser le code sur GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/VOTRE_ORG/feedbackhq.git
git push -u origin main
```

### 2. Créer le service sur Render

1. Aller sur [render.com](https://render.com) → **New → Web Service**
2. Connecter votre dépôt GitHub
3. Render détecte automatiquement `render.yaml`
4. Cliquer **Deploy**

### 3. Votre app est en ligne

Render vous donne une URL du type :
```
https://feedbackhq.onrender.com
```

### QR codes

Les QR codes sont générés automatiquement dans l'interface admin.
L'URL de chaque formulaire :
```
https://feedbackhq.onrender.com/r?m=rivoli
https://feedbackhq.onrender.com/r?m=reims
... etc.
```

---

## Lancer en local

```bash
npm install
npm start
# → http://localhost:3000
```

## Stack technique

- **Backend** : Node.js + Express
- **Base de données** : SQLite (fichier local, persistant via le disque Render)
- **Frontend** : HTML/CSS/JS natif
- **Hébergement** : Render (gratuit pour démarrer)
