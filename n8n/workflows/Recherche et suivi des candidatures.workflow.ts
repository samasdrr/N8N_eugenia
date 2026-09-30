const SHEET_ID = { __rl: true, mode: 'id', value: 'COLLER_ID_SPREADSHEET' };

const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: { name: 'Declencheur deux fois par jour', parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 12 }] } }, position: [-480, 300] },
  output: [{}]
});

const readConfig = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Lire la configuration',
    notes: 'Reads the Config sheet (columns: cle, valeur). Holds the profile, the Drive folder, the alert email and the Apify credentials. One row per key.',
    notesInFlow: true,
    executeOnce: true,
    parameters: { resource: 'sheet', operation: 'read', documentId: SHEET_ID, sheetName: { __rl: true, value: 'Config', mode: 'name' } },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets') },
    position: [-240, 140]
  },
  output: [{ cle: 'profil', valeur: 'Profile text' }]
});

const readTracking = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Lire le suivi existant',
    notes: 'Reads every row of the tracking sheet so that offers already recorded are never processed twice.',
    notesInFlow: true,
    executeOnce: true,
    parameters: { resource: 'sheet', operation: 'read', documentId: SHEET_ID, sheetName: { __rl: true, value: 'Suivi', mode: 'name' } },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets') },
    position: [-240, 460]
  },
  output: [{ lien: 'https://example.com/offre' }]
});

const prepareSearch = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Preparer les requetes de recherche',
    notes: 'Builds one Apify request per city. The 15 target job titles are sent together. The payload keys (searchTerms, location, maxItems) must match the input schema of your Apify actor.',
    notesInFlow: true,
    parameters: {
      jsCode: `const titres = [
  "Business Analyst Junior", "Data Analyst Junior", "BI Analyst",
  "Business Intelligence Analyst", "Data Consultant Junior", "BI Consultant Junior",
  "Analytics Consultant", "Product Data Analyst", "Data Product Analyst",
  "AI Consultant Junior", "Data Scientist Junior", "Consultant Data & IA",
  "Business Analyst Data", "Business Analyst IT", "Product Owner Data Junior"
];

const villes = [
  { nom: "Paris", regle: "accessible en transports en commun" },
  { nom: "Lyon", regle: "accessible en transports en commun" },
  { nom: "Montpellier", regle: "accessible en transports en commun" },
  { nom: "Marseille", regle: "a une heure maximum en voiture" }
];

const lignes = $('Lire la configuration').all();
const config = {};
for (const item of lignes) {
  const cle = String(item.json.cle || '').trim();
  if (cle) config[cle] = item.json.valeur;
}

const acteur = String(config.apify_actor_id || '').trim();
const jeton = String(config.apify_token || '').trim();
if (!acteur || !jeton) {
  throw new Error("Cle absente dans l'onglet Config : apify_actor_id et apify_token sont requis.");
}

return villes.map((ville) => ({
  json: {
    acteur,
    jeton,
    ville: ville.nom,
    regle: ville.regle,
    corps: {
      searchTerms: titres,
      location: ville.nom,
      maxItems: 50,
      proxy: { useApifyProxy: true }
    }
  }
}));`
    },
    position: [0, 140]
  },
  output: [{ acteur: '<apify_actor_id>', jeton: '<apify_token>', ville: 'Paris', regle: 'accessible en transports en commun', corps: { searchTerms: ['Data Analyst Junior'], location: 'Paris', maxItems: 50, proxy: { useApifyProxy: true } } }]
});

const apifySearch = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Lancer la recherche Apify',
    notes: 'Runs the Apify actor synchronously and returns the scraped offers as items. One call per city, four calls per run.',
    notesInFlow: true,
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: expr('https://api.apify.com/v2/acts/{{ $json.acteur }}/run-sync-get-dataset-items?token={{ $json.jeton }}&clean=true&format=json'),
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.corps) }}'),
      options: { timeout: 300000 }
    },
    position: [240, 140]
  },
  output: [{ title: 'Data Analyst Junior' }]
});

const filterOffers = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Filtrer et dedoublonner les offres',
    notes: 'Keeps offers matching one of the 15 target titles (or a close variant with matching missions) located in a target city, or remote / hybrid. Company size and sector drive the priority flag, they never exclude an offer. Offers already present in the tracking sheet are dropped. Salary is never used to exclude an offer.',
    notesInFlow: true,
    parameters: {
      jsCode: `const titresCibles = [
  "business analyst junior", "data analyst junior", "bi analyst",
  "business intelligence analyst", "data consultant junior", "bi consultant junior",
  "analytics consultant", "product data analyst", "data product analyst",
  "ai consultant junior", "data scientist junior", "consultant data",
  "business analyst data", "business analyst it", "product owner data"
];

const competencesCibles = /data|analyst|bi|business intelligence|ia|ai|sql|power ?bi|tableau|python|excel|dax|dataviz|modele|decision/i;
const titreProche = /analyst|consultant|product owner|master ?data/i;
const secteurPrive = /banque|assurance|banking|insurance|financ|credit|mutuelle/i;
const teletravail = /teletravail|télétravail|remote|hybride|hybrid|work from home|wfh/i;

function texte(valeur) {
  if (valeur === null || valeur === undefined) return "";
  if (typeof valeur === "string") return valeur;
  if (typeof valeur === "object") {
    if (Array.isArray(valeur)) return valeur.map(texte).join(" ");
    return Object.values(valeur).map(texte).join(" ");
  }
  return String(valeur);
}

function choisir(source, cles) {
  for (const cle of cles) {
    if (source[cle] !== undefined && source[cle] !== null && source[cle] !== "") return source[cle];
  }
  return "";
}

const lignesConfig = $('Lire la configuration').all();
const config = {};
for (const item of lignesConfig) {
  const cle = String(item.json.cle || '').trim();
  if (cle) config[cle] = item.json.valeur;
}
const profil = texte(config.profil);
const dossierDrive = texte(config.dossier_drive);

const connus = new Set();
for (const item of $('Lire le suivi existant').all()) {
  const lien = texte(item.json.lien || item.json.url).trim();
  if (lien) connus.add(lien);
}

const brut = Array.isArray($json) ? $json : [$json];
const retenues = [];

for (const item of brut) {
  const o = item && item.json ? item.json : item;
  if (!o || typeof o !== "object") continue;

  const intitule = texte(choisir(o, ["title", "jobTitle", "job_title", "name", "position", "intitule"]));
  const entreprise = texte(choisir(o, ["company", "companyName", "company_name", "employer", "entreprise"]));
  const lieu = texte(choisir(o, ["location", "city", "lieu", "jobLocation", "workplace"]));
  const lien = texte(choisir(o, ["url", "link", "applyUrl", "apply_url", "jobUrl", "lien", "jobUrlCanonical"])).trim();
  const source = texte(choisir(o, ["source", "platform", "site", "sourceDomain"]));
  const datePublication = texte(choisir(o, ["publishedAt", "published_at", "datePosted", "date_posted", "date", "postedDate"]));
  const missions = texte(choisir(o, ["description", "summary", "descriptionText", "missions", "jobDescription"]));
  const remuneration = texte(choisir(o, ["salary", "salaryRange", "salary_range", "compensation", "remuneration", "salaryText"]));
  const skills = texte(choisir(o, ["skills", "tags", "competences", "requirements"]));

  if (!intitule || !lien) continue;
  if (connus.has(lien)) continue;

  const texteComplet = (intitule + " " + missions).toLowerCase();
  const titreMinuscule = intitule.toLowerCase();
  const correspondancesCibles = titresCibles.filter((t) => titreMinuscule.includes(t));
  const variantesProches = correspondancesCibles.length === 0 && titreProche.test(titreMinuscule) && competencesCibles.test(missions);
  if (correspondancesCibles.length === 0 && !variantesProches) continue;

  const analyseLieu = lieu.toLowerCase();
  const villeAutorisee = /paris|lyon|montpellier/.test(analyseLieu);
  const marseille = /marseille/.test(analyseLieu);
  if (!villeAutorisee && !marseille && !teletravail.test(lieu + " " + missions)) continue;

  const taille = Number(choisir(o, ["companySize", "company_size", "employeeCount", "employee_count", "numEmployees"])) || null;
  const secteur = texte(choisir(o, ["sector", "industry", "secteur"]));
  const grandeEntreprise = taille !== null && taille >= 200;
  const secteurPrio = secteurPrive.test(secteur + " " + entreprise);

  let priorite = "Normale";
  if (secteurPrio || grandeEntreprise) priorite = "Haute";
  if (secteurPrio && grandeEntreprise) priorite = "Banque / Assurance";

  retenues.push({
    json: {
      offre: {
        intitule,
        entreprise,
        lieu,
        source: source || "Apify",
        lien,
        datePublication,
        missions: missions.slice(0, 4000),
        competences: skills.slice(0, 2000),
        remuneration,
        tailleEntreprise: taille,
        secteur,
        priorite,
        correspondance: correspondancesCibles[0] || "variante proche"
      },
      profil,
      dossierDrive,
      regleLieu: villeAutorisee ? "Transports en commun" : marseille ? "Maximum 1h en voiture" : "Teletravail / hybride"
    }
  });
}

const vus = new Set();
const uniques = [];
for (const item of retenues) {
  if (vus.has(item.json.offre.lien)) continue;
  vus.add(item.json.offre.lien);
  uniques.push(item);
}
return uniques;`
    },
    position: [480, 140]
  },
  output: [{
    offre: {
      intitule: 'Data Analyst Junior',
      entreprise: 'Example Corp',
      lieu: 'Paris',
      source: 'Apify',
      lien: 'https://example.com/offre/1',
      datePublication: '2026-09-29',
      missions: 'Description des missions',
      competences: 'SQL, Power BI, Excel',
      remuneration: '',
      tailleEntreprise: 350,
      secteur: 'Banque',
      priorite: 'Banque / Assurance',
      correspondance: 'data analyst junior'
    },
    profil: 'Texte du profil de Samantha',
    dossierDrive: '1DossierDriveId',
    regleLieu: 'Transports en commun'
  }]
});

const saveOffer = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Enregistrer les nouvelles offres',
    notes: 'Appends one row per newly discovered offer, with the status "A examiner" and the discovery date. Written before any document generation so that an interrupted run never loses an offer.',
    notesInFlow: true,
    onError: 'continueErrorOutput',
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: SHEET_ID,
      sheetName: { __rl: true, value: 'Suivi', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          intitule: expr('{{ $json.offre.intitule }}'),
          entreprise: expr('{{ $json.offre.entreprise }}'),
          lieu: expr('{{ $json.offre.lieu }}'),
          source: expr('{{ $json.offre.source }}'),
          lien: expr('{{ $json.offre.lien }}'),
          date_publication: expr('{{ $json.offre.datePublication }}'),
          missions: expr('{{ $json.offre.missions }}'),
          competences: expr('{{ $json.offre.competences }}'),
          remuneration: expr('{{ $json.offre.remuneration }}'),
          priorite: expr('{{ $json.offre.priorite }}'),
          statut: 'A examiner',
          date_decouverte: expr('{{ $now.toISO() }}'),
          date_documents: '',
          date_envoi: '',
          date_relance: '',
          date_entretien: '',
          decision: '',
          lien_cv: '',
          lien_lettre: ''
        }
      }
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets') },
    position: [720, 140]
  },
  output: [{ number: 12 }]
});

const emailAlert = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: {
    name: 'Signaler interruption par email',
    notes: 'Sent the alert to Samantha whenever a run is interrupted. An interrupted run is never treated as complete.',
    notesInFlow: true,
    parameters: {
      fromEmail: 'n8n',
      toEmail: expr("{{ $('Lire la configuration').all().find((r) => r.json.cle === 'email_alerte')?.json.valeur }}"),
      subject: 'Recherche de candidatures interrompue',
      emailFormat: 'html',
      htmlBody: expr("<h2>La recherche de candidatures a ete interrompue.</h2><p>Offres deja enregistrees avant l'interruption : elles sont conservees dans l'onglet Suivi.</p><p>Relance manuelle : <code>n8ncli exec Recherche et suivi des candidatures</code></p>")
    },
    position: [960, 620]
  },
  output: [{}]
});

const loop = splitInBatches({
  version: 3,
  config: { name: 'Traiter chaque offre', parameters: { batchSize: 1 }, position: [960, 140] }
});

const generateDocuments = node({
  type: '@n8n/n8n-nodes-langchain.googleGemini',
  version: 1.2,
  config: {
    name: 'Generer le CV et la lettre',
    notes: 'Sends the profile and the offer to Gemini. The model must only re-use information present in the profile, never invent an experience, a skill or a diploma. Returns both documents as JSON. A failure here does not stop the run: the offer keeps its "A examiner" status in the sheet.',
    notesInFlow: true,
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'text',
      operation: 'message',
      modelId: { __rl: true, mode: 'id', value: 'models/gemini-2.5-flash' },
      messages: {
        values: [{
          role: 'user',
          content: expr('<h2>OFFRE</h2>\n{{ JSON.stringify($json.offre) }}\n\n<h2>PROFIL DE SAMANTHA</h2>\n{{ $json.profil }}\n\nRedige un CV et une lettre de motivation cibles sur cette offre. Reprends les competences et les exigences explicitement citees dans l offre. Reponds uniquement avec un objet JSON {"cv": "...", "lettre": "..."}.')
        }]
      },
      simplify: true,
      jsonOutput: true,
      options: {
        systemMessage: 'Tu es une experte francaise en candidature professionnelle. Tu rediges en francais. Tu ne dois JAMAIS inventer une experience, une competence, un diplome, une entreprise ou une information personnelle : tu reutilises uniquement les informations presentes dans le profil fourni. Tu reprends les competences et les exigences explicitement mentionnees dans l offre. Le CV est un brouillon a verifier. La lettre de motivation est structuree en trois paragraphes courts : accroche adaptee a l offre, correspondance concrete avec le profil, conclusion. Tu ne dois jamais ecrire que la candidature a ete envoyee.',
        temperature: 0.3,
        maxOutputTokens: 8000
      }
    },
    credentials: { googlePalmApi: newCredential('Google Gemini') },
    position: [1200, 140]
  },
  output: [{ cv: 'CV content', lettre: 'Lettre content' }]
});

const parseDocuments = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parser les documents generes',
    notes: 'Normalises the Gemini response into a cv and a lettre field, whatever shape the model returned, and rebuilds the file names used on Google Drive.',
    notesInFlow: true,
    parameters: {
      jsCode: `function texte(valeur) {
  if (valeur === null || valeur === undefined) return "";
  return typeof valeur === "string" ? valeur : JSON.stringify(valeur);
}

const source = $('Filtrer et dedoublonner les offres').item.json;
let brut = $json;

if (typeof brut === "string") brut = { cv: brut, lettre: "" };
if (brut && typeof brut.output === "string") {
  try { brut = JSON.parse(brut.output); } catch (e) { brut = { cv: brut.output, lettre: "" }; }
}
if (brut && typeof brut.text === "string") {
  try { brut = JSON.parse(brut.text); } catch (e) { brut = { cv: brut.text, lettre: "" }; }
}
if (brut && brut.candidates && brut.candidates[0]) {
  const bloc = brut.candidates[0].content.parts[0].text;
  try { brut = JSON.parse(bloc); } catch (e) { brut = { cv: bloc, lettre: "" }; }
}

const off = source.offre || {};
const base = [off.entreprise, off.intitule].filter(Boolean).join(" - ").replace(/[\\\\/:*?"<>|]/g, " ").trim();

return [{
  json: {
    offre: off,
    dossierDrive: source.dossierDrive,
    cv: texte(brut && (brut.cv || brut.cv_markdown || brut.cvMarkdown)),
    lettre: texte(brut && (brut.lettre || brut.letter || brut.cover_letter || brut.coverLetter)),
    nomFichierCv: base ? base + " - CV" : "CV",
    nomFichierLettre: base ? base + " - Lettre de motivation" : "Lettre de motivation"
  }
}];`
    },
    position: [1440, 140]
  },
  output: [{
    offre: { intitule: 'Data Analyst Junior', entreprise: 'Example Corp' },
    dossierDrive: '1DossierDriveId',
    cv: 'Contenu du CV',
    lettre: 'Contenu de la lettre de motivation',
    nomFichierCv: 'Example Corp - Data Analyst Junior - CV',
    nomFichierLettre: 'Example Corp - Data Analyst Junior - Lettre de motivation'
  }]
});

const filterGenerated = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: {
    name: 'Ecarter les generations vides',
    notes: 'Keeps only the offers for which Gemini actually returned a CV. An offer whose generation failed stays at the status "A examiner" in the sheet, so it is never silently lost.',
    notesInFlow: true,
    parameters: {
      conditions: {
        options: { caseSensitive: true, typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.cv }}'), operator: { type: 'string', operation: 'notEmpty' } }],
        combinator: 'and'
      }
    },
    position: [1680, 140]
  },
  output: [{ offre: { intitule: 'Data Analyst Junior' }, dossierDrive: '1DossierDriveId', cv: 'Contenu du CV', lettre: 'Contenu de la lettre', nomFichierCv: 'CV', nomFichierLettre: 'Lettre' }]
});

const saveCvToDrive = node({
  type: 'n8n-nodes-base.googleDrive',
  version: 3,
  config: {
    name: 'Enregistrer le CV sur Drive',
    notes: 'Creates the personalised CV in the Drive folder configured in the Config sheet.',
    notesInFlow: true,
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'file',
      operation: 'createFromText',
      name: expr('{{ $json.nomFichierCv }}'),
      content: expr('{{ $json.cv }}'),
      folderId: { __rl: true, mode: 'id', value: expr('{{ $json.dossierDrive }}') }
    },
    credentials: { googleDriveOAuth2Api: newCredential('Google Drive') },
    position: [1680, 60]
  },
  output: [{ id: '1AbCdEf' }]
});

const saveLetterToDrive = node({
  type: 'n8n-nodes-base.googleDrive',
  version: 3,
  config: {
    name: 'Enregistrer la lettre sur Drive',
    notes: 'Creates the personalised cover letter in the same Drive folder, next to the CV.',
    notesInFlow: true,
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'file',
      operation: 'createFromText',
      name: expr("{{ $('Parser les documents generes').item.json.nomFichierLettre }}"),
      content: expr("{{ $('Parser les documents generes').item.json.lettre }}"),
      folderId: { __rl: true, mode: 'id', value: expr("{{ $('Parser les documents generes').item.json.dossierDrive }}") }
    },
    credentials: { googleDriveOAuth2Api: newCredential('Google Drive') },
    position: [1920, 60]
  },
  output: [{ id: '1GhIjKl' }]
});

const updateTracking = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Mettre a jour le suivi',
    notes: 'Updates the row created earlier, matched on the offer link: status becomes "Candidature a envoyer" and the two Drive links are added. The application, follow-up and interview dates are left empty on purpose, Samantha fills them in.',
    notesInFlow: true,
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'sheet',
      operation: 'update',
      documentId: SHEET_ID,
      sheetName: { __rl: true, value: 'Suivi', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          statut: 'Candidature a envoyer',
          date_documents: expr('{{ $now.toISO() }}'),
          lien_cv: expr("https://drive.google.com/file/d/{{ $('Enregistrer le CV sur Drive').item.json.id }}/view"),
          lien_lettre: expr("https://drive.google.com/file/d/{{ $('Enregistrer la lettre sur Drive').item.json.id }}/view")
        },
        matchingColumns: ['lien']
      }
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets') },
    position: [2160, 140]
  },
  output: [{ number: 12 }]
});

const writeJournal = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Journaliser la fin du run',
    notes: 'Writes a "TERMINE" line in the Journal sheet once every offer has been processed. If the run is interrupted this line is never written, which is how an incomplete run stays visible.',
    notesInFlow: true,
    executeOnce: true,
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: SHEET_ID,
      sheetName: { __rl: true, value: 'Journal', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          date_fin: expr('{{ $now.toISO() }}'),
          statut: 'TERMINE',
          offres_traitees: expr('{{ $("Filtrer et dedoublonner les offres").all().length }}')
        }
      }
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets') },
    position: [1680, 300]
  },
  output: [{ number: 3 }]
});

const noteConfiguration = sticky(
  '## Configuration requise\n\n**Onglet `Config`** (colonnes `cle` / `valeur`, une ligne par cle) :\n\n| cle | valeur |\n|---|---|\n| `profil` | Texte du CV source de Samantha (Markdown) |\n| `dossier_drive` | ID du dossier Google Drive de destination |\n| `email_alerte` | Adresse de Samantha pour les alertes |\n| `apify_actor_id` | Ex. `monacteur/job-search` |\n| `apify_token` | Jeton Apify |\n\n**Onglet `Suivi`** : entetes `intitule, entreprise, lieu, source, lien, date_publication, missions, competences, remuneration, priorite, statut, date_decouverte, date_documents, date_envoi, date_relance, date_entretien, decision, lien_cv, lien_lettre`.\nLa colonne `lien` sert de cle unique pour le deduplonnage et la mise a jour.\n\n**Onglet `Journal`** : entetes `date_fin, statut, offres_traitees`.\n\n**A adapter** : le corps envoye a Apify (`searchTerms`, `location`, `maxItems`) doit correspondre au schema d entree de votre acteur.\n\n**Declenchement manuel** : le workflow est actif, mais pour le forcer : `n8ncli exec "Recherche et suivi des candidatures"`.',
  [scheduleTrigger, readConfig, prepareSearch, apifySearch, filterOffers, saveOffer, loop, generateDocuments, parseDocuments, saveCvToDrive, saveLetterToDrive, updateTracking, writeJournal, emailAlert, readTracking],
  { color: 2 }
);

const noteConfidentialite = sticky(
  '## Confidentialite\n\nLes donnees de suivi, les CV et les lettres sont **personnels et confidentiels**.\n\n- Aucun partage automatique n est configure.\n- Le dossier Drive doit rester en acces restreint (personne uniquement).\n- Ce workflow **n envoie jamais** de candidature : il produit uniquement des brouillons.\n- Samantha postule elle-meme et met a jour manuellement `statut`, `date_envoi`, `date_relance`, `date_entretien` et `decision`.\n\n## Statuts\n\n`A examiner` -> `CV et lettre a preparer` -> `Candidature a envoyer` -> `Candidature envoyee` -> `Relance a faire` -> `Entretien` -> `Decision`\n\nLe workflow pose automatiquement les deux premiers libelles. Les suivants sont poses a la main.',
  [saveCvToDrive, saveLetterToDrive, updateTracking],
  { color: 4 }
);

const noteFiltrage = sticky(
  '## Regles de filtrage appliquees\n\n- **Intitules** : les 15 titles cibles, ou un titre proche (`analyst`, `consultant`, `product owner`, `master data`) dont les missions correspondent.\n- **Secteurs** : banque et assurance = priorite, jamais un filtre.\n- **Taille** : >= 200 salaries = priorite. Une taille inconnue ne fait pas exclure l offre.\n- **Lieux** : Paris / Lyon / Montpellier (transports en commun), Marseille (1h en voiture), ou teletravail / hybride.\n- **Remuneration** : une offre sans salaire n est **jamais** exclue.\n- **Doublons** : une offre dont le `lien` figure deja dans `Suivi` est ignoree.\n\nSi aucune offre ne correspond, la chaine s arrete proprement : rien n est ecrit, la prochaine execution repart normalement.',
  [filterOffers],
  { color: 3 }
);

const wf = workflow('RbgDG4NydtbF0SGx', 'Recherche et suivi des candidatures', {
  description: 'Recherche automatiquement les offres deux fois par jour via Apify, les filtre selon le profil de Samantha, genere avec Gemini un CV et une lettre de motivation par offre, conserve les documents sur Google Drive et centralise le suivi dans Google Sheets. Le workflow n envoie jamais de candidature.',
  executionOrder: 'v1',
  binaryMode: 'separate',
  availableInMCP: true
});

export default wf
  .add(scheduleTrigger
    .to([
      readConfig.to(prepareSearch).to(apifySearch).to(filterOffers).to(saveOffer).to(loop),
      readTracking
    ])
  )
  .add(loop
    .onEachBatch(
      generateDocuments
        .to(parseDocuments)
        .to(filterGenerated)
        .to(saveCvToDrive)
        .to(saveLetterToDrive)
        .to(updateTracking)
        .to(nextBatch(loop))
    )
    .onDone(writeJournal)
  )
  .add(apifySearch.onError(emailAlert))
  .add(saveOffer.onError(emailAlert))
  .add(noteConfiguration)
  .add(noteFiltrage)
  .add(noteConfidentialite);
