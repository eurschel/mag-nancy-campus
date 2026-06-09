# Le Mag Campus Nancy

Veille pro étudiante du campus Eduservices Nancy (Pigier, MyDigitalSchool, Win Sport School).

12 grandes thématiques couvrant l'ensemble des formations du campus : culture générale, anglais pro, économie/droit/management (CEJM), marketing, communication, réseaux sociaux, relation client, management, gestion/compta, gestion de projet, RH, IA & outils.

## Stack

- Flask (Python 3.11)
- SPA front-end (vanilla JS, hash routing)
- Déploiement Railway + Docker
- Données dans `data/content.json` (structure 12 thèmes / modules / fiches)
- Veille hebdomadaire dans `data/veille.json` (overlay)

## Développement local

```bash
pip install -r requirements.txt
python app.py
# → http://localhost:8080
```

## Publication

Utiliser `tools/publish_github.py` pour pousser un fichier sans Git local. Token dans `.secrets/github_token_mag_nancy.txt` (gitignored).

## Status

- Phase 1 : fondations + branding + structure 12 thèmes ✅
- Phase 2 : curation des ressources par thème 🚧
- Phase 3 : newsletter Brevo dédiée 🚧
