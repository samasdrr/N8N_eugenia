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
    notes: 'Chaque question est traitee isolement : pas de memoire conversationnelle, la chaine part du trigger et se termine sur la reponse.',
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
      prompt: expr('{{ $json.chatInput }}'),
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
        'select $1 as question, coalesce(json_agg(t), \'[]\'::json) as hits\n' +
        'from (\n' +
        '  select id,\n' +
        '         left(content, 1200) as extrait,\n' +
        "         ts_rank(tsv, websearch_to_tsquery('french', $1)) as rang,\n" +
        "         array_to_string(keywords, ', ') as mots_cles\n" +
        '  from documents_bourdieu\n' +
        "  where tsv @@ websearch_to_tsquery('french', $1)\n" +
        '  order by rang desc\n' +
        '  limit 6\n' +
        ') t;',
      options: { queryReplacement: expr('{{ $json.chatInput }}') },
    },
    credentials: { postgres: newCredential('Postgres account') },
    notes: 'Mots cles en complement du vecteur : la similarite rate les chaines de caracteres et les formulations atypiques, la recherche lexicale les rattrape. La colonne tsv est stockee et indexee par la migration 002 : la requete passe par l index GIN au lieu de recalculer un tsvector sur chaque ligne a chaque question. La question passe par $1 et non par une concatenation, donc aucune injection possible. json_agg garantit un seul resultat quel que soit le nombre de hits.',
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
        '// Deux listes arrivent : les chunks vecteurs, et les hits lexicaux qui reviennent\n' +
        '// sous forme d un seul item contenant un tableau. On les fusionne, on dedoublonne,\n' +
        '// et un passage trouve par les deux voies est signale comme tel : c est le signal\n' +
        '// de confiance le plus fort dont on dispose ici.\n' +
        'const items = $input.all();\n' +
        '// La question vient du trigger, mais l item qui porte les hits est celui de la\n' +
        '// requete SQL : on la cherche dans tous les items, puis on se rabat sur la copie\n' +
        '// que la requete renvoie dans sa colonne question.\n' +
        "let question = '';\n" +
        'for (const it of items) {\n' +
        "  if (it.json && it.json.chatInput) { question = String(it.json.chatInput); break; }\n" +
        '}\n' +
        "if (!question && items[0] && items[0].json && items[0].json.question) question = String(items[0].json.question);\n" +
        'const VEC = [];\n' +
        'const LEX = [];\n' +
        '\n' +
        'for (const it of items) {\n' +
        '  const j = it.json || {};\n' +
        '  if (Array.isArray(j.hits)) {\n' +
        '    for (const h of j.hits) {\n' +
        '      if (h && h.extrait) LEX.push({ id: h.id != null ? h.id : null, texte: String(h.extrait), motsCles: h.mots_cles || null });\n' +
        '    }\n' +
        '    continue;\n' +
        '  }\n' +
        '  const doc = j.document || j;\n' +
        '  const meta = doc.metadata || j.metadata || {};\n' +
        "  const texte = doc.pageContent || doc.text || j.pageContent || j.text || j.content || '';\n" +
        "  if (texte) VEC.push({ id: meta.id != null ? meta.id : null, texte: String(texte), ouvrage: meta.ouvrage || null });\n" +
        '}\n' +
        '\n' +
        '// Les chunks vectoriels ne portent pas l id de ligne : on dedoublonne sur un\n' +
        '// prefixe du texte, largement suffisant puisque les deux listes viennent du meme\n' +
        '// texte source.\n' +
        "const cle = (t) => t.replace(/\\s+/g, ' ').slice(0, 200);\n" +
        'const vusLex = new Set();\n' +
        'const passages = [];\n' +
        'const touches = new Set();\n' +
        '\n' +
        'for (const v of VEC) {\n' +
        '  const k = cle(v.texte);\n' +
        '  touches.add(k);\n' +
        "  passages.push({ origine: 'semantique', id: v.id, ouvrage: v.ouvrage, texte: v.texte });\n" +
        '}\n' +
        'for (const l of LEX) {\n' +
        '  const k = cle(l.texte);\n' +
        '  if (touches.has(k)) {\n' +
        '    const dejaLa = passages.find((p) => cle(p.texte) === k);\n' +
        "    if (dejaLa) dejaLa.origine = 'les deux';\n" +
        '    continue;\n' +
        '  }\n' +
        "  passages.push({ origine: 'mots-cles', id: l.id, ouvrage: null, motsCles: l.motsCles, texte: l.texte });\n" +
        '}\n' +
        '\n' +
        'const retenus = passages.slice(0, 8);\n' +
        'return [{\n' +
        '  json: {\n' +
        '    question,\n' +
        '    nbSemantique: VEC.length,\n' +
        '    nbMotsCles: LEX.length,\n' +
        '    nbPassages: retenus.length,\n' +
        '    semantiqueDisponible: VEC.length > 0,\n' +
        '    passages: retenus.map((p, i) => ({ n: i + 1, origine: p.origine, id: p.id, ouvrage: p.ouvrage, motsCles: p.motsCles || null, texte: p.texte }))\n' +
        '  }\n' +
        '}];',
    },
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
        '// On assemble ici le message utilisateur : la question, puis les passages\n' +
        '// numerotes. La consigne de systeme reste portee par le noeud du LLM.\n' +
        'const d = $input.first().json;\n' +
        '\n' +
        "let corps = 'Question : ' + (d.question || '(question vide)') + '\\n\\n';\n" +
        'if (!d.passages || !d.passages.length) {\n' +
        "  corps += 'Aucun extrait trouve dans la base pour cette question.';\n" +
        '} else {\n' +
        "  corps += 'Extraits de L Esprit des lois :\\n\\n';\n" +
        '  for (const p of d.passages) {\n' +
        "    const src = p.origine === 'les deux' ? 'semantique + mots-cles' : p.origine;\n" +
        "    corps += '[' + p.n + '] (retrieval ' + src + (p.ouvrage ? ', ouvrage ' + p.ouvrage : '') + ')\\n';\n" +
        "    corps += p.texte + '\\n\\n';\n" +
        '  }\n' +
        "  corps += 'Reponds en citant les numeros entre crochets, par exemple [2].';\n" +
        '}\n' +
        '\n' +
        "// Si la voie vectorielle n'a rien fourni, on le dit dans la reponse : mieux vaut\n" +
        '// un utilisateur qui voit la degradation qu un silence qui laisse croire a une\n' +
        '// recherche complete.\n' +
        "if (d.semantiqueDisponible === false) {\n" +
        "  corps += '\\n\\nNote technique : la recherche par vecteurs est indisponible. Cette reponse n utilise que la recherche par mots-cles et peut donc manquer des passages.';\n" +
        '}\n' +
        '\n' +
        'return [{ json: { question: d.question, prompt: corps, nbPassages: d.nbPassages } }];',
    },
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
    notes: 'Aucun sous-noeud memoire : la question est traitee seule, sans historique.',
    subnodes: { model: model_gemini },
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
        assignments: [{ id: 'sortie-chat', name: 'output', value: expr('{{ $json.text }}'), type: 'string' }],
      },
      options: {},
    },
    notes: 'Le widget de chat attend { output }. Le noeud chainLlm sort { text } : la conversion est donc necessaire.',
  },
});

export default workflow('chat-essai-rag', 'Chat_Essai_RAG', { executionOrder: 'v1', availableInMCP: true })
  .add(chat_trigger)
  .to(recherche_semantique)
  .to(recherche_mots_cles)
  .to(fusion_hybride)
  .to(construction_prompt)
  .to(redaction_gemini)
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
