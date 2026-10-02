const chat_trigger = trigger({
  type: '@n8n/n8n-nodes-langchain.chatTrigger',
  version: 1.1,
  config: {
    name: 'Chat Montesquieu',
    position: [0, 0],
    parameters: {
      public: true,
      mode: 'hostedChat',
      authentication: 'none',
      initialMessages: 'Posez une question sur L Esprit des lois de Montesquieu.',
      options: {
        responseMode: 'lastNode',
        title: 'Montesquieu',
        subtitle: 'Questions sur L Esprit des lois, edition Garnier 1875',
        inputPlaceholder: 'Votre question...',
        showWelcomeScreen: false,
        loadPreviousSession: 'notSupported',
      },
    },
    notes: 'Le contexte de conversation est reconstruit par le noeud Historique de conversation, puis injecte dans le prompt. Le widget ne rehydrate pas l historique au rechargement, le fil se lit de haut en bas.',
  },
});

const embeddings_gemini = embedding({
  type: '@n8n/n8n-nodes-langchain.embeddingsGoogleGemini',
  version: 1,
  config: {
    name: 'Gemini Embeddings',
    position: [260, 200],
    notes: 'Aucun modele en dur, exactement comme a l ingestion : c est le modele par defaut du noeud qui produit des vecteurs compatibles avec la colonne vector(3072). Changer ce modele ici rendrait la recherche silencieusement fausse.',
  },
});

const model_gemini = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  version: 1,
  config: {
    name: 'Gemini 2.5 Flash',
    position: [1180, 220],
    parameters: { modelName: 'models/gemini-2.5-flash', options: { temperature: 0.2 } },
    notes: 'Temperature basse : sur un question-reponse appuye sur des extraits, un modele creatif invente. Le credential googlePalmApi est facultatif, la cle est injectee par le credits gateway.',
  },
});

const recherche_semantique = vectorStore({
  type: '@n8n/n8n-nodes-langchain.vectorStorePGVector',
  version: 1.3,
  config: {
    name: 'Recherche semantique',
    position: [240, 0],
    parameters: {
      mode: 'load',
      tableName: 'documents_bourdieu',
      prompt: "={{ $json.chatInput || $('Chat Montesquieu').item.json.chatInput }}",
      topK: 6,
      includeDocumentMetadata: true,
      options: {
        columnNames: {
          values: {
            idColumnName: 'id',
            vectorColumnName: 'embedding',
            contentColumnName: 'content',
            metadataColumnName: 'metadata',
          },
        },
      },
    },
    credentials: { postgres: newCredential('Postgres account') },
    notes: 'Recherche par similarite cosinus en mode load : la requete part du flux principal, pas d un outil que l agent choisit lui-meme. contentColumnName doit rester "content", le defaut LangChain etant "text". onError continueRegularOutput : si le service d embeddings est indisponible, la chaine repart sur la recherche par mots-cles au lieu de tomber. Le noeud Fusion signale alors la degradation dans la reponse.',
    onError: 'continueRegularOutput',
    subnodes: { embedding: embeddings_gemini },
  },
});

const recherche_mots_cles = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Recherche par mots cles',
    position: [480, 0],
    parameters: {
      operation: 'executeQuery',
      resource: 'database',
      query:
        'with ns as (\n  select distinct u.lexeme\n  from unnest(to_tsvector(\'french\', $1)) as u(lexeme, positions, weights)\n),\nfreq as (\n  select ns.lexeme,\n         (select count(*) from documents_bourdieu d2\n           where d2.tsv @@ to_tsquery(\'french\', ns.lexeme)) as n\n  from ns\n),\ntot as (select count(*) as total from documents_bourdieu),\nq as (\n  select coalesce(\n           (select array_to_string(array_agg(lexeme order by n), \' | \')\n              from freq where n * 5 <= (select total from tot)),\n           (select array_to_string(array_agg(lexeme), \' | \') from freq)\n         ) as orq\n  from tot\n)\nselect $1 as question, coalesce(json_agg(t), \'[]\'::json) as hits\nfrom (\n  select d.id,\n         left(d.content, 1200) as extrait,\n         ts_rank(d.tsv, to_tsquery(\'french\', q.orq)) as rang,\n         array_to_string(d.keywords, \', \') as mots_cles,\n         row_number() over (\n           order by ts_rank(d.tsv, to_tsquery(\'french\', q.orq)) desc\n         ) as position\n  from documents_bourdieu d, q\n  where d.tsv @@ to_tsquery(\'french\', q.orq)\n  order by rang desc\n  limit 6\n) t;',
      options: { queryReplacement: "={{ $json.chatInput || $('Chat Montesquieu').item.json.chatInput }}" },
    },
    credentials: { postgres: newCredential('Postgres account') },
    notes: 'Mots cles en complement du vecteur : la similarite rate les chaines de caracteres et les formulations atypiques, la recherche lexicale les rattrape. La colonne tsv est stockee et indexee par la migration 002 : la requete passe par l index GIN au lieu de recalculer un tsvector sur chaque ligne a chaque question. La question passe par $1 et non par une concatenation, donc aucune injection possible. json_agg garantit un seul resultat quel que soit le nombre de hits.',
  },
});

const historique_conversation = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Historique de conversation',
    position: [240, -200],
    parameters: {
      operation: 'executeQuery',
      resource: 'database',
      query:
        'select coalesce(json_agg(t order by t.ts, t.id), \'[]\'::json) as tours\n' +
        'from (\n' +
        '  select role, contenu, ts, id\n' +
        '  from conversations\n' +
        '  where session_id = $1\n' +
        '  order by ts desc, id desc\n' +
        '  limit 6\n' +
        ') t;',
      options: { queryReplacement: "={{ $json.sessionId || $('Chat Montesquieu').item.json.sessionId }}" },
    },
    credentials: { postgres: newCredential('Postgres account') },
    notes: 'Les six derniers tours de la session, lus dans la table conversations. La session vient du Chat Trigger, donc chaque visiteur a son propre fil. Les questions et reponses precedentes sont reinjectees dans le prompt : sans cela, un suivi comme "et pourquoi ?" n aurait aucun passage pertinent a retrouver et le modele repondrait qu il ne trouve rien.',
  },
});

const fusion_hybride = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Fusion hybride',
    position: [720, 0],
    parameters: {
      jsCode:
        '// Deux listes arrivent : les chunks vecteurs, et les hits lexicaux qui reviennent\n// sous forme d un seul item contenant un tableau.\n//\n// On ne peut pas classer les deux listes ensemble sur leurs scores : la similarite\n// cosinus et le ts_rank ne sont pas sur la meme echelle. Le reciprocal rank fusion\n// contourne le probleme en ne regardant que la POSITION de chaque document dans\n// chaque liste :\n//\n//     score(d) = somme de 1 / (60 + position) sur chaque liste ou d apparait\n//\n// Un document trouve par les deux voies cumule deux termes et remonte donc tout seul.\n// La constante 60 est la valeur classique de l article de reference : elle evite qu un\n// simple premier de liste ecrase un document bien classe dans l autre.\nconst K = 60;\n\nconst items = $input.all();\n// La question vient du trigger, mais l item qui porte les hits est celui de la requete\n// SQL : on la cherche dans tous les items, puis on se rabat sur la copie que la\n// requete renvoie dans sa colonne question.\nlet question = \'\';\nfor (const it of items) {\n  if (it.json && it.json.chatInput) { question = String(it.json.chatInput); break; }\n}\nif (!question) { for (const it of items) { if (it.json && it.json.question) { question = String(it.json.question); break; } } }\n\nconst VEC = [];\nconst LEX = [];\nfor (const it of items) {\n  const j = it.json || {};\n  if (Array.isArray(j.hits)) {\n    j.hits.forEach((h, i) => {\n      if (h && h.extrait) {\n        LEX.push({\n          id: h.id != null ? h.id : null,\n          texte: String(h.extrait),\n          motsCles: h.mots_cles || null,\n          origine: \'mots-cles\',\n          position: h.position || i + 1,\n        });\n      }\n    });\n    continue;\n  }\n  const doc = j.document || j;\n  const meta = doc.metadata || j.metadata || {};\n  const texte = doc.pageContent || doc.text || j.pageContent || j.text || j.content || \'\';\n  if (texte) {\n    VEC.push({\n      id: meta.id != null ? meta.id : null,\n      texte: String(texte),\n      ouvrage: meta.ouvrage || null,\n      origine: \'semantique\',\n      position: VEC.length + 1,\n    });\n  }\n}\n\n// Les chunks vectoriels ne portent pas l id de ligne : un passage est identifie par un\n// prefixe de son texte, largement suffisant puisque les deux listes viennent du meme\n// texte source.\nconst cle = (t) => t.replace(/\\s+/g, \' \').slice(0, 200);\n\nconst parCle = new Map();\nfunction accumuler(doc) {\n  const k = cle(doc.texte);\n  let p = parCle.get(k);\n  if (!p) {\n    p = {\n      texte: doc.texte,\n      id: doc.id != null ? doc.id : null,\n      ouvrage: doc.ouvrage || null,\n      motsCles: doc.motsCles || null,\n      origines: [],\n      positions: {},\n      score: 0,\n    };\n    parCle.set(k, p);\n  }\n  p.score += 1 / (K + doc.position);\n  p.origines.push(doc.origine);\n  p.positions[doc.origine] = doc.position;\n  if (p.id == null && doc.id != null) p.id = doc.id;\n  if (p.ouvrage == null && doc.ouvrage && doc.origine === \'semantique\') p.ouvrage = doc.ouvrage;\n  if (p.motsCles == null && doc.motsCles) p.motsCles = doc.motsCles;\n}\n\nfor (const d of VEC) accumuler(d);\nfor (const d of LEX) accumuler(d);\n\nconst classes = [...parCle.values()].sort((a, b) => b.score - a.score).slice(0, 8);\n\nconst passages = classes.map((p, i) => ({\n  n: i + 1,\n  origine: p.origines.length > 1 ? \'les deux\' : p.origines[0],\n  score: Math.round(p.score * 10000) / 10000,\n  positions: p.positions,\n  id: p.id,\n  ouvrage: p.ouvrage,\n  motsCles: p.motsCles,\n  texte: p.texte,\n}));\n\nreturn [{\n  json: {\n    question,\n    nbSemantique: VEC.length,\n    nbMotsCles: LEX.length,\n    nbPassages: passages.length,\n    nbFuscules: classes.filter((p) => p.origines.length > 1).length,\n    semantiqueDisponible: VEC.length > 0,\n    passages,\n  },\n}];'},
    notes: 'Fusion semantique + lexicale, dedup, plafond de 8 passages. Le champ origine indique au modele par quelle voie un passage est sorti.',
  },
});

const construction_prompt = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Construction du prompt',
    position: [960, 0],
    parameters: {
      jsCode:
        '// On assemble ici le message utilisateur : l historique de la conversation, puis la\n// question, puis les passages numerotes. La consigne de systeme reste portee par le\n// noeud du LLM.\n//\n// L historique est lu par reference de noeud et non sur l item courant : la recherche\n// vectorielle fabrique ses propres items et ne relaie pas les donnees du trigger.\nconst d = $input.first().json;\nconst historique = $(\'Historique de conversation\').first().json;\nconst tours = (historique && historique.tours) || [];\n\nlet corps = \'\';\nif (tours.length) {\n  corps += \'Historique de la conversation (le plus ancien en premier) :\\n\';\n  for (const t of tours) {\n    corps += (t.role === \'user\' ? \'Visiteur\' : \'Assistant\') + \' : \' + String(t.contenu || \'\').slice(0, 400) + \'\\n\';\n  }\n  corps += \'\\n\';\n}\n\ncorps += \'Question : \' + (d.question || \'(question vide)\') + \'\\n\\n\';\n\nif (!d.passages || !d.passages.length) {\n  corps += \'Aucun extrait trouve dans la base pour cette question.\';\n} else {\n  corps += \'Extraits de L Esprit des lois :\\n\\n\';\n  for (const p of d.passages) {\n    const src = p.origine === \'les deux\' ? \'semantique + mots-cles\' : p.origine;\n    corps += \'[\' + p.n + \'] (retrieval \' + src + (p.ouvrage ? \', ouvrage \' + p.ouvrage : \'\') + \')\\n\';\n    corps += p.texte + \'\\n\\n\';\n  }\n  corps += \'Reponds en citant les numeros entre crochets, par exemple [2].\';\n}\n\n// Si la voie vectorielle n\'a rien fourni, on le dit dans la reponse : mieux vaut\n// un utilisateur qui voit la degradation qu un silence qui laisse croire a une\n// recherche complete.\nif (d.semantiqueDisponible === false) {\n  corps += \'\\n\\nNote technique : la recherche par vecteurs est indisponible. Cette reponse n utilise que la recherche par mots-cles et peut donc manquer des passages.\';\n}\n\nreturn [{ json: { question: d.question, prompt: corps, nbPassages: d.nbPassages, toursReinjectes: tours.length } }];'},
    notes: 'Isoler la construction du prompt rend la chaine debuggable : on lit les passages retenus dans les executions sans passer par le modele.',
  },
});

const redaction_gemini = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.7,
  config: {
    name: 'Redaction Gemini',
    position: [1200, 0],
    parameters: {
      promptType: 'define',
      text: expr('{{ $json.prompt }}'),
      hasOutputParser: false,
      messages: {
        messageValues: [
          {
            type: 'SystemMessagePromptTemplate',
            message:
              "Tu reponds uniquement a partir des extraits fournis, qui viennent de L Esprit des lois de Montesquieu (edition Garnier 1875). Regles : (1) n utilise aucune autre source, meme si tu connais le texte par coeur ; (2) si la reponse n est pas dans les extraits, dis-le franchement et ne complete pas ; (3) cite chaque affirmation avec le numero du passage entre crochets, par exemple [3] ; (4) francais, ton neutre, pas de preambule ni de reformulation de la question ; (5) n invente jamais une citation ni un numero de page, les extraits ne contiennent pas de pagination fiable.",
          },
        ],
      },
    },
    notes: 'chainLlm v1.7 n accepte pas de sous-noeud memoire : le contexte de conversation arrive donc par le prompt, construit en amont a partir de l historique lu en base.',
    subnodes: { model: model_gemini },
  },
});

const preparer_enregistrement = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Preparer l enregistrement',
    position: [1440, 160],
    parameters: {
      jsCode:
        '// Le noeud insert du Postgres exige ici une forme de resource mapper refusee par le\n// validateur, et queryReplacement coupe les valeurs sur les virgules : impossible\n// d y faire passer une reponse en clair. On construit donc le INSERT ici, en\n// doublant les apostrophes, seule donnee a proteger : la connexion utilise\n// standard_conforming_strings, donc un backslash reste un caractere ordinaire.\nconst sessionId = $(\'Chat Montesquieu\').item.json.sessionId || \'inconnue\';\nconst question = String($(\'Construction du prompt\').item.json.question || \'\');\nconst reponse = String($(\'Redaction Gemini\').item.json.text || \'\');\nconst lit = (v) => "\'" + String(v).replace(/\'/g, "\'\'") + "\'";\nconst sql =\n  \'insert into conversations (session_id, role, contenu) values \' +\n  \'(\' + [lit(sessionId), lit(\'user\'), lit(question)].join(\', \') + \'), \' +\n  \'(\' + [lit(sessionId), lit(\'assistant\'), lit(reponse)].join(\', \') + \');\';\nreturn [{ json: { sql, sessionId, question, longueurReponse: reponse.length } }];'},
    notes: 'Un tour = deux lignes : la question, puis la reponse. Les apostrophes sont doublees, ce qui ferme le seul risque d injection.',
  },
});

const enregistrer_le_tour = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Enregistrer le tour',
    position: [1680, 160],
    parameters: {
      operation: 'executeQuery',
      resource: 'database',
      query: '{{ $json.sql }}',
      options: {},
    },
    credentials: { postgres: newCredential('Postgres account') },
    notes: 'Ecriture du tour avant la mise en forme de la reponse : le widget de chat affiche le dernier noeud du flux, un insert apres la mise en forme masquerait la reponse.',
  },
});

const formater_la_reponse = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Reponse pour le chat',
    position: [1440, 0],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          {
            id: 'sortie-chat',
            name: 'output',
            value: "={{ $('Redaction Gemini').item.json.text || $json.text || 'Reponse indisponible.' }}",
            type: 'string',
          },
        ],
      },
      options: {},
    },
    notes: 'Le widget de chat attend { output }. Le texte est lu au noeud LLM et non sur l item courant : l item qui arrive ici est le resultat de l enregistrement du tour, qui ne porte pas la reponse. Le repli evite un widget vide si le LLM a echoue.',
  },
});

export default workflow('chat-essai-rag', 'Chat_Essai_RAG', { executionOrder: 'v1', availableInMCP: true })
  .add(chat_trigger)
  .to(historique_conversation)
  .to(recherche_semantique)
  .to(recherche_mots_cles)
  .to(fusion_hybride)
  .to(construction_prompt)
  .to(redaction_gemini)
  .to(preparer_enregistrement)
  .to(enregistrer_le_tour)
  .to(formater_la_reponse)
  .add(
    sticky(
      '## Ce que fait ce workflow\n\n**Recherche hybride, reponse Gemini.** Une question arrive du chat\n' +
        'integre, elle part sur deux voies, les resultats sont fusionnes, et Gemini repond\n' +
        'uniquement a partir des passages retenus.\n\n' +
        '```\n' +
        'Chat Montesquieu\n' +
        '  -> Recherche semantique   (PGVector, cosinus, topK 6)\n' +
        '  -> Recherche par mots cles (Postgres, tsvector french, limite 6)\n' +
        '  -> Fusion hybride        (dedup, plafond 8, marque les hits doubles)\n' +
        '  -> Construction du prompt (passages numerotes)\n' +
        '  -> Redaction Gemini      (2.5 flash, temperature 0.2, sans memoire)\n' +
        '  -> Reponse pour le chat  ({ output })\n' +
        '```\n\n' +
        '**Pourquoi deux voies.** Le vecteur trouve les reformulations mais rate les chaines\n' +
        'de caracteres et les formulations atypiques. La recherche lexicale fait l inverse.\n' +
        'Un passage trouve par les deux est le signal de confiance le plus fort : il est\n' +
        'marque `les deux` et le modele le voit dans le prompt.',
      [],
      { name: 'Sticky Note 1a2b3c', color: 4, width: 620, height: 400, position: [-660, 40] },
    ),
  )
  .add(
    sticky(
      '## Pieges connus\n\n' +
        '- **Le modele d embeddings ne doit pas changer.** Il doit rester celui du noeud par\n' +
        '  defaut, comme a l ingestion. Un autre modele donne des vecteurs non comparables et\n' +
        '  la recherche renvoie des hasards, sans erreur visible.\n' +
        '- **`contentColumnName` doit valoir `content`.** Le store LangChain vise `text` par\n' +
        '  defaut ; sans cet override dans les options du noeud, la lecture echoue sur une\n' +
        '  colonne inexistante.\n' +
        '- **La table est partagee** avec `Essai_RAG`. Une ingestion ajoute des chunks, elle\n' +
        '  ne remplace rien : relancer le formulaire sans vider la table duplique le livre.\n' +
        '- **Une ligne porte encore `ouvrage = livre`.** Residu du run en mode test, garde\n' +
        '  volontairement : c est le meme livre, seul le libelle est faux. Sans impact tant\n' +
        '  qu on ne filtre pas par ouvrage.\n' +
        '- **La config `french` doit exister** sur la base, sinon le noeud de recherche\n' +
        '  lexicale echoue. Le repli consiste a passer la clause where en `content ilike`.\n' +
        '- **`chatInput` porte la question.** En mode webhook le champ est different, les\n' +
        '  expressions seraient a reprendre.',
      [],
      { name: 'Sticky Note 4d5e6f', width: 620, height: 400, position: [-660, 480] },
    ),
  );
