// Holocene rule (classic script; exposes window.RULE): how a realm is governed. Twenty-four forms of government, a
// hundred laws in twelve fields, the seven estates of a realm (who holds power, how content each is), authority (what a
// ruler has to spend on change), reforms that take years, what estates demand and what they do when refused.
// Pure tables and arithmetic: the simulation calls step() once a year for every realm and reads the factors it leaves
// (f: taxes, stability, strength in arms ...). What a realm has chosen lives on the realm (civ.rule) and is saved with it.
window.RULE = (function () {
  'use strict';
  // How long matters of state take, by age, in years: a reform, a change of heart, how often an estate acts. It is
  // also the length of a turn (main.js takes it from here), so that in every age a reform is the work of a turn or two.
  const PACE = [200, 100, 50, 50, 40, 20, 10, 5, 5];
  // authority: the most a ruler can hold, and how much a steady realm gathers in a turn of its age (a state of the later ages
  // can change more, and has more that wants changing)
  const AUTH_MAX = 150, AUTH_TURN = [10, 10, 10, 11, 12, 14, 18, 24, 28];

  // ---------- the estates ----------
  // who they are, age by age, and what the realm gets from them when they are content (and loses when they are not)
  const ESTATES = [
    { key: 'nobles', names: ['Clan heads', 'Nobles', 'Nobles', 'Nobles', 'Nobles', 'Nobles', 'Landowners', 'Old families', 'Old families'], note: 'hold the land and lead in war', lever: 'strength', k: 0.14, tone: '#C9A25E' },
    { key: 'priests', names: ['Shamans', 'Priests', 'Priests', 'Priests', 'Clergy', 'Clergy', 'Clergy', 'Clergy', 'Clergy'], note: 'speak for the gods', lever: 'stab', k: 0.10, tone: '#E8E4D8' },
    { key: 'merchants', names: ['Traders', 'Traders', 'Merchants', 'Merchants', 'Merchants', 'Merchants', 'Industrialists', 'Business', 'Business'], note: 'carry goods and lend coin', lever: 'trade', k: 0.24, tone: '#F2CF5B' },
    { key: 'artisans', names: ['Craftsmen', 'Craftsmen', 'Craftsmen', 'Townsfolk', 'Townsfolk', 'Townsfolk', 'Workers', 'Workers', 'Workers'], note: 'make things in the towns', lever: 'work', k: 0.20, tone: '#F0A24A' },
    { key: 'farmers', names: ['Hunters and farmers', 'Farmers', 'Farmers', 'Farmers', 'Peasants', 'Peasants', 'Farmers', 'Farmers', 'Farmers'], note: 'feed everyone else', lever: 'food', k: 0.10, tone: '#7BD36B' },
    { key: 'soldiers', names: ['Warriors', 'Warriors', 'Warriors', 'Soldiers', 'Soldiers', 'Soldiers', 'The army', 'The army', 'The army'], note: 'bear arms for the realm', lever: 'strength', k: 0.22, tone: '#E45B5B' },
    { key: 'scholars', names: ['The wise', 'Scribes', 'Scribes', 'Scholars', 'Scholars', 'Scholars', 'The educated', 'The educated', 'The educated'], note: 'keep the records and the learning', lever: 'research', k: 0.18, tone: '#5DA9F5' },
  ];
  const NE = ESTATES.length; const EK = {}; ESTATES.forEach((e, i) => { EK[e.key] = i; });
  // how much the old landed families count for, age by age; and how much the learned do, whatever else is true
  const NOBLE_AGE = [0.7, 1, 1, 1, 1, 0.9, 0.6, 0.35, 0.25], LEARNED_AGE = [0, 0.02, 0.04, 0.06, 0.08, 0.12, 0.17, 0.22, 0.27];
  // of the people the simulation counts in a town's region, how many live in the town itself (the rest farm around it)
  const TOWN_AGE = [0.1, 0.14, 0.18, 0.22, 0.22, 0.28, 0.45, 0.75, 1];
  // content: what the form, the laws and the times add up to, bent so that nobody is ever wholly pleased or wholly lost
  const bent = (x) => 0.5 + 0.5 * Math.tanh(1.5 * x); const r5 = (v) => Math.round(v * 1e5) / 1e5;

  // ---------- what a form of government or a law changes ----------
  // every key multiplies something in the simulation by (1 + the sum of what the realm's choices say), except stab
  // (added to where stability settles) and cost (a share of the taxes, spent)
  const KEYS = ['tax', 'customs', 'upkeep', 'cost', 'stab', 'auth', 'food', 'grow', 'health', 'strength', 'levy', 'research', 'build', 'reach', 'trade', 'work', 'yield', 'expand', 'breakaway', 'unrest', 'hunger'];
  const K = {}; KEYS.forEach((k, i) => { K[k] = i; }); const NK = KEYS.length; const ADDED = { stab: 1, cost: 1 };
  // **Rule is measured against the age**, as knowledge is: what the simulation reads is what a realm's form, laws and estates give
  // over what realms of its age usually get from theirs (NORM: the world's mean for each key in each age, measured by
  // tools/rule/norm.js and written here). A realm with the usual laws of its age is where the old tables put it; one that keeps
  // the laws of its forebears falls behind, one that reforms well gets ahead. That is what keeps history's pace and the world's
  // numbers whatever realms choose: after changing what forms and laws give, measure again.
  /* NORM:BEGIN */
  const NORM = {
    tax: [0.72, 0.936, 1.126, 1.208, 1.03, 1.235, 1.424, 1.514, 1.47],
    customs: [1, 1, 1, 1, 1.018, 1.632, 1.259, 0.902, 0.844],
    upkeep: [1, 1, 1.078, 1.213, 1.268, 1.306, 1.23, 1.409, 1.569],
    cost: [0, 0.008, 0.054, 0.083, 0.05, 0.033, 0.061, 0.116, 0.16],
    stab: [0.062, 0.149, 0.179, 0.159, 0.189, 0.123, 0.081, 0.259, 0.319],
    auth: [0.909, 1.222, 1.484, 1.27, 0.931, 1.483, 1.372, 0.965, 0.528],
    food: [1.018, 0.994, 1.015, 1.025, 1.022, 1.071, 1.083, 1.066, 1.064],
    grow: [1, 0.999, 1.015, 1.017, 0.994, 1.016, 1.025, 1.04, 1.045],
    health: [1, 1, 1, 1, 1.065, 1.022, 1.146, 1.135, 1.165],
    strength: [1.071, 1.119, 1.183, 1.272, 1.41, 1.35, 1.39, 1.376, 1.328],
    levy: [1, 0.877, 0.864, 0.935, 0.968, 0.983, 0.989, 0.994, 0.997],
    research: [1, 1.029, 1.048, 1.127, 1.123, 1.092, 1.393, 1.597, 1.757],
    build: [1, 0.924, 0.86, 0.861, 0.986, 0.998, 0.997, 0.99, 0.996],
    reach: [0.809, 1.14, 1.332, 1.429, 1.556, 1.428, 1.419, 1.368, 1.913],
    trade: [1.022, 1.098, 1.113, 1.07, 1.103, 1.118, 1.35, 1.31, 1.315],
    work: [0.999, 0.983, 1.032, 1.073, 1.094, 1.215, 1.134, 1.235, 1.25],
    yield: [1, 1.02, 1.023, 1.043, 1.012, 1.002, 1, 1.029, 1.035],
    expand: [1, 1, 1.019, 1.033, 1.022, 1.006, 1.002, 0.897, 0.943],
    breakaway: [1, 1.132, 1.184, 1.034, 0.96, 0.873, 0.862, 0.876, 0.709],
    unrest: [1, 1, 1.053, 1.054, 1.061, 1.016, 0.988, 0.96, 0.924],
    hunger: [0.905, 0.818, 0.588, 0.508, 0.911, 0.987, 0.981, 0.997, 0.999],
  };
  /* NORM:END */
  const NORMED = KEYS.map((k) => k !== 'auth');      // (authority is rule's own coin: nothing outside reads it)

  // ---------- forms of government ----------
  // [key, name, stands on (discoveries; @n = not before age n), what the realm is called, the ruler's title (his, hers),
  //  how rulers follow one another, who holds office (a weight on each estate's power), who is glad of it,
  //  what it gives, the size it suits (regions: fewest to proclaim it, most it holds easily), text]
  // succession: chosen (by the elders: quiet), blood (an heir: sometimes disputed), seized (whoever can: often disputed),
  //             elected (terms of years: never disputed), named (by the ruler or the party: seldom disputed)
  const RAW_FORMS = [
    ['band', 'Band of kin', '', 'the {n} people', ['Elder', 'Elder'], 'chosen', { nobles: 0.8, farmers: 1.3, scholars: 1.2 }, { farmers: 0.06 }, { stab: 0.05, tax: -0.25, reach: -0.3, auth: -0.2 }, [0, 40],
      'The heads of families talk until they agree. Nobody commands and nobody obeys; it works while everyone knows everyone.'],
    ['chiefdom', 'Chiefdom', 'chiefs', '{n} Chiefdom', ['Chief', 'Chief'], 'blood', { nobles: 1.3, soldiers: 1.2 }, { nobles: 0.08, soldiers: 0.04 }, { strength: 0.05, tax: -0.12, reach: -0.1 }, [0, 150],
      'One family leads, gives feasts, settles quarrels and takes the first share.'],
    ['temple', 'Temple state', 'priesthood', 'Holy city of {n}', ['High Priest', 'High Priestess'], 'chosen', { priests: 2.2, scholars: 1.3, nobles: 0.7, soldiers: 0.8 }, { priests: 0.16, scholars: 0.05, soldiers: -0.05 }, { stab: 0.06, research: 0.06, tax: 0.05, strength: -0.1 }, [0, 120],
      'The god owns the city. His servants store the grain, keep the accounts and give out the rations.'],
    ['kingdom', 'Kingship', 'kingship', 'Kingdom of {n}', ['King', 'Queen'], 'blood', { nobles: 1.4, priests: 1.1, soldiers: 1.1 }, { nobles: 0.08, priests: 0.04 }, { reach: 0.1, strength: 0.05, auth: 0.1 }, [0, 500],
      'One ruler, chosen by the gods and followed by an heir. Great houses stand around the throne.'],
    ['citystate', 'Council of the city', 'markets', 'City of {n}', ['Archon', 'Archon'], 'elected', { merchants: 1.7, artisans: 1.3, nobles: 0.9, farmers: 0.8 }, { merchants: 0.12, artisans: 0.06 }, { trade: 0.15, tax: 0.05, work: 0.05, reach: -0.4 }, [0, 30],
      'The city governs itself through a council of its leading families. It trades far and rules little.'],
    ['tyranny', 'Tyranny', 'drill', '{n}', ['Tyrant', 'Tyrant'], 'seized', { soldiers: 1.9, artisans: 1.1, nobles: 0.6 }, { soldiers: 0.12, nobles: -0.14, artisans: 0.03, scholars: -0.05 }, { strength: 0.12, auth: 0.4, stab: -0.04, tax: 0.05 }, [0, 300],
      'A strong man with spearmen behind him sets the old families aside and rules alone.'],
    ['league', 'League of tribes', 'envoys', '{n} League', ['High Chief', 'High Chief'], 'chosen', { nobles: 1.3, farmers: 1.1, soldiers: 1.1 }, { nobles: 0.05, farmers: 0.03 }, { reach: 0.3, tax: -0.25, strength: 0.05, auth: -0.4, stab: 0.03, breakaway: -0.3 }, [0, 400],
      'Peoples who keep their own chiefs, and send them to one council for war and for peace.'],
    ['republic', 'Republic', 'republic', 'Republic of {n}', ['Consul', 'Consul'], 'elected', { nobles: 1.1, merchants: 1.3, artisans: 1.3, farmers: 1.1 }, { artisans: 0.08, merchants: 0.08, farmers: 0.04, nobles: -0.03 }, { stab: 0.05, trade: 0.08, research: 0.05, strength: 0.05, auth: -0.2 }, [0, 120],
      'Magistrates chosen for a year and answerable afterwards. The law stands above whoever holds office.'],
    ['democracy', 'Rule of the assembly', 'philosophy', '{n}', ['First Citizen', 'First Citizen'], 'elected', { artisans: 1.6, farmers: 1.4, merchants: 1.2, nobles: 0.6 }, { artisans: 0.14, farmers: 0.08, nobles: -0.12, scholars: 0.05 }, { research: 0.1, work: 0.08, stab: 0.04, auth: -0.4, reach: -0.3 }, [0, 40],
      'Every citizen may speak and vote in the assembly, and offices are filled by lot.'],
    ['empire', 'Empire', 'provinces', '{n} Empire', ['Emperor', 'Empress'], 'named', { soldiers: 1.3, scholars: 1.3 }, { soldiers: 0.06, scholars: 0.05, nobles: -0.04 }, { reach: 0.35, tax: 0.08, auth: 0.2, stab: -0.03, expand: 0.15 }, [250, 1e9],
      'Many peoples under one ruler, held by roads, garrisons and governors who answer to the capital.'],
    ['feudal', 'Feudal monarchy', 'feudalism', 'Kingdom of {n}', ['King', 'Queen'], 'blood', { nobles: 2.0, priests: 1.2, artisans: 0.7, merchants: 0.7 }, { nobles: 0.16, priests: 0.05, farmers: -0.06, merchants: -0.06, artisans: -0.05 }, { strength: 0.12, reach: 0.25, tax: -0.15, research: -0.05, work: -0.05, auth: -0.2 }, [0, 1e9],
      'The king is first among lords. Each holds his land for service, and rules it as he likes.'],
    ['theocracy', 'Rule of the faithful', 'scripture', 'Holy Realm of {n}', ['Patriarch', 'Matriarch'], 'chosen', { priests: 2.3, scholars: 1.1, merchants: 0.8 }, { priests: 0.2, scholars: -0.06, merchants: -0.04 }, { stab: 0.08, research: -0.08, auth: 0.2, tax: 0.05, expand: 0.1 }, [0, 250],
      'The law is the scripture, and those who read it rule.', 'faith'],
    ['merchant', 'Merchant republic', 'banking', 'Serene Republic of {n}', ['Doge', 'Dogaressa'], 'elected', { merchants: 2.3, artisans: 1.2, nobles: 0.8, farmers: 0.7 }, { merchants: 0.2, artisans: 0.05, nobles: -0.08, farmers: -0.05 }, { trade: 0.25, tax: 0.1, customs: 0.2, work: 0.05, strength: -0.1, reach: -0.2 }, [0, 200],
      'The great trading houses elect one of their own. The state is run like a counting house, and for the same ends.', 'port'],
    ['horde', 'Khanate', 'riding', '{n} Khanate', ['Khan', 'Khatun'], 'seized', { soldiers: 1.8, nobles: 1.4, artisans: 0.6, merchants: 0.8, scholars: 0.6 }, { soldiers: 0.14, nobles: 0.06, artisans: -0.08, scholars: -0.06 }, { strength: 0.2, expand: 0.3, reach: 0.3, tax: -0.2, research: -0.1, work: -0.15, stab: -0.03 }, [0, 1e9],
      'The whole people is an army on horseback, and follows the khan who brings it victory.'],
    ['mandate', 'Rule by scholar-officials', 'service paper', 'Great {n}', ['Emperor', 'Empress'], 'blood', { scholars: 2.1, nobles: 0.7, merchants: 0.7, soldiers: 0.9 }, { scholars: 0.18, nobles: -0.1, merchants: -0.08 }, { reach: 0.35, stab: 0.05, research: 0.06, tax: 0.08, trade: -0.1, auth: 0.1, breakaway: -0.2 }, [150, 1e9],
      'Office goes to those who pass the examinations. The emperor reigns; the officials govern.'],
    ['absolute', 'Absolute monarchy', 'sovereignty', 'Kingdom of {n}', ['King', 'Queen'], 'blood', { nobles: 0.8, soldiers: 1.3, scholars: 1.1, merchants: 1.1 }, { nobles: -0.12, soldiers: 0.06, merchants: 0.03 }, { auth: 0.6, tax: 0.12, strength: 0.08, reach: 0.15, stab: -0.02 }, [0, 1e9],
      'The crown has broken the great lords. There is one law, one army and one will.'],
    ['crown', 'Crown in parliament', 'estates sovereignty', 'Kingdom of {n}', ['King', 'Queen'], 'blood', { merchants: 1.5, nobles: 1.2, artisans: 1.1 }, { merchants: 0.12, nobles: 0.05, artisans: 0.04 }, { stab: 0.06, tax: 0.08, trade: 0.1, research: 0.05, auth: -0.2 }, [0, 1e9],
      'The king reigns, and governs only with the consent of a parliament that holds the purse.'],
    ['parliament', 'Parliamentary republic', 'constitutions', 'Republic of {n}', ['President', 'President'], 'elected', { merchants: 1.4, artisans: 1.4, scholars: 1.2, nobles: 0.6 }, { merchants: 0.1, artisans: 0.1, scholars: 0.08, nobles: -0.12 }, { stab: 0.06, research: 0.1, trade: 0.1, work: 0.05, auth: -0.3 }, [0, 1e9],
      'A written constitution, an elected chamber, and ministers it can dismiss.'],
    ['junta', 'Rule of the generals', 'conscription', '{n}', ['General', 'General'], 'seized', { soldiers: 2.6, merchants: 0.9, artisans: 0.8, scholars: 0.7, farmers: 0.8 }, { soldiers: 0.2, scholars: -0.12, artisans: -0.08 }, { strength: 0.15, auth: 0.5, stab: -0.05, research: -0.05, trade: -0.05 }, [0, 1e9],
      'The army has taken the government, for the nation\'s good, until further notice.'],
    ['peoples', 'People\'s republic', 'planning', 'People\'s Republic of {n}', ['Chairman', 'Chairwoman'], 'named', { artisans: 1.6, farmers: 1.2, scholars: 1.4, merchants: 0.2, nobles: 0.2, priests: 0.4 }, { artisans: 0.1, merchants: -0.3, nobles: -0.3, priests: -0.1 }, { auth: 0.6, work: 0.1, trade: -0.25, research: 0.03, stab: 0.02, tax: 0.1, food: -0.05 }, [0, 1e9],
      'One party rules in the name of those who work. It owns the factories and plans what they make.'],
    ['leader', 'Leader state', 'nationalism broadcast', '{n} State', ['Leader', 'Leader'], 'seized', { soldiers: 1.8, merchants: 1.1, scholars: 0.5 }, { soldiers: 0.14, scholars: -0.16, merchants: 0.03 }, { strength: 0.2, auth: 0.7, expand: 0.2, stab: 0.03, research: -0.08, trade: -0.1 }, [0, 1e9],
      'One man is the nation, and says so every evening on the wireless.'],
    ['liberal', 'Liberal democracy', 'suffrage', 'Republic of {n}', ['President', 'President'], 'elected', { farmers: 1.2, artisans: 1.5, merchants: 1.3, scholars: 1.3, nobles: 0.4, soldiers: 0.7 }, { artisans: 0.12, farmers: 0.1, scholars: 0.1, merchants: 0.06, nobles: -0.1, soldiers: -0.04 }, { stab: 0.08, research: 0.12, trade: 0.12, work: 0.06, auth: -0.4, expand: -0.2 }, [0, 1e9],
      'Everyone votes, governments change without bloodshed, and courts can tell them no.'],
    ['federation', 'Federal union', 'unions', '{n} Federation', ['Chancellor', 'Chancellor'], 'elected', { farmers: 1.2, artisans: 1.4, merchants: 1.5, scholars: 1.3, nobles: 0.4, soldiers: 0.7 }, { merchants: 0.12, artisans: 0.08, scholars: 0.08, farmers: 0.06 }, { reach: 0.6, trade: 0.15, stab: 0.05, auth: -0.5, tax: -0.05, breakaway: -0.5 }, [120, 1e9],
      'States that keep their own laws and share a currency, a market and a border.'],
    ['technocracy', 'Rule of experts', 'egov', '{n} Directorate', ['Director', 'Director'], 'named', { scholars: 2.3, merchants: 1.2, farmers: 0.8 }, { scholars: 0.2, farmers: -0.06, artisans: -0.04 }, { research: 0.18, work: 0.1, tax: 0.08, stab: -0.02, auth: 0.1 }, [0, 1e9],
      'Decisions are made by those who can show their working. Elections, where they are held, change little.'],
  ];
  // the kinds of rule the map tells apart (the lens that paints realms by how they are governed), and each form's kind
  const KINDS = { kin: ['Kin and chiefs', '#A8794A'], crown: ['Crowns', '#D6B25E'], empire: ['Empires', '#9B6BD6'], faith: ['Rule of the faithful', '#E8E4D8'], council: ['Councils and republics', '#4F9BE8'], sword: ['Rule by the sword', '#8A9A4B'], party: ['One party', '#D8453C'], experts: ['Experts', '#3FBFB0'] };
  const KIND_OF = { band: 'kin', chiefdom: 'kin', league: 'kin', temple: 'faith', theocracy: 'faith', kingdom: 'crown', feudal: 'crown', absolute: 'crown', crown: 'crown', empire: 'empire', mandate: 'empire', citystate: 'council', republic: 'council', democracy: 'council', merchant: 'council', parliament: 'council', liberal: 'council', federation: 'council', tyranny: 'sword', horde: 'sword', junta: 'sword', leader: 'sword', peoples: 'party', technocracy: 'experts' };
  // what peoples of some tongues call their realm and its ruler under some of these forms
  const TONGUE = {
    turkic: { kingdom: ['{n} Khanate', 'Khan', 'Khatun'], feudal: ['{n} Khanate', 'Khan', 'Khatun'], absolute: ['{n} Khanate', 'Khan', 'Khatun'], empire: ['{n} Khaganate', 'Khagan', 'Khatun'] },
    semitic: { feudal: ['Sultanate of {n}', 'Sultan', 'Sultana'], absolute: ['Sultanate of {n}', 'Sultan', 'Sultana'], theocracy: ['Caliphate of {n}', 'Caliph', 'Caliph'], chiefdom: ['{n} Chiefdom', 'Sheikh', 'Sheikha'] },
    indic: { kingdom: ['Kingdom of {n}', 'Raja', 'Rani'], feudal: ['Kingdom of {n}', 'Raja', 'Rani'], absolute: ['Kingdom of {n}', 'Maharaja', 'Maharani'], empire: ['{n} Empire', 'Maharaja', 'Maharani'] },
    hellenic: { kingdom: ['Kingdom of {n}', 'Basileus', 'Basilissa'], empire: ['{n} Empire', 'Basileus', 'Basilissa'], democracy: ['{n}', 'Strategos', 'Strategos'] },
    sinitic: { kingdom: ['State of {n}', 'King', 'Queen'], empire: ['Great {n}', 'Emperor', 'Empress'] },
    norse: { chiefdom: ['{n} Jarldom', 'Jarl', 'Jarl'], league: ['{n} Thing', 'Lawspeaker', 'Lawspeaker'] },
    nahuatl: { kingdom: ['Kingdom of {n}', 'Tlatoani', 'Tlatoani'], empire: ['{n} Empire', 'Tlatoani', 'Tlatoani'] },
    polynesian: { chiefdom: ['{n} Chiefdom', 'Ariki', 'Ariki'], kingdom: ['Kingdom of {n}', 'Ariki Nui', 'Ariki Nui'] },
    latinic: { empire: ['{n} Empire', 'Imperator', 'Imperatrix'], tyranny: ['{n}', 'Dictator', 'Dictator'] },
    celtic: { chiefdom: ['{n} Chiefdom', 'Chieftain', 'Chieftain'], kingdom: ['Kingdom of {n}', 'High King', 'High Queen'] },
  };
  // the forms a world saved before this knew, and what they are now
  const OLD_FORM = { tribe: 'band', chiefdom: 'chiefdom', 'city-state': 'citystate', kingdom: 'kingdom', empire: 'empire', republic: 'republic', sultanate: 'kingdom', federation: 'federation' };

  // ---------- laws ----------
  // twelve fields; in each a realm has exactly one law in force
  const RAW_CATS = [
    ['land', 'Land', 'who holds the soil'], ['labour', 'Labour', 'who does the work'], ['tax', 'Taxes', 'how the state is paid'], ['army', 'Arms', 'who fights'],
    ['justice', 'Justice', 'how wrongs are righted'], ['admin', 'Provinces', 'who governs far from the capital'], ['rights', 'Standing', 'who counts'], ['faith', 'Faith', 'the gods and the state'],
    ['trade', 'Trade', 'who may buy and sell'], ['learning', 'Learning', 'who is taught'], ['speech', 'Speech', 'what may be said'], ['welfare', 'Care', 'who looks after the poor and the sick'],
  ];
  // [field, key, name, stands on (discoveries; @n = not before age n; +faith = the realm has a faith), what it gives, who is glad of it (and who is not), text]
  // the first law of each field is what a people begins with
  const RAW_LAWS = [
    // ----- land -----
    ['land', 'commons', 'Common land', '', {}, { farmers: 0.08 }, 'Fields and hunting grounds belong to everyone, and are shared out again each year.'],
    ['land', 'clanland', 'Land of the clans', 'chiefs', { strength: 0.03, tax: 0.03 }, { nobles: 0.1, farmers: -0.03 }, 'Each clan holds its own ground, and its head says who works which part.'],
    ['land', 'royal', 'Crown and temple land', 'taxes', { tax: 0.1, food: 0.03 }, { priests: 0.08, nobles: -0.06, farmers: -0.05 }, 'The best land is the king\'s and the god\'s. Those who farm it owe a share of every harvest.'],
    ['land', 'freehold', 'Free farmers', 'laws @2', { food: 0.05, grow: 0.05, strength: 0.05, tax: -0.03 }, { farmers: 0.15, nobles: -0.12 }, 'Farmers own the land they plough, and take up arms to keep it.'],
    ['land', 'estates', 'Great estates', 'coinage', { yield: 0.08, tax: 0.05, grow: -0.04, stab: -0.02 }, { nobles: 0.14, merchants: 0.05, farmers: -0.14 }, 'The rich buy up the small farms and work them with hired hands and slaves.'],
    ['land', 'fiefs', 'Fiefs held for service', 'feudalism', { strength: 0.1, reach: 0.1, tax: -0.1 }, { nobles: 0.18, farmers: -0.08, merchants: -0.04 }, 'Land is held from a lord in return for fighting for him, and those who work it go with the land.'],
    ['land', 'enclosure', 'Enclosed farms', 'rotation @5', { food: 0.1, work: 0.05, stab: -0.03 }, { nobles: 0.08, merchants: 0.06, farmers: -0.15, artisans: -0.03 }, 'The commons are hedged into private farms. More grain, and the cottagers drift to the towns.'],
    ['land', 'reform', 'Land to those who till it', 'suffrage', { food: 0.06, grow: 0.04, stab: 0.03, tax: -0.03 }, { farmers: 0.2, nobles: -0.2 }, 'The great estates are broken up and sold or given to the families who work them.'],
    ['land', 'collective', 'Collective farms', 'planning', { tax: 0.12, food: -0.08, work: 0.05 }, { farmers: -0.18, nobles: -0.15, artisans: 0.04, scholars: 0.03 }, 'Villages pool their land, their animals and their labour, and deliver a quota to the state.'],
    ['land', 'agribusiness', 'Farming as an industry', 'tractors', { food: 0.12, yield: 0.08, grow: -0.02 }, { merchants: 0.1, farmers: -0.08 }, 'A few large farms with machines, credit and contracts feed the cities.'],
    // ----- labour -----
    ['labour', 'kin', 'Work shared by kin', '', {}, { farmers: 0.05 }, 'Everyone works beside their own family, and helps the neighbours at harvest.'],
    ['labour', 'corvee', 'Labour owed as tax', 'kingship', { build: -0.15 }, { farmers: -0.1, nobles: 0.03, priests: 0.04 }, 'Every household owes some weeks a year, on dykes, roads, walls and tombs.'],
    ['labour', 'slavery', 'Slavery', 'warriors', { yield: 0.12, build: -0.1, research: -0.04, stab: -0.04, work: -0.03 }, { nobles: 0.08, merchants: 0.08, farmers: -0.06, artisans: -0.08 }, 'Captives and debtors are property. Mines and estates are worked cheaply, and nobody looks for a better way.'],
    ['labour', 'serfdom', 'Serfdom', 'feudalism', { food: 0.04, tax: 0.04, work: -0.08, research: -0.04, grow: -0.03 }, { nobles: 0.14, farmers: -0.14, artisans: -0.05 }, 'Peasants may not leave their lord\'s land, and owe him days of work each week.'],
    ['labour', 'guilds', 'Craft guilds', 'guilds', { work: 0.08, trade: -0.04, stab: 0.02 }, { artisans: 0.15, merchants: -0.06 }, 'Each craft governs itself: who may practise, what it costs, how good it must be.'],
    ['labour', 'free', 'Free wage labour', 'manufactories', { work: 0.1, grow: 0.03, stab: -0.02 }, { merchants: 0.1, artisans: 0.04, nobles: -0.08 }, 'Anyone may work for anyone, at whatever wage they can agree.'],
    ['labour', 'factoryacts', 'Factory acts', 'factory', { health: 0.08, work: -0.03, stab: 0.03 }, { artisans: 0.16, merchants: -0.08 }, 'Hours limited, children out of the mills, inspectors in.'],
    ['labour', 'unions', 'Unions and strikes', 'suffrage', { stab: 0.04, work: -0.04, grow: 0.02 }, { artisans: 0.2, merchants: -0.12 }, 'Workers bargain together, and may stop work to be heard.'],
    ['labour', 'assigned', 'Labour by assignment', 'planning', { work: 0.08, build: -0.1, stab: -0.03, research: -0.03 }, { artisans: -0.1, scholars: -0.05 }, 'The plan says where each pair of hands is needed, and sends it there.'],
    // ----- taxes -----
    ['tax', 'gifts', 'Gifts to the chief', '', { tax: -0.2 }, { farmers: 0.05 }, 'People bring what they can spare, and expect a feast in return.'],
    ['tax', 'tribute', 'Tribute in kind', 'tally', { tax: -0.08 }, {}, 'A share of grain, hides and cloth from every household, counted on tally sticks.'],
    ['tax', 'tithe', 'The tithe', 'priesthood', { tax: -0.03, stab: 0.02 }, { priests: 0.15, farmers: -0.04 }, 'A tenth of every harvest goes to the temple, which feeds the poor and the king from it.'],
    ['tax', 'taxfarm', 'Tax farming', 'coinage', { tax: 0.15, stab: -0.04, unrest: 0.2 }, { merchants: 0.1, farmers: -0.14 }, 'The right to collect is auctioned. The treasury is paid in advance, and the collectors take what they can.'],
    ['tax', 'polltax', 'A tax on every head', 'taxes', { tax: 0.08, grow: -0.02 }, { farmers: -0.12, artisans: -0.08 }, 'The same sum from rich and poor alike. Simple to count, hard to bear.'],
    ['tax', 'landtax', 'Land tax by survey', 'provinces', { tax: 0.1 }, { nobles: -0.1, scholars: 0.05, farmers: -0.03 }, 'Every field is measured and written down. The tax follows the land, whoever holds it.'],
    ['tax', 'excise', 'Customs and excise', 'bourse', { tax: 0.05, customs: 0.3, trade: -0.05 }, { merchants: -0.08, farmers: 0.04 }, 'Duties at the ports and on salt, drink and tobacco. People pay as they spend.'],
    ['tax', 'income', 'Income tax', 'constitutions', { tax: 0.25 }, { merchants: -0.12, nobles: -0.14, farmers: 0.05, artisans: 0.03 }, 'A share of what each person earns, declared on a form.'],
    ['tax', 'progressive', 'Progressive taxation', 'welfare', { tax: 0.35, work: -0.03 }, { merchants: -0.18, nobles: -0.18, artisans: 0.08, farmers: 0.08 }, 'The more you earn, the larger the share you pay.'],
    // ----- arms -----
    ['army', 'warband', 'Warriors of the kin', '', {}, { soldiers: 0.05 }, 'Every grown man has a spear and follows his own kin to a fight.'],
    ['army', 'levy', 'The levy of farmers', 'warriors', { strength: 0.05, levy: -0.25, food: -0.02 }, { farmers: -0.08, nobles: 0.03 }, 'In the months between sowing and harvest, the king can call up every household.'],
    ['army', 'caste', 'A warrior nobility', 'chariots', { strength: 0.12, tax: -0.05 }, { nobles: 0.15, soldiers: 0.08, farmers: -0.04 }, 'War is the business of those born to it, who are fed by others so they can train.'],
    ['army', 'citizen', 'Citizen soldiers', 'drill', { strength: 0.12, stab: 0.03, levy: -0.15 }, { farmers: 0.06, artisans: 0.06, nobles: -0.06 }, 'Those who own land buy their own armour and stand in the line. They also vote.'],
    ['army', 'mercenary', 'Hired companies', 'coinage', { strength: 0.15, upkeep: 0.5, stab: -0.02 }, { merchants: 0.06, soldiers: -0.1, farmers: 0.05 }, 'Soldiers for pay, from anywhere. Excellent while the pay lasts.'],
    ['army', 'standing', 'A standing army', 'legions', { strength: 0.22, upkeep: 0.35 }, { soldiers: 0.18, farmers: 0.02, nobles: -0.05 }, 'Men who serve for twenty years, drilled, paid and pensioned by the state.'],
    ['army', 'conscript', 'Conscription', 'conscription', { strength: 0.35, upkeep: 0.15, grow: -0.03 }, { soldiers: 0.06, farmers: -0.1, artisans: -0.1 }, 'Every young man serves, and stays in the reserve for the next war.'],
    ['army', 'professional', 'A professional force', 'armour', { strength: 0.3, upkeep: 0.6, stab: 0.02 }, { soldiers: 0.15, artisans: 0.04 }, 'A small army of volunteers with costly machines, trained for years.'],
    // ----- justice -----
    ['justice', 'feud', 'Custom and feud', '', {}, { nobles: 0.03 }, 'A wrong is avenged by the victim\'s kin. Sometimes that ends it.'],
    ['justice', 'bloodprice', 'Blood-price', 'chiefs', { stab: 0.02 }, {}, 'Every injury has a price in cattle, and the chief sees that it is paid.'],
    ['justice', 'code', 'A written code', 'laws', { stab: 0.04, trade: 0.04 }, { merchants: 0.08, farmers: 0.04, nobles: -0.05 }, 'The laws are cut in stone where anyone can read them, and bind the judge as well.'],
    ['justice', 'judges', 'The ruler\'s judges', 'courts', { stab: 0.04, reach: 0.08, auth: 0.15, tax: 0.03 }, { nobles: -0.1, farmers: 0.05 }, 'Judges sent from the capital hear cases in every province, over the heads of the local lords.'],
    ['justice', 'jury', 'Trial by one\'s peers', 'charters', { stab: 0.05, auth: -0.1 }, { artisans: 0.1, merchants: 0.06, priests: -0.05 }, 'Twelve neighbours decide the facts. No free man is punished except by their judgement.'],
    ['justice', 'equal', 'Equal before the law', 'constitutions', { stab: 0.05, research: 0.05, trade: 0.05, auth: -0.1 }, { nobles: -0.15, artisans: 0.1, farmers: 0.1, merchants: 0.08, scholars: 0.1 }, 'One law for everyone, independent judges, and no punishment without trial.'],
    ['justice', 'police', 'Secret police', 'telegraph', { stab: 0.08, unrest: -0.5, research: -0.08, auth: 0.25 }, { scholars: -0.2, artisans: -0.1, merchants: -0.06, farmers: -0.06, soldiers: 0.04 }, 'Files on everyone, informers in every street, and prisons nobody talks about.'],
    ['justice', 'watched', 'Total surveillance', 'networks', { stab: 0.1, unrest: -0.7, research: -0.1, auth: 0.35, work: -0.03 }, { scholars: -0.25, artisans: -0.14, merchants: -0.08, farmers: -0.08 }, 'Every message, purchase and journey is recorded, and machines read the record.'],
    // ----- provinces -----
    ['admin', 'clanheads', 'Heads of the clans', '', {}, { nobles: 0.03 }, 'Each clan runs its own affairs. Far-off kin are kin in name.'],
    ['admin', 'vassals', 'Vassals and tribute', 'kingship', { reach: 0.3, tax: -0.1, breakaway: 0.3 }, { nobles: 0.14 }, 'Conquered kings keep their thrones, send tribute, and wait for a weak year.'],
    ['admin', 'governors', 'Governors sent out', 'provinces', { reach: 0.2, tax: 0.04, breakaway: 0.1 }, { nobles: -0.08, scholars: 0.06 }, 'The realm is cut into provinces, each under a man the ruler appoints and can recall.'],
    ['admin', 'examined', 'Examined officials', 'service', { reach: 0.25, research: 0.03, breakaway: -0.2, cost: 0.02 }, { scholars: 0.2, nobles: -0.16 }, 'Provinces are run by salaried officials chosen for what they know, and moved every few years.'],
    ['admin', 'intendants', 'The crown\'s intendants', 'sovereignty', { reach: 0.25, tax: 0.08, breakaway: -0.2 }, { nobles: -0.16, merchants: 0.04 }, 'Commissioners with full powers answer to the crown alone, and watch the governors.'],
    ['admin', 'selfrule', 'Self-ruling provinces', 'constitutions', { reach: 0.45, tax: -0.08, stab: 0.02, breakaway: -0.3 }, { nobles: 0.05, merchants: 0.05, farmers: 0.05 }, 'Each province has its own assembly and its own laws, under one constitution.'],
    ['admin', 'central', 'One state, one law', 'railways', { reach: 0.35, tax: 0.1, auth: 0.15, breakaway: -0.1 }, { nobles: -0.1, scholars: 0.08 }, 'Prefects, a timetable and a telegraph wire: the capital knows by evening what happened that morning.'],
    ['admin', 'digital', 'Government online', 'egov', { reach: 0.5, tax: 0.08, cost: -0.02 }, { scholars: 0.1 }, 'Every record in one system, every office a screen.'],
    // ----- standing -----
    ['rights', 'kinfolk', 'All of one kin', '', { stab: 0.02 }, { farmers: 0.05 }, 'Nobody is born better than anybody else. Standing is earned, and lost.'],
    ['rights', 'castes', 'Born to a station', 'priesthood', { stab: 0.05, research: -0.05, work: -0.04 }, { priests: 0.12, nobles: 0.1, artisans: -0.1, farmers: -0.08, merchants: -0.06 }, 'Priest, warrior, craftsman, labourer: what your father was, you are.'],
    ['rights', 'citizens', 'Citizens and outsiders', 'laws @2', { stab: 0.03, strength: 0.04 }, { artisans: 0.08, farmers: 0.05, merchants: -0.03 }, 'Those born of citizens have a voice and a duty. Everyone else lives here on sufferance.'],
    ['rights', 'orders', 'Three orders', 'estates', { stab: 0.03, tax: -0.03 }, { nobles: 0.12, priests: 0.1, artisans: -0.06, farmers: -0.08 }, 'Those who pray, those who fight, those who work: each with its own law and its own courts.'],
    ['rights', 'subjects', 'Subjects of one crown', 'sovereignty', { auth: 0.2, tax: 0.04 }, { nobles: -0.12, merchants: 0.05 }, 'Before the king, a duke and a ploughman are alike his subjects.'],
    ['rights', 'property', 'Votes for owners', 'constitutions', { stab: 0.03, trade: 0.04, auth: -0.1 }, { merchants: 0.14, nobles: 0.04, artisans: -0.06, farmers: -0.04 }, 'Those with a stake in the country choose who governs it.'],
    ['rights', 'suffrage', 'Votes for all', 'suffrage', { stab: 0.06, auth: -0.2 }, { artisans: 0.16, farmers: 0.16, nobles: -0.14, merchants: -0.04 }, 'Every adult, whatever they own and whoever they are, has one vote.'],
    ['rights', 'human', 'Inalienable rights', 'rights', { stab: 0.05, research: 0.05, auth: -0.25 }, { scholars: 0.14, artisans: 0.1, farmers: 0.08, soldiers: -0.04 }, 'Life, liberty and a fair hearing belong to a person, not to a citizen.'],
    // ----- faith -----
    ['faith', 'spirits', 'Every clan its spirits', '', {}, { priests: 0.03 }, 'Each family keeps its own dead and its own holy places.'],
    ['faith', 'ancestors', 'The ancestors watch', 'ritual', { stab: 0.03 }, { priests: 0.08 }, 'The whole people gathers for the same rites, at the same graves.'],
    ['faith', 'rulercult', 'The ruler is holy', 'kingship', { auth: 0.25, stab: 0.03 }, { priests: 0.08, scholars: -0.04 }, 'The king is the son of the god, or the god himself. To disobey is sacrilege.'],
    ['faith', 'tolerance', 'Many gods, one peace', 'philosophy', { trade: 0.06, research: 0.04, stab: 0.02 }, { priests: -0.1, merchants: 0.08, scholars: 0.08 }, 'Every people may keep its own gods, so long as it keeps the peace.'],
    ['faith', 'established', 'One established faith', 'scripture +faith', { stab: 0.06, research: -0.04, auth: 0.1 }, { priests: 0.18, scholars: -0.06, merchants: -0.03 }, 'One faith is the realm\'s. Others are suffered, taxed, and kept from office.'],
    ['faith', 'orthodoxy', 'Orthodoxy enforced', 'scripture courts +faith', { stab: 0.08, research: -0.12, trade: -0.05, unrest: -0.2 }, { priests: 0.22, scholars: -0.18, merchants: -0.1 }, 'Wrong belief is a crime. Courts of the faith seek it out.'],
    ['faith', 'secular', 'Faith a private matter', 'humanism', { research: 0.08, stab: -0.02 }, { priests: -0.18, scholars: 0.14, merchants: 0.05 }, 'The state asks nobody what they believe, and pays no priest.'],
    ['faith', 'godless', 'State atheism', 'planning', { research: 0.04, stab: -0.05, auth: 0.1 }, { priests: -0.3, farmers: -0.08, scholars: 0.04 }, 'Churches become museums and warehouses. The young are taught there is nothing beyond.'],
    // ----- trade -----
    ['trade', 'giftgiving', 'Gifts between chiefs', '', {}, {}, 'Goods pass as presents between leading men, and oblige a present in return.'],
    ['trade', 'peace', 'Peace of the market', 'barter', { trade: 0.05 }, { merchants: 0.06 }, 'On market days strangers may come and go unharmed.'],
    ['trade', 'open', 'Open markets', 'markets', { trade: 0.08 }, { merchants: 0.1, farmers: 0.03 }, 'Anyone may set up a stall, and prices are whatever buyer and seller agree.'],
    ['trade', 'monopoly', 'Royal monopolies', 'taxes', { tax: 0.08, trade: -0.1 }, { merchants: -0.14, nobles: 0.04 }, 'Salt, metal and the far trade belong to the crown, which sells at its own price.'],
    ['trade', 'chartered', 'Chartered towns', 'charters', { trade: 0.06, work: 0.04, tax: 0.03 }, { artisans: 0.1, merchants: 0.06, nobles: -0.06 }, 'Towns buy the right to hold markets and govern themselves, free of the local lord.'],
    ['trade', 'mercantile', 'Mercantilism', 'companies', { customs: 0.5, trade: 0.05, tax: 0.04 }, { merchants: 0.08, farmers: -0.04 }, 'Sell abroad, buy at home, keep the silver in the country.'],
    ['trade', 'freetrade', 'Free trade', 'corporations', { trade: 0.25, customs: -0.5, work: -0.03 }, { merchants: 0.16, artisans: -0.08, farmers: 0.04 }, 'No duties and no favours. Let every country make what it makes best.'],
    ['trade', 'protected', 'Protected industry', 'factory', { work: 0.1, trade: -0.12, customs: 0.3 }, { artisans: 0.1, merchants: -0.04, farmers: -0.06 }, 'Tariffs keep foreign goods dear until the country\'s own factories can stand alone.'],
    ['trade', 'planned', 'A planned economy', 'planning', { work: 0.12, trade: -0.35, tax: 0.1, research: -0.03 }, { merchants: -0.3, artisans: 0.06, scholars: -0.04 }, 'The state decides what is made, what it costs and who gets it.'],
    // ----- learning -----
    ['learning', 'oral', 'Told by the fire', '', {}, {}, 'What the people know is what the old remember and the young are told.'],
    ['learning', 'scribal', 'Schools for scribes', 'writing', { research: 0.05, cost: 0.01 }, { scholars: 0.1, priests: 0.04 }, 'A few boys spend ten years learning the signs, and run the storehouses ever after.'],
    ['learning', 'academies', 'Schools of the free', 'philosophy', { research: 0.08, cost: 0.01 }, { scholars: 0.14, priests: -0.05 }, 'Teachers take pupils for a fee, and argue in public about everything.'],
    ['learning', 'cloister', 'Cloister schools', 'monasteries', { research: 0.05, stab: 0.02 }, { priests: 0.12, scholars: 0.04 }, 'Monks copy the old books, teach the clever boys of the village, and keep what would be lost.'],
    ['learning', 'universities', 'Chartered universities', 'universities', { research: 0.12, cost: 0.02 }, { scholars: 0.18, priests: -0.03 }, 'Guilds of masters and students, with their own courts and the right to grant degrees.'],
    ['learning', 'schooling', 'Schooling for all', 'schooling', { research: 0.18, work: 0.06, cost: 0.04 }, { artisans: 0.1, farmers: 0.08, scholars: 0.1, priests: -0.06 }, 'Every child learns to read, write and count, at the state\'s expense.'],
    ['learning', 'research', 'Science as policy', 'institutes', { research: 0.26, work: 0.08, cost: 0.07 }, { scholars: 0.2, artisans: 0.06 }, 'Universities for the many and laboratories for the best, paid for like roads.'],
    // ----- speech -----
    ['speech', 'elders', 'The elders\' word', '', {}, {}, 'What may be said is what the old allow.'],
    ['speech', 'majesty', 'Insult is treason', 'kingship', { auth: 0.1, stab: 0.02 }, { scholars: -0.05 }, 'To mock the king is to wound him. The penalty is the same.'],
    ['speech', 'assembly', 'Open debate', 'philosophy', { research: 0.04, stab: -0.02, auth: -0.08 }, { scholars: 0.1, artisans: 0.06 }, 'In the place of assembly a citizen may say anything, about anyone.'],
    ['speech', 'censor', 'The censor\'s licence', 'printing', { stab: 0.04, research: -0.08, auth: 0.1 }, { scholars: -0.18, priests: 0.08, merchants: -0.04 }, 'Nothing is printed without leave. Printers answer for their authors.'],
    ['speech', 'press', 'A free press', 'press', { research: 0.08, trade: 0.03, stab: -0.03, auth: -0.15 }, { scholars: 0.18, merchants: 0.08, artisans: 0.06 }, 'Anyone may print anything, and answer for it afterwards in court.'],
    ['speech', 'line', 'The party line', 'broadcast', { stab: 0.06, auth: 0.25, research: -0.1 }, { scholars: -0.22, artisans: -0.04 }, 'One newspaper, one wireless station, one opinion.'],
    ['speech', 'opennet', 'An open net', 'internet', { research: 0.1, trade: 0.05, stab: -0.04, auth: -0.2 }, { scholars: 0.16, merchants: 0.08, artisans: 0.06 }, 'Anyone may publish to everyone. Truth and nonsense travel at the same speed.'],
    ['speech', 'wallednet', 'A walled net', 'internet', { stab: 0.05, research: -0.06, trade: -0.04, auth: 0.2 }, { scholars: -0.2, merchants: -0.06 }, 'The network stops at the border, and what is said inside it is read.'],
    // ----- care -----
    ['welfare', 'kincare', 'Kin look after kin', '', {}, {}, 'The old, the sick and the orphaned are their family\'s to feed.'],
    ['welfare', 'stores', 'Shared stores', 'storage', { hunger: -0.25, stab: 0.01 }, { farmers: 0.05 }, 'A part of every harvest is kept in common against a bad year.'],
    ['welfare', 'dole', 'The grain dole', 'coinage', { hunger: -0.5, stab: 0.03, grow: 0.02, cost: 0.07 }, { farmers: 0.04, artisans: 0.12, nobles: -0.04 }, 'The state buys grain in good years and gives it out in the towns, cheap or free.'],
    ['welfare', 'alms', 'Alms and hospices', 'hospitals', { health: 0.08, stab: 0.02, cost: 0.02 }, { priests: 0.1, farmers: 0.04 }, 'The faithful give, and houses of the sick and the poor are kept from it.'],
    ['welfare', 'poorlaw', 'Poor laws', 'sovereignty', { stab: 0.02, work: 0.03, cost: 0.02 }, { artisans: -0.08, merchants: 0.05 }, 'Each parish must keep its own poor, and may set them to work.'],
    ['welfare', 'health', 'Public health', 'germs', { health: 0.25, grow: 0.06, cost: 0.04 }, { artisans: 0.08, scholars: 0.05 }, 'Sewers, clean water, vaccination and a doctor who answers to the town.'],
    ['welfare', 'insurance', 'Pensions and sick pay', 'welfare', { stab: 0.07, health: 0.1, grow: 0.03, cost: 0.09 }, { artisans: 0.18, farmers: 0.1, merchants: -0.1 }, 'Everyone pays in while they work, and is paid when they cannot.'],
    ['welfare', 'cradle', 'Cradle-to-grave care', 'genomics', { stab: 0.08, health: 0.2, grow: 0.02, cost: 0.14 }, { artisans: 0.18, farmers: 0.12, merchants: -0.14 }, 'Medicine, schooling, housing and an income are owed to everyone, by right.'],
  ];
  // Laws put power in some hands and take it from others, as a form's offices do: a weight on an estate's share of power while the
  // law is in force. (A crown that means to be rid of its great lords first pays its own soldiers and sends out its own officials.)
  const SWAY = {
    clanland: { nobles: 1.15 }, royal: { priests: 1.15, nobles: 0.9 }, freehold: { farmers: 1.25, nobles: 0.9 }, estates: { nobles: 1.25, farmers: 0.85 }, fiefs: { nobles: 1.25, farmers: 0.9 },
    enclosure: { nobles: 1.1, merchants: 1.1, farmers: 0.8 }, reform: { farmers: 1.25, nobles: 0.6 }, collective: { nobles: 0.3, farmers: 0.75 }, agribusiness: { merchants: 1.15, farmers: 0.8 },
    slavery: { nobles: 1.1, artisans: 0.9 }, serfdom: { nobles: 1.15, farmers: 0.8 }, guilds: { artisans: 1.3 }, free: { merchants: 1.2 }, factoryacts: { artisans: 1.1 }, unions: { artisans: 1.35, merchants: 0.9 }, assigned: { artisans: 0.75 },
    tithe: { priests: 1.15 }, taxfarm: { merchants: 1.2 },
    caste: { nobles: 1.2, soldiers: 1.2 }, citizen: { farmers: 1.15, artisans: 1.15 }, mercenary: { merchants: 1.15, soldiers: 0.85 }, standing: { soldiers: 1.35, nobles: 0.9 }, conscript: { soldiers: 1.2 }, professional: { soldiers: 1.15 },
    code: { merchants: 1.1 }, judges: { nobles: 0.9 }, jury: { artisans: 1.15 }, equal: { nobles: 0.75 }, police: { soldiers: 1.2, scholars: 0.8 }, watched: { soldiers: 1.2, scholars: 0.7 },
    vassals: { nobles: 1.3 }, governors: { scholars: 1.1 }, examined: { nobles: 0.75, scholars: 1.4 }, intendants: { nobles: 0.65 }, selfrule: { nobles: 1.1 }, central: { nobles: 0.7, scholars: 1.15 }, digital: { scholars: 1.25 },
    castes: { nobles: 1.2, priests: 1.2, artisans: 0.8 }, citizens: { artisans: 1.15, farmers: 1.1 }, orders: { nobles: 1.15, priests: 1.1, artisans: 0.85 }, subjects: { nobles: 0.8 }, property: { merchants: 1.4, artisans: 0.85 },
    suffrage: { artisans: 1.3, farmers: 1.25, nobles: 0.7 }, human: { scholars: 1.15 },
    ancestors: { priests: 1.1 }, rulercult: { priests: 1.15 }, tolerance: { priests: 0.85 }, established: { priests: 1.25 }, orthodoxy: { priests: 1.45, scholars: 0.8 }, secular: { priests: 0.6, scholars: 1.15 }, godless: { priests: 0.3 },
    peace: { merchants: 1.1 }, open: { merchants: 1.2 }, monopoly: { merchants: 0.7 }, chartered: { merchants: 1.2, artisans: 1.2 }, mercantile: { merchants: 1.25 }, freetrade: { merchants: 1.35 }, protected: { artisans: 1.1 }, planned: { merchants: 0.3 },
    scribal: { scholars: 1.2 }, academies: { scholars: 1.25 }, cloister: { priests: 1.1 }, universities: { scholars: 1.35 }, schooling: { scholars: 1.25 }, research: { scholars: 1.5 },
    censor: { scholars: 0.8 }, press: { scholars: 1.2 }, line: { scholars: 0.6 }, opennet: { scholars: 1.2 }, wallednet: { scholars: 0.75 }, alms: { priests: 1.1 },
  };
  // Every form of government has its own ways: laws that come naturally under it. They cost a quarter less authority there, and a
  // ruler left to himself reaches for them first (so a people's republic collectivises and a khanate keeps its warrior nobility).
  const WAYS = {
    chiefdom: ['clanland', 'tribute', 'bloodprice', 'ancestors'], temple: ['royal', 'corvee', 'tithe', 'rulercult', 'scribal', 'stores', 'castes'], kingdom: ['royal', 'corvee', 'levy', 'vassals', 'majesty', 'code'],
    citystate: ['open', 'citizen', 'citizens', 'code'], tyranny: ['mercenary', 'majesty', 'polltax', 'monopoly'], league: ['clanland', 'tribute', 'bloodprice'],
    republic: ['freehold', 'citizen', 'citizens', 'assembly', 'landtax'], democracy: ['freehold', 'citizen', 'citizens', 'assembly', 'academies', 'dole'], empire: ['estates', 'standing', 'governors', 'judges', 'landtax', 'rulercult', 'dole'],
    feudal: ['fiefs', 'serfdom', 'caste', 'vassals', 'orders', 'cloister', 'tithe'], theocracy: ['orthodoxy', 'established', 'tithe', 'cloister', 'alms', 'censor'], merchant: ['chartered', 'mercenary', 'excise', 'open', 'universities', 'tolerance'],
    horde: ['clanland', 'caste', 'vassals', 'tribute', 'tolerance'], mandate: ['examined', 'landtax', 'monopoly', 'freehold', 'judges', 'academies'], absolute: ['intendants', 'subjects', 'standing', 'censor', 'mercantile', 'poorlaw', 'excise'],
    crown: ['enclosure', 'property', 'jury', 'excise', 'mercantile', 'universities'], parliament: ['property', 'equal', 'press', 'income', 'free', 'schooling', 'freetrade'], junta: ['conscript', 'police', 'censor', 'central', 'protected'],
    peoples: ['collective', 'assigned', 'planned', 'godless', 'line', 'police', 'central'], leader: ['conscript', 'police', 'line', 'protected', 'central', 'wallednet'],
    liberal: ['suffrage', 'equal', 'press', 'unions', 'progressive', 'insurance', 'schooling', 'opennet', 'human'], federation: ['selfrule', 'freetrade', 'human', 'opennet', 'professional', 'cradle'], technocracy: ['research', 'digital', 'agribusiness', 'professional', 'health'],
  };
  // how the autopilot's rulers lean, field by field
  const LEAN = { conqueror: { army: 2, admin: 1.3 }, tyrant: { justice: 1.5, speech: 1.6, rights: 0.6 }, builder: { labour: 1.8, land: 1.2 }, pious: { faith: 2.2, welfare: 1.3 }, scholar: { learning: 2.2, speech: 1.3 }, merchant: { trade: 2.2, tax: 1.3 }, steward: { tax: 1.5, admin: 1.6, welfare: 1.4, justice: 1.3 }, navigator: { trade: 1.8 } };
  // and which forms each kind of ruler would rather have
  const FORM_LEAN = { conqueror: { empire: 1.6, horde: 1.6, tyranny: 1.3, junta: 1.3, leader: 1.4 }, tyrant: { tyranny: 1.8, absolute: 1.5, junta: 1.4, leader: 1.6 }, pious: { temple: 1.6, theocracy: 1.7 }, scholar: { mandate: 1.6, democracy: 1.3, technocracy: 1.8, republic: 1.2 }, merchant: { citystate: 1.5, merchant: 1.9, crown: 1.3, parliament: 1.2 }, steward: { republic: 1.2, crown: 1.3, mandate: 1.3, liberal: 1.2 }, navigator: { merchant: 1.5 } };

  let KNOWN = null;      // (the table of discoveries, KNOW.ID: asked when the tables are first read, so the scripts may load in any order)
  const parseNeeds = (s, what) => { const need = [], out = { need, minEra: 0, faith: false }; for (const w of s ? s.split(' ') : []) { if (w[0] === '@') out.minEra = +w.slice(1); else if (w === '+faith') out.faith = true; else need.push(w); } return out; };
  const likesArr = (o) => { const a = new Float32Array(NE); for (const k in o) { if (EK[k] === undefined) throw new Error('rule: no such estate ' + k); a[EK[k]] = o[k]; } return a; };
  const checkGives = (g, who) => { for (const k in g) if (K[k] === undefined) throw new Error(`rule: ${who} gives ${k}, which nothing reads`); };
  const FORMS = RAW_FORMS.map(([key, name, needs, pattern, titles, succ, weights, likes, gives, span, text, extra], id) => {
    checkGives(gives, key); const n = parseNeeds(needs); const w = new Float32Array(NE).fill(1); for (const k in weights) { if (EK[k] === undefined) throw new Error('rule: no such estate ' + k); w[EK[k]] = weights[k]; }
    if (!KIND_OF[key]) throw new Error('rule: the form ' + key + ' is of no kind'); const hex = KINDS[KIND_OF[key]][1]; const rgb = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
    return { id, key, name, need: n.need, minEra: n.minEra, faith: extra === 'faith', port: extra === 'port', pattern, titles, succ, weights: w, likes: likesArr(likes), gives, lo: span[0], hi: span[1], text, era: 0, kind: KIND_OF[key], rgb, ways: [], way: null };
  });
  const FORM = {}; FORMS.forEach((f) => { if (FORM[f.key]) throw new Error('rule: two forms are called ' + f.key); FORM[f.key] = f; });
  const CATS = RAW_CATS.map(([key, name, note], id) => ({ id, key, name, note, laws: [] })); const CAT = {}; CATS.forEach((c) => { CAT[c.key] = c; }); const NCAT = CATS.length;
  const LAWS = RAW_LAWS.map(([cat, key, name, needs, gives, likes, text], id) => {
    if (!CAT[cat]) throw new Error('rule: no such field ' + cat); checkGives(gives, key); const n = parseNeeds(needs);
    const L = { id, key, cat, ci: CAT[cat].id, name, need: n.need, minEra: n.minEra, faith: n.faith, gives, likes: likesArr(likes), text, era: 0, first: CAT[cat].laws.length === 0, sway: new Float32Array(NE).fill(1), swayed: false, wayOf: [] }; CAT[cat].laws.push(L); return L;
  });
  const LAW = {}; LAWS.forEach((l) => { if (LAW[l.key] || FORM[l.key]) throw new Error('rule: two things are called ' + l.key); LAW[l.key] = l; });
  const NL = LAWS.length; const FIRST = CATS.map((c) => c.laws[0].key);
  for (const k in SWAY) { const L = LAW[k]; if (!L) throw new Error('rule: ' + k + ' sways power, and is no law'); for (const e in SWAY[k]) { if (EK[e] === undefined) throw new Error('rule: no such estate ' + e); L.sway[EK[e]] = SWAY[k][e]; L.swayed = true; } }
  for (const F of FORMS) { F.way = new Uint8Array(NL); for (const k of WAYS[F.key] || []) { const L = LAW[k]; if (!L) throw new Error('rule: ' + k + ' is a way of ' + F.key + ', and is no law'); F.ways.push(L); F.way[L.id] = 1; L.wayOf.push(F); } }
  // (for the yearly loop: what each gives as pairs of key index and value, each field's key, the norms row by row)
  const ADD = KEYS.map((k) => !!ADDED[k]); for (const x of FORMS.concat(LAWS)) { x.gk = []; x.gv = []; for (const k in x.gives) { x.gk.push(K[k]); x.gv.push(x.gives[k]); } }
  const CKEY = CATS.map((c) => c.key); const ROW = KEYS.map((k) => NORM[k]); const FLOORED = ['levy', 'build', 'upkeep', 'unrest', 'breakaway', 'hunger'].map((k) => K[k]);
  const E_K = ESTATES.map((E) => E.k), E_LEVER = ESTATES.map((E) => K[E.lever]), E_STAB = ESTATES.map((E) => E.lever === 'stab');
  // what luxuries mean to those who make things: nothing in an age that has none, everything once there are towns
  const LUX_AGE = [0, 0.5, 1, 1, 1, 1, 1, 1, 1];
  // power is open (elected, or chosen by elders), inherited, or closed (seized, or handed on by whoever holds it)
  const kindOf = (F) => F.succ === 'blood' ? 1 : F.succ === 'seized' || F.succ === 'named' ? 2 : 0;
  // what the mills and the machines do to those who work them, by age, before any law protects them
  const FACTORY = [0, 0, 0, 0, 0, 0, 0.42, 0.34, 0.2];
  // what a band under the first law of every field gets from its rule: where every people begins, and so what the first age expects at its beginning
  const START = (() => { const v = KEYS.map((k) => ADDED[k] ? 0 : 1); const add = (g) => { for (const k in g) { if (ADDED[k]) v[K[k]] += g[k]; else v[K[k]] *= 1 + g[k]; } }; add(FORM.band.gives); for (const c of CATS) add(c.laws[0].gives); return v; })();
  // the age each belongs to is the age of the latest discovery it stands on (asked of know.js once it is there)
  let aged = false; const BY_DISCOVERY = {};
  function age() {
    if (aged) return; const KN = window.KNOW; if (!KN) return; aged = true; KNOWN = KN.ID;
    for (const x of FORMS.concat(LAWS)) { let e = x.minEra; for (const k of x.need) { const d = KN.ID[k]; if (d === undefined) throw new Error(`rule: ${x.key} stands on ${k}, which is not a discovery`); e = Math.max(e, KN.LIST[d].era); (BY_DISCOVERY[k] || (BY_DISCOVERY[k] = [])).push(x); } x.era = e; }
  }
  // what a discovery opens here: forms and laws that stand on it
  const opens = (key) => { age(); return BY_DISCOVERY[key] || []; };
  const estateName = (e, era) => ESTATES[e].names[Math.max(0, Math.min(8, era))];

  // ---------- one world's rule ----------
  // host: { MAXC, civs, year(), rnd(), knows(c, discovery key), popOf, urban, townsOf, cellsOf, temples, markets, ports, acad, wonders,
  //         works(c): workshops in its towns, sat(c, 'food' | 'luxury' | 'arms'), living(c), traded(c): the share of what it uses that crosses
  //         its border, warsN(cv), tongue(cv): the name of its tongue, nameOf(cv), event(cv, text, important, kind: 'state' for a change of government),
  //         shake(cv, by): stability falls, lose(cv, share): country people die or leave, fine(cv, share of a year's income), split(cv, why),
  //         crown(cv, how): a new ruler (how the form changed), alarm(cv, kind): the player should be told,
  //         news(cv, text): something the whole world hears of }
  function create(host) {
    age(); const { MAXC, civs } = host;
    const f = new Float32Array(MAXC * NK), own = new Float32Array(MAXC * NK), power = new Float32Array(MAXC * NE); const cond = new Float64Array(NE), raw = new Float64Array(NE), EX = new Float64Array(NK); const LW = new Array(NCAT);
    const lawsOf = (R) => { const l = R.laws; for (let i = 0; i < NCAT; i++) LW[i] = LAW[l[CKEY[i]]]; return LW; };
    // What a realm's form and laws come to, worked out when they change and not every year: who holds office and whose hand the laws
    // strengthen (SW), what each estate thinks of them (LK), what they give before the estates have their say (BG). Whatever changes a
    // realm's form or laws must call touch(c).
    const SW = new Float32Array(MAXC * NE).fill(1), LK = new Float32Array(MAXC * NE), BG = new Float64Array(MAXC * NK), dirty = new Uint8Array(MAXC).fill(1), K_AGE = PACE.map((y) => 1 - Math.pow(0.5, 2 / y)), FADE_AGE = PACE.map((y) => Math.pow(0.5, 1 / y));
    const touch = (c) => { dirty[c] = 1; };
    function compile(c, R) {
      dirty[c] = 0; const F = FORM[R.gov], lw = lawsOf(R), pe = c * NE, o = c * NK;
      for (let e = 0; e < NE; e++) { let w = F.weights[e], t = F.likes[e]; for (let i = 0; i < NCAT; i++) { w *= lw[i].sway[e]; t += lw[i].likes[e]; } SW[pe + e] = w; LK[pe + e] = t; }
      for (let k = 0; k < NK; k++) BG[o + k] = ADD[k] ? 0 : 1;
      for (let i = -1; i < NCAT; i++) { const x = i < 0 ? F : lw[i], gk = x.gk, gv = x.gv; for (let j = 0; j < gk.length; j++) { const q = gk[j]; if (ADD[q]) BG[o + q] += gv[j]; else BG[o + q] *= 1 + gv[j]; } }
    }      // (own: what a realm's rule gives; f: that against its age)
    const KN = window.KNOW;
    // what an age expects of a key: the measured means stand at the middle of each age, and a realm's knowledge says where between them it is
    // (before the middle of the first age: from what a band begins with to that age's mean)
    function expect(k, tech) { if (!NORM || !NORMED[k]) return ADDED[KEYS[k]] ? 0 : 1; const e = KN.eraOf(tech), x = e + KN.fracOf(tech, e) - 0.5; const row = NORM[KEYS[k]]; if (x <= 0) return START[k] + (row[0] - START[k]) * Math.max(0, 1 + 2 * x); const a = x >= 8 ? 8 : Math.floor(x), b = Math.min(8, a + 1), t = x >= 8 ? 0 : x - a; return row[a] + (row[b] - row[a]) * t; }
    // (the same for every key at once, into EX)
    function expectAll(tech) {
      const e = KN.eraOf(tech), x = e + KN.fracOf(tech, e) - 0.5;
      if (x <= 0) { const t = Math.max(0, 1 + 2 * x); for (let k = 0; k < NK; k++) EX[k] = NORMED[k] ? START[k] + (ROW[k][0] - START[k]) * t : ADD[k] ? 0 : 1; return; }
      const a = x >= 8 ? 8 : Math.floor(x), b = Math.min(8, a + 1), t = x >= 8 ? 0 : x - a; for (let k = 0; k < NK; k++) EX[k] = NORMED[k] ? ROW[k][a] + (ROW[k][b] - ROW[k][a]) * t : ADD[k] ? 0 : 1;
    }
    for (let c = 0; c < MAXC; c++) neutral(c);
    const stats = { laws: 0, forms: 0, grown: 0, seized: 0, passed: 0, demands: 0, granted: 0, refused: 0, risings: new Array(NE).fill(0) };      // (what has happened in this world, for the tools that measure it)
    function neutral(c) { const o = c * NK; for (let k = 0; k < NK; k++) f[o + k] = own[o + k] = ADDED[KEYS[k]] ? 0 : 1; power.fill(1 / NE, c * NE, c * NE + NE); }
    const fresh = (gov) => ({ gov: gov || 'band', laws: Object.fromEntries(CATS.map((c, i) => [c.key, FIRST[i]])), at: {}, auth: 20, mood: new Array(NE).fill(0.55), bump: new Array(NE).fill(0), reform: null, demand: null, since: host.year(), think: -1e9, exile: -1e9, rose: -1e9, q: (host.rnd() * 0x7fffffff) | 0 });
    // a realm's rule: made when first asked for (a world saved before this has none: it gets what its old name says)
    function ruleOf(cv) {
      let R = cv.rule; if (R) return R;
      R = cv.rule = fresh(OLD_FORM[cv.gov] || (FORM[cv.gov] ? cv.gov : 'band')); cv.gov = R.gov; if (cv.id >= 0) touch(cv.id); return R;
    }
    const known = (c, x) => { if (civs[c] && civs[c].rule && civs[c].rule.brought === x.key) return true; for (const k of x.need) if (!host.knows(c, k)) return false; return true; };
    const abroad = { press: false, peoples: false };      // (what the world has heard of, asked of every realm now and then: that there are presses, and what they print; that a party can rule in the name of those who work)
    // why a realm cannot take this form or law now (null: it can): { know: discovery key } | { era } | { faith } | { port } | { size }
    function lacks(c, cv, x) {
      if (!(cv.rule && cv.rule.brought === x.key)) for (const k of x.need) if (!host.knows(c, k)) return { know: k };
      if (x.minEra > cv.era) return { era: x.minEra }; if (x.faith && !cv.religion) return { faith: true };
      if (x.port && !(host.ports[c] > 0)) return { port: true }; if (x.lo && host.cellsOf[c] < x.lo) return { size: x.lo };
      return null;
    }
    // of a realm's people, the share that lives in towns
    const urbOf = (c, era) => Math.min(0.7, host.urban[c] / Math.max(0.001, host.popOf[c]) * TOWN_AGE[era]);
    // how hard the mills bear on those who work in them: the age's, in full where a quarter of the people live in towns
    const millsOf = (c, era) => FACTORY[era] ? FACTORY[era] * Math.min(1, urbOf(c, era) * 4) : 0;
    // ----- who holds power: what each estate is by the realm's make-up, times who holds office, as shares of one -----
    function powers(c, cv, R, wars) {
      const towns = Math.max(1, host.townsOf[c]); const era = cv.era; const urb = urbOf(c, era);
      raw[EK.nobles] = 0.55 * NOBLE_AGE[era];
      raw[EK.priests] = (cv.religion ? 0.2 : 0.1) + 0.35 * Math.min(1, host.temples[c] / towns);
      raw[EK.merchants] = 0.06 + 0.25 * Math.min(1, (host.markets[c] + host.ports[c]) / towns) + 0.4 * Math.min(0.6, host.traded(c));
      raw[EK.artisans] = 0.08 + 1.1 * urb + 0.2 * Math.min(1, host.works(c) / towns);
      raw[EK.farmers] = 0.75 * (1 - urb);
      raw[EK.soldiers] = 0.14 * cv.policy.military + ((wars === undefined ? host.warsN(cv) : wars) ? 0.12 : 0);
      raw[EK.scholars] = 0.04 + 0.3 * Math.min(1, host.acad[c] / towns) + 0.08 * Math.max(0, cv.policy.research - 1) + LEARNED_AGE[era];
      // (who holds office under the form, and whose hand each law in force strengthens)
      if (dirty[c]) compile(c, R); const o = c * NE; let sum = 0; for (let e = 0; e < NE; e++) { raw[e] *= SW[o + e]; sum += raw[e]; }
      for (let e = 0; e < NE; e++) power[o + e] = raw[e] / sum;
    }
    // what makes an estate's share of power what it is, beyond its numbers: [what, weight] for the form's offices and each law that sways it
    function sways(cv, e) { const R = ruleOf(cv), F = FORM[R.gov], out = []; if (F.weights[e] !== 1) out.push([F.name, F.weights[e]]); for (let i = 0; i < NCAT; i++) { const L = LAW[R.laws[CATS[i].key]]; if (L.sway[e] !== 1) out.push([L.name, L.sway[e]]); } return out; }
    // ----- what the times do to each estate's content -----
    function conditions(c, cv, warsN) {
      const towns = Math.max(1, host.townsOf[c]); const tax = cv.policy.tax - 1, mil = cv.policy.military - 1, res = cv.policy.research - 1; const wars = warsN === undefined ? host.warsN(cv) : warsN;
      const food = host.sat(c, 'food'), lux = host.sat(c, 'luxury'), arms = host.sat(c, 'arms'), living = host.living(c);
      cond[EK.nobles] = -0.15 * tax + (cv.policy.stance === 'aggressive' ? 0.04 : 0) + 0.04 * Math.min(1, host.wonders[c]);
      cond[EK.priests] = 0.12 * Math.min(1, host.temples[c] / towns) + 0.05 * Math.min(1, host.wonders[c]) - (cv.religion ? 0 : 0.03);
      cond[EK.merchants] = 0.25 * Math.min(0.6, host.traded(c)) + 0.08 * Math.min(1, (host.markets[c] + host.ports[c]) / towns) - 0.06 * wars - 0.08 * tax;
      cond[EK.artisans] = 0.25 * LUX_AGE[cv.era] * (lux - 0.5) + 0.25 * (living - 0.5) - 0.18 * tax - 0.25 * Math.max(0, 0.8 - food) - millsOf(c, cv.era);
      cond[EK.farmers] = -0.4 * Math.max(0, 0.8 - food) - 0.22 * tax - 0.04 * wars + 0.12 * (living - 0.5);
      cond[EK.soldiers] = 0.22 * mil + 0.14 * (arms - 0.5) + (wars ? 0.03 : 0);
      cond[EK.scholars] = 0.22 * res + 0.14 * Math.min(1, host.acad[c] / towns);
      cond[EK.farmers] -= landless(cv); cond[EK.artisans] -= voiceless(cv);
    }
    // Once there are presses in the world, word goes round that those who work could rule, and they are harder to content where the
    // land is other people's and the mills answer to nobody: what agitators add to the grievances of the country and of the towns (nothing where the land has been
    // shared out, where workers may combine or are protected, where everyone votes, or where the party already rules).
    const landless = (cv) => { if (!abroad.press || cv.era < 5) return 0; const R = ruleOf(cv); if (R.gov === 'peoples' || R.laws.rights === 'suffrage') return 0; const l = R.laws.land; return l === 'estates' || l === 'fiefs' || l === 'enclosure' ? (abroad.peoples ? 0.24 : 0.15) : 0; };
    const voiceless = (cv) => { if (!abroad.press || cv.era < 6) return 0; const R = ruleOf(cv); if (R.gov === 'peoples' || R.laws.rights === 'suffrage') return 0; const l = R.laws.labour; return l === 'unions' || l === 'factoryacts' ? 0 : abroad.peoples ? 0.2 : 0.12; };
    // ----- the factors: the form, the laws in force, and what the estates give or withhold -----
    function refresh(c, cv) {
      const R = ruleOf(cv), o = c * NK; const g = own; if (dirty[c]) compile(c, R); for (let k = 0; k < NK; k++) g[o + k] = BG[o + k];
      const F = FORM[R.gov];
      // (a form held by a realm too large for it loses its grip)
      const cells = host.cellsOf[c]; if (cells > F.hi) g[o + K.stab] -= Math.min(0.2, 0.06 * Math.log2(cells / F.hi));
      const p = c * NE, md = R.mood; for (let e = 0; e < NE; e++) { const pw = power[p + e] * 4; const v = E_K[e] * (md[e] - 0.5) * 2 * (pw < 1 ? pw : 1); const i = E_LEVER[e]; if (E_STAB[e]) g[o + i] += v * 0.5; else g[o + i] *= 1 + v; }
      // (the powers of the land together: content, they steady the realm; angry, they shake it)
      let m = 0; for (let e = 0; e < NE; e++) m += power[p + e] * md[e]; g[o + K.stab] += 0.3 * (m - 0.55);
      if (host.year() - R.exile < PACE[cv.era]) g[o + K.research] *= 0.9;
      // against the age
      expectAll(cv.tech); for (let k = 0; k < NK; k++) f[o + k] = ADD[k] ? g[o + k] - EX[k] : g[o + k] / EX[k];
      if (f[o + K.cost] > 0.6) f[o + K.cost] = 0.6;
      for (let j = 0; j < FLOORED.length; j++) if (f[o + FLOORED[j]] < 0.2) f[o + FLOORED[j]] = 0.2;
    }
    // ----- what a change would cost in authority: those with power who lose by it, against those who gain -----
    function costOf(c, cv, x) {
      const R = ruleOf(cv), p = c * NE; const isForm = x.cat === undefined; const cur = isForm ? FORM[R.gov] : LAW[R.laws[x.cat]]; let opp = 0, sup = 0;
      for (let e = 0; e < NE; e++) { let d = x.likes[e] - cur.likes[e]; if (isForm) d += 0.12 * (x.weights[e] - cur.weights[e]); if (d < 0) opp -= power[p + e] * d; else sup += power[p + e] * d; }
      let cost = (isForm ? 60 : 30) * (1 + 6 * opp - 3 * sup); if (!isForm && FORM[R.gov].way[x.id]) cost *= 0.75;      // (a law that is one of the form's own ways comes easier)
      cost = Math.max(isForm ? 40 : 15, Math.min(isForm ? AUTH_MAX : 90, cost));
      if (!isForm && host.year() - (R.at[x.cat] === undefined ? -1e9 : R.at[x.cat]) < 2 * PACE[cv.era]) cost = Math.min(AUTH_MAX, cost * 1.5);      // (changed again before anyone is used to the last change)
      return Math.round(cost);
    }
    const yearsOf = (cv, x) => Math.max(2, Math.round(PACE[cv.era] * (x.cat === undefined ? 1 : 0.6)));
    // how much authority a realm gains in a year
    function gainOf(c, cv) {
      const R = ruleOf(cv); const reign = cv.ruler ? host.year() - cv.ruler.since : 0; const t = cv.ruler && cv.ruler.trait;
      return AUTH_TURN[cv.era] / PACE[cv.era] * own[c * NK + K.auth] * (0.35 + 0.9 * cv.stability) * (1 + Math.min(0.25, reign / (PACE[cv.era] * 2))) * (t === 'tyrant' ? 1.3 : t === 'steward' ? 1.15 : 1) * (1 + 0.05 * Math.min(3, host.wonders[c]));
    }
    // ----- change -----
    function setLaw(c, cv, L, how) {
      const R = ruleOf(cv); const was = LAW[R.laws[L.cat]]; if (was === L) return; R.laws[L.cat] = L.key; R.at[L.cat] = host.year(); touch(c); powers(c, cv, R); refresh(c, cv); if (how === 'granted') stats.granted++; else if (how !== 'quiet') stats.laws++;
      if (how !== 'quiet') host.event(cv, how === 'granted' ? `${host.nameOf(cv)} gives way: ${L.name.toLowerCase()} replaces ${was.name.toLowerCase()}` : `${host.nameOf(cv)} adopts a new law: ${L.name}`, false, 'law');
    }
    // how a change of form is told (a rising tells its own story)
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1), an = (t) => (/^[aeiou]/i.test(t) ? 'an ' : 'a ') + t.toLowerCase();
    const COUP = { tyranny: (b) => `A strong man takes power in ${b}`, junta: (b) => `The generals take power in ${b}`, leader: (b) => `A leader takes power in ${b}`, horde: (b) => `The riders of ${b} raise a khan on their shields`,
      peoples: (b) => `A party takes power in ${b} in the name of those who work`, empire: (b) => `${cap(b)} proclaims itself an empire` };
    function told(cv, was, F, before, how) {
      const now = host.nameOf(cv), tail = now !== before ? `: ${now}` : '', what = an(F.name), many = was.key === 'band';
      if (how === 'grown') return `${cap(before)} ${many ? 'have' : 'has'} grown into ${what}${tail}`;
      if (how === 'passed') return kindOf(F) === 1 ? `The heirs of the one who seized ${before} make ${what} of it${tail}` : `With the death of the one who seized it, ${before} becomes ${what}${tail}`;
      if (COUP[F.key]) return COUP[F.key](before) + tail;
      return `${cap(before)} ${many ? 'become' : 'becomes'} ${what}${tail}`;
    }
    function setForm(c, cv, F, how) {
      const R = ruleOf(cv); const was = FORM[R.gov]; if (was === F) return; const before = host.nameOf(cv); R.gov = F.key; cv.gov = F.key; R.since = host.year(); touch(c); powers(c, cv, R); refresh(c, cv);
      if (how === 'quiet') return; stats.forms++; if (how === 'grown') stats.grown++; else if (how === 'seized') stats.seized++; else if (how === 'passed') stats.passed++;
      if (stats.moves) { const mk = was.key + ' > ' + F.key + (how === 'reform' ? '' : ' (' + how + ')'); stats.moves[mk] = (stats.moves[mk] || 0) + 1; }      // (only counted when a tool asks: stats.moves = {})
      if (how !== 'grown') host.shake(cv, how === 'seized' ? 0.12 : 0.08);      // (a people that outgrows its old ways does so without a quarrel)
      if (how === 'seized' || was.succ !== F.succ) host.crown(cv, how);      // (how: whether he was put down, or the realm grew or reformed about him: dynasty.js)
      if (how !== 'seized') host.event(cv, told(cv, was, F, before, how), host.cellsOf[c] > 40, 'state');
    }
    // a reform is begun (the authority is spent now, the change comes when its years are up); null when begun, else why not
    function begin(c, cv, key) {
      const R = ruleOf(cv); const x = LAW[key] || FORM[key]; if (!x) return 'No such thing';
      if (R.reform) return 'A reform is already under way'; if ((x.cat === undefined ? R.gov : R.laws[x.cat]) === key) return 'Already in force';
      const why = lacks(c, cv, x); if (why) return why.know ? `Needs ${window.KNOW.LIST[KNOWN[why.know]].name}` : why.era !== undefined ? 'That belongs to a later age' : why.faith ? 'Needs a faith of the realm' : why.port ? 'Needs a harbour' : `Needs a realm of ${why.size} regions`;
      const cost = costOf(c, cv, x); if (R.auth < cost) return `Needs ${cost} authority`;
      R.auth -= cost; R.reform = { key, start: host.year(), dur: yearsOf(cv, x) }; return null;
    }
    function cancel(cv) { const R = ruleOf(cv); if (!R.reform) return; R.auth = Math.min(AUTH_MAX, R.auth + 10); R.reform = null; }
    // ----- demands: what an unhappy estate asks for, and what the ruler says -----
    // the law this estate would most like to see in place of one in force
    function wish(c, cv, e) {
      const R = ruleOf(cv); let best = null, bd = 0.06;
      for (const L of LAWS) { if (R.laws[L.cat] === L.key || lacks(c, cv, L)) continue; const d = L.likes[e] - LAW[R.laws[L.cat]].likes[e]; if (d > bd) { bd = d; best = L; } }
      return best;
    }
    function grant(c, cv) { const R = ruleOf(cv), D = R.demand; if (!D) return; R.demand = null; const L = LAW[D.key]; if (L && !lacks(c, cv, L)) { setLaw(c, cv, L, 'granted'); R.bump[D.e] += 0.12; } }
    function refuse(c, cv, lapsed) { const R = ruleOf(cv), D = R.demand; if (!D) return; R.demand = null; stats.refused++; R.bump[D.e] -= lapsed ? 0.08 : 0.1; if (!lapsed) R.auth = Math.min(AUTH_MAX, R.auth + 6); }
    // ----- risings: what an estate does when it is angry enough and strong enough -----
    function rising(c, cv, e) {
      const R = ruleOf(cv); const who = estateName(e, cv.era), name = host.nameOf(cv); const strong = power[c * NE + e]; R.rose = host.year(); R.bump[e] += 0.2; stats.risings[e]++;
      const key = ESTATES[e].key; let text; const can = (k) => !lacks(c, cv, FORM[k]) && R.gov !== k;
      // (a people's republic can be proclaimed by those who have only heard of one: the doctrine travels ahead of the knowledge)
      const red = () => R.gov !== 'peoples' && (can('peoples') || (abroad.peoples && cv.era >= (key === 'farmers' ? 5 : 6)));
      const reds = () => host.rnd() < strong * 2.2 + 0.08 + (cv.stability < 0.45 ? 0.25 : 0);
      // a rising that carries the day puts those who rose in power: the likelier the more of the realm's power they are, and the shakier it already was
      const wins = () => host.rnd() < strong * 1.6 + (cv.stability < 0.45 ? 0.25 : 0);
      if (key === 'farmers') { host.shake(cv, 0.14); host.lose(cv, 0.04);
        if (red() && reds()) { text = `${who} and workers of ${name} overthrow the old order`; R.brought = 'peoples'; setForm(c, cv, FORM.peoples, 'seized'); }
        else if (cv.era >= 6 && can('parliament') && FORM[R.gov].succ !== 'elected' && wins()) { text = `${who} of ${name} march on the capital: the old order is swept away, and a republic proclaimed`; setForm(c, cv, FORM.parliament, 'seized'); }
        else { text = `${who} rise across ${name}: barns burn and the tax is not paid`; if (cv.stability < 0.45 && host.rnd() < 0.4) host.split(cv, 'as the countryside rises'); } }
      else if (key === 'nobles') { host.shake(cv, 0.15); const F = pickForm(c, cv, e);
        if (F && wins()) { text = `${who} of ${name} take the government into their own hands`; setForm(c, cv, F, 'seized'); }
        else { text = `${who} of ${name} take up arms against their ruler`; if (cv.stability < 0.45 && host.rnd() < 0.35) host.split(cv, 'as great houses go their own way'); } }
      else if (key === 'priests') { host.shake(cv, 0.1); if (cv.religion && can('theocracy') && wins()) { text = `The faithful of ${name} rise, and ${who.toLowerCase()} take the government`; setForm(c, cv, FORM.theocracy, 'seized'); } else text = `A schism splits the faithful of ${name}`; }
      else if (key === 'merchants') { host.shake(cv, 0.08); host.fine(cv, 0.3); text = `${who} of ${name} shut their counting houses, and coin leaves the country`; }
      else if (key === 'artisans') { host.shake(cv, 0.12);
        if (red() && reds()) { text = `${who} of ${name} rise, and a party takes power in their name`; R.brought = 'peoples'; setForm(c, cv, FORM.peoples, 'seized'); }
        else if (cv.era >= 6 && can('parliament') && FORM[R.gov].succ !== 'elected' && wins()) { text = `${who} of ${name} take to the barricades, and a republic is proclaimed`; setForm(c, cv, FORM.parliament, 'seized'); }
        else text = cv.era < 2 ? `${who} of ${name} down their tools and will not work` : `Riots fill the towns of ${name}`; }
      else if (key === 'soldiers') { host.shake(cv, 0.15); const F = can('leader') && host.rnd() < 0.5 ? FORM.leader : can('junta') ? FORM.junta : can('tyranny') && cv.era < 6 ? FORM.tyranny : null;
        if (F && host.rnd() < 0.3 + strong * 2) { text = `${who} of ${name} march on the capital and take it`; setForm(c, cv, F, 'seized'); } else text = `${who} of ${name} mutiny over their pay`; }
      else { R.exile = host.year(); host.shake(cv, 0.06); text = `${who} of ${name} fall silent or go abroad, and its schools empty`; }
      host.event(cv, text, host.cellsOf[c] > 200, 'rising'); host.alarm(cv, 'rising');
    }
    // the form an estate would put in place if it could: the one that gives it most, among those the realm knows
    function pickForm(c, cv, e) { const R = ruleOf(cv); let best = null, bs = FORM[R.gov].weights[e] + 3 * FORM[R.gov].likes[e] + 0.2; for (const F of FORMS) { if (F.key === R.gov || lacks(c, cv, F)) continue; const s = F.weights[e] + 3 * F.likes[e]; if (s > bs) { bs = s; best = F; } } return best; }
    // ----- the autopilot: what a ruler left to himself would change -----
    // Every people has leanings of its own: a number for each form and law, the same for as long as the people lasts (q is drawn
    // when it is born). A change is weighed as the new thing's number over the old one's, so that no people goes back and forth.
    const quirk = (R, x) => 0.8 + 0.45 * ((((R.q ^ Math.imul(x.id + 1 + (x.cat === undefined ? 1000 : 0), 0x9E3779B1)) >>> 0) % 1009) / 1009);
    function lawWeight(c, cv, L) {
      const R = ruleOf(cv), cur = LAW[R.laws[L.cat]], p = c * NE, g = L.gives, h = cur.gives; let w = quirk(R, L) / quirk(R, cur); const F = FORM[R.gov], kd = kindOf(F);
      w *= L.era > cur.era ? 1 + 0.45 * (L.era - cur.era) : L.era < cur.era ? (F.way[L.id] ? 0.6 : 0.35) : 1;      // (the ways of a later age replace those of an earlier; less surely where the old way is the form's own)
      let s = 0; for (let e = 0; e < NE; e++) s += power[p + e] * (L.likes[e] - cur.likes[e]); w *= Math.max(kd ? 0.25 : 0.15, Math.min(3, 1 + (kd === 2 ? 3.5 : kd === 1 ? 5 : 7) * s));      // (those in power get what they want; less so under a crown, least where power was taken)
      const d = (k) => (g[k] || 0) - (h[k] || 0);
      const over = host.cellsOf[c] / Math.max(1, host.span(cv)); if (over > 0.8) w *= Math.max(0.3, 1 + 3 * d('reach') * Math.min(2, over));
      w *= Math.max(0.3, 1 + (cv.wealth < 0 ? 5 : 2.2) * (d('tax') - d('cost')) - 0.5 * d('upkeep') * Math.max(0.5, cv.policy.military - 0.5)); if (host.warsN(cv)) w *= Math.max(0.3, 1 + 3 * d('strength'));
      w *= Math.max(0.3, 1 + (cv.stability < 0.5 ? 9 : 2.5) * d('stab')); w *= Math.max(0.4, 1 + 1.5 * d('research') + 1.5 * d('food') + d('work') + d('trade') + d('yield'));
      if (kd) w *= Math.max(0.5, 1 + (kd === 2 ? 1.2 : 0.5) * d('auth'));      // (who answers to nobody wants a freer hand)
      // (and likes no over-mighty subject: where one estate holds a third of the power, he reaches for whatever would cut it down)
      if (kd) { let top = 0; for (let e = 1; e < NE; e++) if (power[p + e] > power[p + top]) top = e; if (power[p + top] > 0.3) { const r = L.sway[top] / cur.sway[top]; w *= r < 1 ? 1 + 2.5 * (1 - r) : Math.max(0.6, 1 - 0.8 * (r - 1)); } }
      if (kd === 2) w *= Math.max(0.5, Math.min(1.8, 1 - 0.8 * d('unrest')));      // (and fears those who might do to him what he did)
      if (F.way[L.id]) w *= 1.5; if (F.way[cur.id]) w /= 1.5;      // (every form has its own ways)
      const lean = cv.ruler && LEAN[cv.ruler.trait]; if (w > 1 && lean && lean[L.cat]) w = 1 + (w - 1) * lean[L.cat];      // (a ruler presses hardest where his heart is)
      return w;
    }
    function formWeight(c, cv, F, free) {
      const R = ruleOf(cv), cur = FORM[R.gov], p = c * NE; let w = Math.sqrt(quirk(R, F) / quirk(R, cur)); const cells = host.cellsOf[c];
      w *= F.era > cur.era ? 1 + 0.4 * (F.era - cur.era) : F.era < cur.era ? Math.max(0.4, 1 - 0.3 * (cur.era - F.era)) : 1;
      let s = 0; for (let e = 0; e < NE; e++) s += power[p + e] * (F.likes[e] - cur.likes[e] + 0.1 * (F.weights[e] - cur.weights[e])); w *= Math.max(0.15, Math.min(3, 1 + 5 * s));
      const stale = cv.era - cur.era; if (stale >= 1 && F.era > cur.era) w *= 1 + 0.15 * stale;      // (a form of an age gone by: anything newer looks better)
      if (cells > F.hi) w *= 0.25; if (cells > cur.hi) w *= 1.8;      // (too large for what it has: something must give)
      const tg = host.tongue(cv); if (F.key === 'horde') w *= tg === 'turkic' ? 2.2 : 0.35; if (cur.key === 'horde') w *= tg === 'turkic' ? 0.6 : 1.5; if (F.key === 'mandate') w *= tg === 'sinitic' ? 2 : 0.25;
      if (F.key === 'citystate' || F.key === 'democracy') w *= cells <= F.hi * 0.7 ? 1.4 : 0.3; if (F.lo) w *= 1.5;      // (a realm large enough to be an empire wants to be called one)
      if (F.key === 'league' && cur.key !== 'chiefdom' && cur.key !== 'band') w *= 0.15;      // (a league is what tribes make, not what kingdoms become)
      if (F.key === 'theocracy') w *= power[p + EK.priests] > 0.2 ? 1 : 0.4;      // (the faithful come to rule where they are already the strongest voice)
      if (cur.key === 'crown' && F.key === 'absolute') w *= 0.5;      // (a parliament that holds the purse is not sent home)
      if (F.key === 'absolute') { const ad = R.laws.admin; w *= (R.laws.army === 'standing' ? 1.3 : 0.8) * (ad === 'intendants' || ad === 'examined' || ad === 'governors' ? 1.3 : 0.8); }      // (a crown with soldiers and officials of its own breaks its lords)
      if (F.key === 'crown') w *= power[p + EK.merchants] + power[p + EK.artisans] > 0.3 ? 1.2 : 0.6;      // (where the towns are strong, a parliament holds the purse)
      const lean = cv.ruler && FORM_LEAN[cv.ruler.trait]; if (lean) { if (lean[F.key]) w *= lean[F.key]; if (lean[cur.key]) w /= lean[cur.key]; }
      // Power is open (elected, or chosen by elders), inherited, or closed (seized, or handed on by whoever holds it). Those who hold it
      // one way seldom reform themselves into another, unless the ground is giving way under them: a crown does not call elections
      // (one that already sits in parliament may), an elected government does not abolish them, a strongman is not followed by a vote.
      const a = kindOf(cur), b = kindOf(F);
      // (how far the ground has given way: nothing in a steady realm, everything in one that is coming apart)
      // (those who took power, or were handed it, give it up later than any: only when everything is coming down)
      const tr = Math.max(0, Math.min(1, (0.72 - cv.stability) / 0.27)), trouble = a === 2 ? tr * tr : tr, mix = (calm, shaken) => calm + (shaken - calm) * trouble;
      const hard = cv.ruler && (cv.ruler.trait === 'tyrant' || cv.ruler.trait === 'conqueror');
      if (!free && a !== b && !(F.lo && !cur.lo && b !== 0) && !(cur.key === 'chiefdom' || cur.key === 'band')) {
        if (b === 0) w *= mix(cur.key === 'crown' ? 0.6 : a === 1 ? (cv.era >= 7 ? 0.38 : 0.3) : 0.2, 1.3);      // (in the age of nations a crown gives way more readily)
        else if (b === 2) w *= Math.max(hard ? (a === 0 ? 1 : cv.era < 5 ? 0.8 : 0.5) : 0, mix(0.2, 1.2));      // (a hard man raised by a vote may not wait for the next one; a hard king of the old kind sets his council aside)
        else w *= mix(a === 0 && cv.era < 6 ? 0.6 : 0.4, 1);
      }
      if (!free && host.year() - R.since < PACE[cv.era]) w *= 0.3;      // (a new order is not questioned while it is new)
      // a ruler who answers to nobody, changing his own government, wants a freer hand from it: the crown breaks its lords when it can
      if (!free && a === b && a !== 0) w *= Math.max(0.5, 1 + 0.8 * ((F.gives.auth || 0) - (cur.gives.auth || 0)));
      return w;
    }
    // What was seized seldom outlives the one who seized it: when he dies, as often as not his heirs make a crown of it, or the old
    // order comes back (the simulation calls this when a ruler who was not elected is followed by another; the player's realm is his own to change).
    function passes(c, cv) {
      const R = ruleOf(cv), F = FORM[R.gov]; if (cv.player || F.succ !== 'seized' || host.rnd() > 0.3) return false;
      let bf = null, bw = 0.6; for (const X of FORMS) { if (X.key === R.gov || kindOf(X) === 2 || lacks(c, cv, X)) continue; const w = formWeight(c, cv, X, true) * (kindOf(X) === 1 ? 2 : 1); if (w > bw) { bw = w; bf = X; } }
      if (!bf) return false; R.reform = null; setForm(c, cv, bf, 'passed'); return true;
    }
    // the best change open to it: { x, w, cost } or null (free: whatever it would cost; else only what its authority covers)
    function best(c, cv, free) {
      const R = ruleOf(cv); let bx = null, bw = 1.12, bc = 0;
      for (const F of FORMS) { if (F.key === R.gov || lacks(c, cv, F)) continue; const w = formWeight(c, cv, F); if (w > bw) { const cost = free ? 0 : costOf(c, cv, F); if (free || cost <= R.auth) { bw = w; bx = F; bc = cost; } } }
      for (const L of LAWS) { if (R.laws[L.cat] === L.key || lacks(c, cv, L)) continue; const w = lawWeight(c, cv, L); if (w > bw) { const cost = free ? 0 : costOf(c, cv, L); if (free || cost <= R.auth) { bw = w; bx = L; bc = cost; } } }
      return bx ? { x: bx, w: bw, cost: bc } : null;
    }
    function consider(c, cv) {
      const R = ruleOf(cv);
      // a form it wants badly it saves up for, and passes no law meanwhile
      let bf = null, bw = 1.3; for (const F of FORMS) { if (F.key === R.gov || lacks(c, cv, F)) continue; const w = formWeight(c, cv, F); if (w > bw) { bw = w; bf = F; } }
      if (bf) { if (costOf(c, cv, bf) <= R.auth) begin(c, cv, bf.key); return; }
      const b = best(c, cv, false); if (b) begin(c, cv, b.x.key);
    }
    // a people that comes into the world knowing things has the laws of its age already (so has a world saved before there were laws)
    function settle(c, cv) {
      const R = ruleOf(cv); touch(c); powers(c, cv, R); refresh(c, cv);
      for (let n = 0; n < 40; n++) { const b = best(c, cv, true); if (!b) break; if (b.x.cat === undefined) setForm(c, cv, b.x, 'quiet'); else { R.laws[b.x.cat] = b.x.key; touch(c); } powers(c, cv, R); refresh(c, cv); }
      R.at = {}; for (let e = 0; e < NE; e++) R.mood[e] = 0.55; refresh(c, cv);
    }
    // ----- a year -----
    function step(c, cv) {
      const R = ruleOf(cv); const era = cv.era, pace = PACE[era], year = host.year();
      const wars = host.warsN(cv); powers(c, cv, R, wars); conditions(c, cv, wars);
      if (!abroad.peoples && ((year + c) & 7) === 0) {
        if (!abroad.press && known(c, LAW.press)) { abroad.press = true; if (host.news) host.news(cv, `Presses turn in ${host.nameOf(cv)}. What they print is read across every border, and those who own nothing learn that it need not be so`); }
        if (known(c, FORM.peoples)) { abroad.peoples = abroad.press = true; if (host.news) host.news(cv, `In ${host.nameOf(cv)} it is worked out how a party could rule in the name of all who work. The idea needs no passport`); }
      }
      // content drifts to where the form, the laws and the times put it: half-way in half a turn
      const k = K_AGE[era], fade = FADE_AGE[era]; const F = FORM[R.gov]; const pe = c * NE;
      for (let e = 0; e < NE; e++) { const t = LK[pe + e] + cond[e] + R.bump[e]; R.mood[e] = r5(R.mood[e] + (bent(t) - R.mood[e]) * k); R.bump[e] = Math.abs(R.bump[e]) < 2e-4 ? 0 : r5(R.bump[e] * fade); }      // (kept to five places: a save is text)
      R.auth = Math.round(Math.min(AUTH_MAX, R.auth + gainOf(c, cv)) * 1000) / 1000;
      // a reform whose years are up comes into force
      if (R.reform && year >= R.reform.start + R.reform.dur) { const x = LAW[R.reform.key] || FORM[R.reform.key]; R.reform = null; if (x && !lacks(c, cv, x)) { if (x.cat === undefined) setForm(c, cv, x, 'reform'); else setLaw(c, cv, x, 'reform'); host.alarm(cv, 'reform'); } }
      // a people that has outgrown the ways of a band or a chiefdom changes them without a quarrel (the player's own is his to change)
      if (!cv.player && !R.reform && host.cellsOf[c] > F.hi * 1.5 && (F.key === 'band' || F.key === 'chiefdom') && host.rnd() < 2 / pace) { const b = F.key === 'band' ? FORM.chiefdom : FORM.kingdom; if (!lacks(c, cv, b)) setForm(c, cv, b, 'grown'); }
      // the estate that is angriest for its weight asks, and if it is angry enough, acts
      const p = c * NE; let worst = -1, ws = 0; for (let e = 0; e < NE; e++) { const s = power[p + e] * Math.max(0, 0.45 - R.mood[e]); if (s > ws) { ws = s; worst = e; } }
      if (R.demand && year >= R.demand.until) refuse(c, cv, true);
      if (worst >= 0 && power[p + worst] >= 0.08) {
        if (!R.demand && R.mood[worst] < 0.4 && year - (R.asked || -1e9) > 3 * pace && host.rnd() < 1 / pace) { const L = wish(c, cv, worst); if (L) { stats.demands++; R.asked = year; R.demand = { e: worst, key: L.key, since: year, until: year + 2 * pace }; if (cv.player) { host.event(cv, `${estateName(worst, era)} demand a new law: ${L.name}`, false, 'demand'); host.alarm(cv, 'demand'); } else if (cv.stability < 0.55 || host.rnd() < (kindOf(F) === 0 ? 0.6 : 0.3)) grant(c, cv); else refuse(c, cv, false); } }
        const m = R.mood[worst]; if (m < 0.35 && year - R.rose > pace && host.rnd() < (0.35 - m) / 0.35 * power[p + worst] * 2.5 / pace * f[c * NK + K.unrest]) rising(c, cv, worst);
      }
      // the army: where the realm is coming apart, or the soldiers have had enough, someone marches on the capital (once anyone knows how a strong man rules)
      if (cv.stability < 0.65 || R.mood[EK.soldiers] < 0.55) { const sp = power[p + EK.soldiers], t = Math.max(0, Math.min(1, (0.65 - cv.stability) / 0.3)), d = Math.max(0, Math.min(1, (0.55 - R.mood[EK.soldiers]) / 0.25)), press = t > d ? t : d;
        if (FORM[R.gov].succ !== 'seized' && year - R.rose > pace && year - R.since > pace && known(c, FORM.tyranny) && host.rnd() < (era >= 7 && FORM[R.gov].succ === 'elected' ? 0.5 : 1) / pace * Math.min(1, sp * 6) * press * f[c * NK + K.unrest]) rising(c, cv, EK.soldiers); }      // (where governments change by the ballot an army thinks twice)
      if (!cv.player && !R.reform && year >= R.think) { R.think = year + Math.max(3, Math.round(pace * (0.3 + 0.5 * host.rnd()))); consider(c, cv); }
      refresh(c, cv);
    }
    // a new realm: one cut from another keeps its parent's laws (and takes a form fit for a breakaway); one from the wild begins as a band
    function born(c, cv, from) {
      const P = from >= 0 && civs[from] && civs[from].rule ? civs[from].rule : null;
      const R = cv.rule = fresh(P ? P.gov : 'band');
      if (P) {
        // It keeps its parent's laws. Its form too, unless that is too grand a thing for a province (an empire, a union), or the province
        // was only ever held by the faith or by the capital's officials: then whoever holds the sword there makes himself its lord
        // (in the ages of the lords), its king, or, in the age of nations, as often its president.
        R.laws = Object.assign({}, P.laws); const PF = FORM[P.gov], era = cv.era || 0, open = kindOf(PF) === 0; let tries = null;
        if (PF.lo > 0 && open) tries = ['liberal', 'parliament', 'republic', 'kingdom', 'chiefdom'];
        else if (PF.lo > 0 || (PF.kind === 'faith' && host.rnd() < 0.5) || (!open && era >= 4 && era < 6 && PF.key !== 'feudal' && PF.key !== 'horde' && host.rnd() < 0.5))
          tries = era >= 6 ? (host.rnd() < 0.5 ? ['parliament', 'absolute', 'kingdom', 'chiefdom'] : ['absolute', 'feudal', 'kingdom', 'chiefdom']) : era >= 4 ? ['feudal', 'kingdom', 'chiefdom'] : ['kingdom', 'chiefdom'];
        if (tries) { R.gov = 'band'; for (const k of tries) if (known(c, FORM[k])) { R.gov = k; break; } if (stats.moves) { const mk = P.gov + ' > ' + R.gov + ' (a province breaks away)'; stats.moves[mk] = (stats.moves[mk] || 0) + 1; } }
      }
      cv.gov = R.gov; touch(c); powers(c, cv, R); refresh(c, cv); return R;
    }
    // what the world has heard of, for a save; and after a load (a world saved before this is asked realm by realm, and nothing is announced)
    function hear(o) {
      if (o) { abroad.press = !!o.press; abroad.peoples = !!o.peoples; return; } abroad.press = abroad.peoples = false;
      for (let c = 0; c < MAXC; c++) if (civs[c]) { if (known(c, LAW.press)) abroad.press = true; if (known(c, FORM.peoples)) abroad.peoples = true; }
    }
    // after a load: every realm's factors from what it has chosen (a law or a form this version no longer has falls back to the first)
    function wake(c, cv) {
      const had = !!cv.rule; const R = ruleOf(cv); if (!FORM[R.gov]) R.gov = 'band'; cv.gov = R.gov;
      for (let i = 0; i < NCAT; i++) { const ck = CATS[i].key; if (!LAW[R.laws[ck]] || LAW[R.laws[ck]].cat !== ck) R.laws[ck] = FIRST[i]; }
      if (!R.at) R.at = {}; if (R.q === undefined) R.q = (host.rnd() * 0x7fffffff) | 0; if (!R.mood || R.mood.length !== NE) R.mood = new Array(NE).fill(0.55); if (!R.bump || R.bump.length !== NE) R.bump = new Array(NE).fill(0);
      if (R.reform && !(LAW[R.reform.key] || FORM[R.reform.key])) R.reform = null; if (R.demand && !LAW[R.demand.key]) R.demand = null;
      touch(c); powers(c, cv, R); refresh(c, cv); return had;
    }
    // what a realm is called, and its ruler, under its form and in its tongue
    function naming(cv, formKey) { const F = FORM[formKey || (cv.rule ? cv.rule.gov : OLD_FORM[cv.gov] || cv.gov)] || FORM.band; const t = TONGUE[host.tongue(cv)]; const v = t && t[F.key]; return v ? { pattern: v[0], titles: [v[1], v[2]] } : { pattern: F.pattern, titles: F.titles }; }
    const fullName = (cv, formKey) => naming(cv, formKey).pattern.replace('{n}', cv.name);
    // what moves an estate's content, largest first: [what, by how much]
    function reasons(c, cv, e) {
      const R = ruleOf(cv); conditions(c, cv); const out = []; const F = FORM[R.gov];
      if (F.likes[e]) out.push([F.name, F.likes[e]]); for (let i = 0; i < NCAT; i++) { const L = LAW[R.laws[CATS[i].key]]; if (L.likes[e]) out.push([L.name, L.likes[e]]); }
      if (Math.abs(cond[e]) >= 0.005) out.push(['The times', cond[e]]); if (Math.abs(R.bump[e]) >= 0.01) out.push([R.bump[e] > 0 ? 'A wish granted, or anger spent' : 'A demand refused', R.bump[e]]);
      out.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])); return out;
    }
    // what the times do to an estate, in parts, for the page: [what, by how much]
    function times(c, cv, e) {
      const towns = Math.max(1, host.townsOf[c]); const tax = cv.policy.tax - 1, mil = cv.policy.military - 1, res = cv.policy.research - 1; const wars = host.warsN(cv); const out = []; const key = ESTATES[e].key;
      const food = host.sat(c, 'food'), lux = host.sat(c, 'luxury'), arms = host.sat(c, 'arms'), living = host.living(c); const put = (t, v) => { if (Math.abs(v) >= 0.005) out.push([t, v]); };
      if (key === 'nobles') { put('Taxes', -0.15 * tax); put('A warlike stance', cv.policy.stance === 'aggressive' ? 0.04 : 0); put('Wonders', 0.04 * Math.min(1, host.wonders[c])); }
      else if (key === 'priests') { put('Temples', 0.12 * Math.min(1, host.temples[c] / towns)); put('Wonders', 0.05 * Math.min(1, host.wonders[c])); put('No faith of the realm', cv.religion ? 0 : -0.03); }
      else if (key === 'merchants') { put('Trade across the border', 0.25 * Math.min(0.6, host.traded(c))); put('Markets and harbours', 0.08 * Math.min(1, (host.markets[c] + host.ports[c]) / towns)); put('War', -0.06 * wars); put('Taxes', -0.08 * tax); }
      else if (key === 'artisans') { put('Luxuries', 0.25 * LUX_AGE[cv.era] * (lux - 0.5)); put('How well people live', 0.25 * (living - 0.5)); put('Taxes', -0.18 * tax); put('Hunger', -0.25 * Math.max(0, 0.8 - food)); put('The mills: long hours, low pay', -millsOf(c, cv.era)); put('Agitators promise them the mills', -voiceless(cv)); }
      else if (key === 'farmers') { put('Hunger', -0.4 * Math.max(0, 0.8 - food)); put('Taxes', -0.22 * tax); put('War', -0.04 * wars); put('How well people live', 0.12 * (living - 0.5)); put('Agitators promise them the land', -landless(cv)); }
      else if (key === 'soldiers') { put('Pay', 0.22 * mil); put('Arms', 0.14 * (arms - 0.5)); put('War', wars ? 0.03 : 0); }
      else { put('Scholars\' pay', 0.22 * res); put('Academies', 0.14 * Math.min(1, host.acad[c] / towns)); }
      out.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])); return out;
    }
    // where an estate's content is heading
    function heading(c, cv, e) { const R = ruleOf(cv); conditions(c, cv); let t = FORM[R.gov].likes[e] + cond[e] + R.bump[e]; for (let i = 0; i < NCAT; i++) t += LAW[R.laws[CATS[i].key]].likes[e]; return bent(t); }
    return { NK, NE, K, f, own, power, stats, expect, ruleOf, lacks, known, costOf, yearsOf, gainOf, begin, cancel, grant, refuse, wish, step, born, settle, wake, refresh, setLaw, setForm, naming, fullName, reasons, times, heading, lawWeight, formWeight, best, rising, powers, sways, passes, abroad, hear,
      succession(cv) { return FORM[ruleOf(cv).gov].succ; } };
  }
  return { PACE, AUTH_MAX, ESTATES, EK, NE, KEYS, K, NK, ADDED, NORM, NORMED, START, KINDS, FORMS, FORM, CATS, CAT, LAWS, LAW, NL, TONGUE, OLD_FORM, LEAN, SWAY, WAYS, FACTORY, kindOf, opens, estateName, age, create };
})();
