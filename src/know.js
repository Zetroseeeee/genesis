// Holocene knowledge (classic script; exposes window.KNOW). Pure data and arithmetic, no DOM: the simulation owns
// one (KNOW.create) and tells it once a year what each realm learned; the page reads it.
//
// What a people knows is a set of discoveries. Each belongs to an age and a branch, stands on earlier ones, costs
// insight, and gives things: land that can now be worked for a good, crafts (ECON recipes), works a town can raise,
// and an edge in food, coin, arms and the rest.
//
// Insight is the simulation's `tech` (times UNIT, for the player's eye): what a realm gains in knowledge in a year
// is what it can spend on discoveries that year. Its age still comes from `tech`, and the discoveries of an age cost
// together exactly what the age is long, so a realm that studies without a pause has learned what its age can teach
// when the age ends. Edges are measured against that: (1 + what you know) / (1 + what your age expects). A realm
// ahead of its age in farming feeds more than the simulation's tables say, one behind feeds fewer, and one that
// keeps step is where the tables put it: history keeps its pace whatever realms choose to learn first.
(function () {
  'use strict';
  const UNIT = 100000;            // insight as shown: tech times this
  const T0 = 0.02;                // every people starts with this much; what its tech is above it, it can spend
  const ERA_AT = [0, 0.08, 0.18, 0.30, 0.42, 0.55, 0.66, 0.80, 0.92, 1.0];      // where each age begins (the simulation takes its ages from here)
  const BRANCHES = [
    { key: 'land', name: 'Land', note: 'fields, herds, mines' }, { key: 'craft', name: 'Craft', note: 'making things' }, { key: 'trade', name: 'Trade', note: 'markets, ships, roads' },
    { key: 'war', name: 'War', note: 'arms and walls' }, { key: 'state', name: 'State', note: 'rule and law' }, { key: 'mind', name: 'Mind', note: 'learning, faith, healing' },
  ];
  // the edges a discovery can give. Sums, measured against what the age expects (stab is added, the rest multiply)
  const KEYS = ['food', 'grow', 'income', 'research', 'strength', 'stab', 'build', 'health', 'trade', 'reach', 'sea', 'siege', 'defence',
    'c_crafts', 'c_metal', 'c_textile', 'c_food', 'c_ship', 'c_heavy', 'c_chem', 'c_tech', 'y_crop', 'y_herd', 'y_fish', 'y_wood', 'y_mine', 'y_well'];
  const NK = KEYS.length; const K = {}; KEYS.forEach((k, i) => { K[k] = i; });
  // which goods each yield group covers (ECON keys)
  const GROUPS = {
    y_crop: ['grain', 'rice', 'maize', 'olives', 'wine', 'spices', 'cotton', 'sugar', 'tea', 'coffee', 'cocoa', 'tobacco', 'incense', 'dyes', 'rubber', 'silk'],
    y_herd: ['cattle', 'horses', 'wool'], y_fish: ['fish'], y_wood: ['timber', 'furs', 'ivory'],
    y_mine: ['stone', 'salt', 'copper', 'tin', 'iron', 'gold', 'gems', 'silver', 'obsidian', 'jade', 'amber', 'saltpetre', 'coal', 'uranium', 'bauxite', 'rareearth', 'lithium'], y_well: ['oil', 'gas'],
  };
  // the works a discovery can open (the simulation's BUILD kinds), and the plain abilities
  const WORKS = ['farm', 'walls', 'port', 'market', 'temple', 'academy', 'workshop', 'weaver', 'smithy', 'brewery', 'granary', 'warehouse', 'shipyard', 'factory', 'refinery', 'lab', 'wonder', 'levy', 'fleet'];
  const CANS = ['quarry', 'ores', 'colonies', 'faith', 'oceans'];

  // ---------- the discoveries ----------
  // [key, name, age, branch, weight, stands on, what it gives, a line about it, marks]   marks: c = an age cannot do without it (the
  // autopilot learns these early), f = the world remembers who was first
  const RAW = [
    // ----- Stone Age -----
    ['farming', 'Farming', 0, 'land', 1.4, '', { food: 0.12, y_crop: 0.3, farm: 2 }, 'Wild grasses sown on purpose, season after season, until the grain can no longer seed itself. A field feeds many times the people a hunting ground does.', 'cf'],
    ['herding', 'Herding', 0, 'land', 1.0, '', { food: 0.06, y_herd: 0.3, recipes: ['leather'] }, 'Sheep, goats and cattle kept instead of hunted: meat that walks beside you, milk, hides and wool.', ''],
    ['fishing', 'Fishing', 0, 'land', 0.8, '', { food: 0.04, y_fish: 0.4 }, 'Nets, bone hooks and weirs of woven branches. A shore or a river feeds a village the year round.', ''],
    ['pottery', 'Pottery', 0, 'craft', 1.0, '', { recipes: ['pottery'], works: ['workshop'] }, 'Clay shaped and fired hard. Pots hold water, grain and oil, and keep the mice out.', 'cf'],
    ['weaving', 'Weaving', 0, 'craft', 1.0, '', { recipes: ['cloth', 'cloth_plain'], works: ['weaver'] }, 'Flax and wool spun on a spindle and woven on a loom weighted with stones.', 'c'],
    ['quarrying', 'Quarrying', 0, 'craft', 0.8, '', { y_mine: 0.25, build: 0.04, can: ['quarry'] }, 'Flint dug from shafts in the chalk, and stone split from the hill with wedges and fire.', ''],
    ['brewing', 'Brewing', 0, 'craft', 0.7, 'farming', { recipes: ['beer'], works: ['brewery'], stab: 0.01 }, 'Grain left wet turns to drink. Beer is safe where the water is not, and no feast is held without it.', ''],
    ['storage', 'Storehouses', 0, 'trade', 0.8, 'pottery', { works: ['granary'], grow: 0.04 }, 'Pits lined with clay and granaries raised on posts: the harvest of a good year carried over into a bad one.', ''],
    ['boats', 'Rafts and canoes', 0, 'trade', 0.8, '', { trade: 0.15, y_fish: 0.15, reach: 0.05 }, 'Dugout logs and bundles of reed. Rivers stop being walls and become roads.', ''],
    ['barter', 'Barter', 0, 'trade', 0.7, '', { trade: 0.25, income: 0.06 }, 'Obsidian from the mountain for shells from the sea, passed from hand to hand across a thousand miles.', ''],
    ['bow', 'The bow', 0, 'war', 0.8, '', { strength: 0.14, y_wood: 0.2 }, 'A bent stave and a string send a point farther and harder than any arm. Hunters and raiders both carry it.', ''],
    ['palisade', 'Palisades', 0, 'war', 0.8, '', { walls: 1, defence: 0.1 }, 'A ditch, a bank and a fence of sharpened trunks around the houses.', ''],
    ['chiefs', 'Chieftains', 0, 'state', 0.9, '', { reach: 0.12, stab: 0.02, works: ['levy'] }, 'One family speaks for the tribe, settles its quarrels and calls its men to fight.', ''],
    ['ritual', 'Ritual and burial', 0, 'mind', 0.9, '', { works: ['temple'], stab: 0.03 }, 'The dead are laid down with care and the seasons are kept with feasts. A place is set apart for it.', ''],
    ['megaliths', 'Megaliths', 0, 'mind', 1.0, 'ritual quarrying', { works: ['wonder'], stab: 0.02 }, 'Stones heavier than houses dragged for miles and stood on end, by people with no metal and no wheel.', 'f'],
    ['herblore', 'Herb lore', 0, 'mind', 0.6, '', { health: 0.1, grow: 0.03 }, 'Which leaf closes a wound, which bark breaks a fever, which root kills.', ''],
    ['tally', 'Counting', 0, 'mind', 0.7, '', { research: 0.1, income: 0.03 }, 'Notches on a bone and clay tokens in a pouch: so many sheep, so many jars, so many days.', ''],
    // ----- Bronze Age -----
    ['irrigation', 'Irrigation', 1, 'land', 1.2, 'farming', { food: 0.12, y_crop: 0.15, farm: 3 }, 'Canals, dikes and the shaduf: the river led out over the fields, and its flood held back or let in.', ''],
    ['plough', 'The plough', 1, 'land', 1.0, 'farming herding', { food: 0.08, grow: 0.03 }, 'An ox drags a pointed beam through the soil. One family works five times the land it could dig.', ''],
    ['horse', 'Horse taming', 1, 'land', 1.0, 'herding', { goods: ['horses'], reach: 0.1, strength: 0.04 }, 'On the grasslands people learn to herd horses, then to drive them, then to ride.', 'f'],
    ['orchards', 'Vine and olive', 1, 'land', 0.8, 'farming', { goods: ['wine', 'olives'], y_crop: 0.1, stab: 0.01 }, 'Trees and vines that take years to bear, pressed for oil and wine. People who plant them mean to stay.', ''],
    ['mining', 'Mining', 1, 'land', 1.1, 'quarrying', { goods: ['gold', 'silver', 'gems'], y_mine: 0.25, can: ['ores'] }, 'Shafts follow the vein into the rock. Ore is broken with fire and water and smelted in clay furnaces.', ''],
    ['copper', 'Copper working', 1, 'craft', 1.0, 'pottery', { goods: ['copper'], recipes: ['arms_copper'], works: ['smithy'] }, 'Green stone heated in a potter\'s kiln runs out as metal. It can be cast, hammered, and melted down again.', 'c'],
    ['bronze', 'Bronze casting', 1, 'craft', 1.3, 'copper', { goods: ['tin'], recipes: ['bronze', 'arms_bronze'], strength: 0.08 }, 'One part tin to nine of copper makes a metal harder than either. Tin is rare, and worth crossing the world for.', 'cf'],
    ['wheel', 'The wheel', 1, 'craft', 1.0, 'pottery', { c_crafts: 0.15, trade: 0.1, build: 0.03 }, 'First a turning table for the potter, then two discs on an axle under a cart.', 'f'],
    ['masonry', 'Masonry', 1, 'craft', 1.0, 'quarrying', { walls: 2, build: 0.05, defence: 0.1 }, 'Dressed stone and fired brick laid in courses. Walls that stand for centuries.', ''],
    ['jewellery', 'Goldsmithing', 1, 'craft', 0.8, 'mining', { recipes: ['jewel_gold', 'jewel_silver', 'jewel_gems'], stab: 0.01 }, 'Gold beaten into leaf, silver drawn into wire, stones cut and set. Wealth small enough to wear.', ''],
    ['sailing', 'Sailing', 1, 'trade', 1.1, 'boats weaving', { works: ['port'], sea: 0.2, trade: 0.1 }, 'A mast, a square sail and a steering oar. Ships hug the coast from harbour to harbour.', 'c'],
    ['markets', 'Markets', 1, 'trade', 1.0, 'barter', { works: ['market', 'warehouse'], income: 0.08, trade: 0.2 }, 'A set place and a set day where anyone may buy and sell, under the eye of whoever keeps the peace.', 'c'],
    ['weights', 'Weights and measures', 1, 'trade', 0.8, 'tally markets', { income: 0.08, trade: 0.1 }, 'A stone that weighs a shekel is the same stone in every stall. Silver by weight becomes money.', ''],
    ['caravans', 'Caravans', 1, 'trade', 0.8, 'herding', { trade: 0.2, reach: 0.05 }, 'Strings of donkeys carry tin, cloth and incense between cities weeks apart.', ''],
    ['chariots', 'Chariots', 1, 'war', 1.0, 'wheel horse', { strength: 0.12 }, 'A light car on spoked wheels, two horses, a driver and an archer.', ''],
    ['warriors', 'Warriors', 1, 'war', 0.9, 'chiefs', { strength: 0.1 }, 'Men who do nothing but train and fight, fed by the rest.', ''],
    ['kingship', 'Kingship', 1, 'state', 1.0, 'chiefs', { reach: 0.15, stab: 0.03 }, 'The chief\'s house becomes a palace and his word passes to his son. Cities bow to one crown.', ''],
    ['writing', 'Writing', 1, 'mind', 1.4, 'tally', { research: 0.15, income: 0.05, reach: 0.05 }, 'Marks pressed in clay for the storehouse accounts become a way to set down speech, law and the names of kings.', 'cf'],
    ['laws', 'Written laws', 1, 'state', 1.0, 'writing kingship', { stab: 0.05 }, 'The penalty for each wrong is cut in stone and stood where all can see it.', ''],
    ['taxes', 'Tribute lists', 1, 'state', 0.8, 'writing', { income: 0.1 }, 'Scribes record what every village owes the palace, in grain, cloth and days of labour.', ''],
    ['calendar', 'The calendar', 1, 'mind', 0.8, 'farming tally', { food: 0.05, research: 0.05 }, 'The year counted by sun and star tells when the river will rise and when to sow.', ''],
    ['priesthood', 'Priesthood', 1, 'mind', 0.9, 'ritual', { stab: 0.03, research: 0.03, can: ['faith'] }, 'Temples keep land, herds and scribes. Their keepers read the sky and speak for the gods.', ''],
    ['arithmetic', 'Arithmetic', 1, 'mind', 0.9, 'writing', { research: 0.08, build: 0.03 }, 'Sums, fractions and the area of a field, worked on clay by scribes in training.', ''],
    ['medicine', 'Healers', 1, 'mind', 0.7, 'herblore', { health: 0.1, grow: 0.02 }, 'Remedies are written down and tried again: what was given, and whether the patient lived.', ''],
    // ----- Iron Age -----
    ['iron', 'Iron working', 2, 'craft', 1.4, 'copper', { goods: ['iron'], recipes: ['tools', 'arms_iron'], strength: 0.1, food: 0.05 }, 'Iron ore is everywhere, but it takes a hotter fire and a smith\'s patience. Once learned, every farmer has an axe and every soldier a blade.', 'cf'],
    ['terraces', 'Terraces', 2, 'land', 0.8, 'irrigation', { food: 0.08 }, 'Hillsides cut into steps and walled with stone, so the rain stays where the roots are.', ''],
    ['qanats', 'Wells and qanats', 2, 'land', 0.9, 'irrigation mining', { food: 0.07, grow: 0.02 }, 'Water is found deep under dry ground and led for miles through tunnels to the fields.', ''],
    ['glass', 'Glassmaking', 2, 'craft', 0.8, 'pottery', { recipes: ['glass'] }, 'Sand and ash melted together: beads, then cups, then panes.', ''],
    ['shipbuilding', 'Shipbuilding', 2, 'craft', 1.1, 'sailing', { recipes: ['ships'], works: ['shipyard', 'fleet'], sea: 0.2 }, 'Keel, ribs and planking joined by shipwrights who do nothing else. Hulls that can take the open sea.', 'c'],
    ['seafaring', 'Seafaring', 2, 'trade', 1.0, 'sailing', { sea: 0.3, can: ['colonies'] }, 'Captains leave the coast and steer by sun and stars. Colonies are planted on far shores.', ''],
    ['coinage', 'Coinage', 2, 'trade', 1.1, 'weights mining', { income: 0.12, trade: 0.15 }, 'A lump of metal stamped by the king is worth what it says. No one needs scales any more.', 'f'],
    ['roads', 'Roads', 2, 'trade', 1.0, 'masonry wheel', { reach: 0.15, trade: 0.15 }, 'Paved, drained and measured, with posts for fresh horses a day apart.', ''],
    ['alphabet', 'The alphabet', 2, 'mind', 1.0, 'writing', { research: 0.12 }, 'Two dozen signs, one for each sound. A child can learn them in a season, and a trader can write.', ''],
    ['riding', 'Riding', 2, 'war', 1.0, 'horse', { strength: 0.12, reach: 0.05 }, 'Horsemen with bows and lances outrun everything on the field.', ''],
    ['drill', 'Drill', 2, 'war', 1.0, 'warriors', { strength: 0.12 }, 'Men trained to keep step and hold a line of shields. A wall that walks.', ''],
    ['siege', 'Siegecraft', 2, 'war', 0.9, 'masonry', { siege: 0.25 }, 'Rams, towers, ramps of earth and tunnels under the wall.', ''],
    ['provinces', 'Provinces', 2, 'state', 1.0, 'kingship writing', { reach: 0.2, stab: 0.02 }, 'The realm is cut into provinces, each with a governor who answers to the king and can be recalled.', ''],
    ['envoys', 'Envoys', 2, 'state', 0.7, 'writing', { stab: 0.02, trade: 0.1 }, 'Sworn messengers pass between courts under protection, carrying letters, gifts and brides.', ''],
    ['astronomy', 'Astronomy', 2, 'mind', 0.8, 'calendar arithmetic', { research: 0.08, sea: 0.1 }, 'Centuries of nightly records let the watchers foretell eclipses and the paths of the planets.', ''],
    ['epics', 'Epic and scripture', 2, 'mind', 0.8, 'writing priesthood', { stab: 0.04 }, 'The stories of gods and ancestors are set down and learned by heart. A people knows who it is.', ''],
    // ----- Classical -----
    ['philosophy', 'Philosophy', 3, 'mind', 1.2, 'alphabet', { works: ['academy'], research: 0.12 }, 'Teachers gather pupils and argue about what is true, what is good and how the world is made.', 'cf'],
    ['mathematics', 'Mathematics', 3, 'mind', 1.0, 'arithmetic', { research: 0.1, build: 0.03 }, 'Proof: a thing shown to be so from first principles, for every triangle that will ever be drawn.', ''],
    ['physic', 'Medicine', 3, 'mind', 0.8, 'medicine', { health: 0.12, grow: 0.02 }, 'Illness has natural causes. Physicians watch, record, and swear to do no harm.', ''],
    ['engineering', 'Engineering', 3, 'craft', 1.2, 'masonry mathematics', { build: 0.08, grow: 0.04, defence: 0.05 }, 'The arch, concrete and the surveyed line. Water comes to the city over valleys and goes out under the streets.', ''],
    ['paper', 'Papermaking', 3, 'craft', 0.9, 'weaving', { recipes: ['paper'], research: 0.05 }, 'Rags and bark beaten to pulp and dried in sheets: cheaper than parchment, lighter than bamboo.', 'f'],
    ['cotton', 'Cotton', 3, 'land', 0.8, 'weaving irrigation', { goods: ['cotton'], recipes: ['cloth_cotton'] }, 'A bush whose seed-hair spins into a thread that is cool, washable and takes any dye.', ''],
    ['silk', 'Silk', 3, 'land', 0.8, 'weaving', { goods: ['silk'] }, 'Worms fed on mulberry leaves spin a thread finer than any plant gives. The secret is guarded for centuries.', ''],
    ['watermill', 'Watermills', 3, 'craft', 0.9, 'wheel', { c_food: 0.15, c_crafts: 0.1, food: 0.04 }, 'A river turns a wheel, the wheel turns a stone, and the stone does the work of forty hands.', ''],
    ['republic', 'The republic', 3, 'state', 1.0, 'laws', { stab: 0.03, income: 0.05 }, 'No king: magistrates chosen for a year, an assembly of citizens, and a law that binds them all.', ''],
    ['service', 'Civil service', 3, 'state', 1.1, 'provinces alphabet', { reach: 0.2, income: 0.08, stab: 0.02 }, 'Officials chosen for what they know, paid a salary, moved from post to post, and watched.', ''],
    ['courts', 'Courts of law', 3, 'state', 0.9, 'laws', { stab: 0.05 }, 'Trained judges, written pleadings, and rulings that later judges must follow.', ''],
    ['legions', 'Professional armies', 3, 'war', 1.1, 'drill', { strength: 0.15 }, 'Soldiers enlisted for twenty years, drilled daily, paid in coin and pensioned with land.', ''],
    ['engines', 'War engines', 3, 'war', 0.9, 'siege mathematics', { siege: 0.25, defence: 0.05 }, 'Twisted sinew throws stones the weight of a man. Walls are measured, and broken, by calculation.', ''],
    ['galleys', 'War galleys', 3, 'war', 0.8, 'shipbuilding', { sea: 0.1, strength: 0.04 }, 'Three banks of oars and a bronze ram. Whoever holds the sea chooses where the war is fought.', ''],
    ['longtrade', 'The long roads', 3, 'trade', 1.0, 'coinage caravans', { trade: 0.3, income: 0.06 }, 'Silk goes west and gold goes east through a chain of oasis cities, each taking its toll.', ''],
    ['monsoon', 'Monsoon sailing', 3, 'trade', 0.9, 'seafaring astronomy', { sea: 0.3, trade: 0.1 }, 'The wind blows one way half the year and back the other half. A ship can cross an ocean and return.', ''],
    ['letters', 'Theatre and letters', 3, 'mind', 0.7, 'alphabet', { stab: 0.04 }, 'Plays, histories and poems, copied and sold. People far apart read the same words.', ''],
    ['scripture', 'World faiths', 3, 'mind', 0.9, 'epics', { stab: 0.04 }, 'Teachings meant for all people, not one tribe. Monks and missionaries carry them along the trade roads.', ''],
    // ----- Medieval -----
    ['rotation', 'Crop rotation', 4, 'land', 1.0, 'plough', { food: 0.1, farm: 4 }, 'Three fields: wheat, then beans, then rest. A third more harvest from the same land, and oats for the horses.', ''],
    ['heavyplough', 'The heavy plough', 4, 'land', 0.9, 'iron plough', { food: 0.08, grow: 0.02 }, 'An iron share and a mouldboard turn the wet clay of the north, drawn by horses in padded collars.', ''],
    ['mills', 'Wind and water mills', 4, 'craft', 0.9, 'watermill', { c_food: 0.1, c_textile: 0.15, c_crafts: 0.1 }, 'Mills grind grain, full cloth, saw timber and work the bellows. Every stream and hilltop has one.', ''],
    ['gunpowder', 'Gunpowder', 4, 'craft', 1.1, 'physic', { goods: ['saltpetre'], recipes: ['gunpowder'] }, 'Alchemists seeking a medicine mix saltpetre, sulphur and charcoal, and find fire that bursts.', 'f'],
    ['distilling', 'Distilling', 4, 'craft', 0.7, 'brewing glass', { recipes: ['spirits', 'spirits_grain', 'spirits_wine'] }, 'Wine boiled in an alembic gives a spirit that burns. First a medicine, then a drink.', ''],
    ['castiron', 'Cast iron', 4, 'craft', 0.9, 'iron mills', { c_metal: 0.2, build: 0.03 }, 'Furnaces blown by water-driven bellows run hot enough to pour iron like bronze.', ''],
    ['guilds', 'Guilds', 4, 'trade', 0.9, 'markets', { c_crafts: 0.1, c_textile: 0.1, stab: 0.02 }, 'Masters of each craft set its standards, train its apprentices and keep out strangers.', ''],
    ['compass', 'The compass', 4, 'trade', 0.9, 'seafaring astronomy', { sea: 0.3 }, 'A magnetised needle points north under cloud, in fog and out of sight of land.', ''],
    ['banking', 'Banking', 4, 'trade', 1.1, 'coinage mathematics', { income: 0.1, trade: 0.15 }, 'A letter written in one city is paid in coin in another. Money moves without moving.', ''],
    ['leagues', 'Trading leagues', 4, 'trade', 0.8, 'guilds longtrade', { trade: 0.2 }, 'Merchant towns band together, keep their own fleets and treat with kings as equals.', ''],
    ['knights', 'Heavy cavalry', 4, 'war', 1.0, 'riding iron', { strength: 0.12 }, 'Stirrups, a high saddle and a couched lance put the whole weight of horse and rider behind one point.', ''],
    ['castles', 'Castles', 4, 'war', 1.0, 'engineering', { walls: 3, defence: 0.2 }, 'Stone keeps and curtain walls that a few dozen men can hold against an army for a year.', ''],
    ['crossbow', 'Bow and crossbow', 4, 'war', 0.8, 'bow drill', { strength: 0.08, defence: 0.05 }, 'The longbow and the crossbow pierce mail at two hundred paces.', ''],
    ['feudalism', 'Feudalism', 4, 'state', 1.0, 'provinces kingship', { reach: 0.1, strength: 0.05, stab: 0.02 }, 'Land held in return for service in arms. Each lord keeps his own men and his own law.', ''],
    ['charters', 'Charters', 4, 'state', 0.9, 'courts', { stab: 0.04, income: 0.04, grow: 0.02 }, 'Rights written down and sealed: for a town to govern itself, for a baron against his king.', ''],
    ['estates', 'Estates', 4, 'state', 0.9, 'charters', { income: 0.08, stab: 0.02 }, 'Nobles, clergy and townsmen are summoned to grant the taxes, and learn to ask a price for them.', ''],
    ['universities', 'Universities', 4, 'mind', 1.1, 'philosophy scripture', { research: 0.15 }, 'Guilds of masters and scholars with the right to teach anywhere: law, medicine and theology.', 'f'],
    ['numerals', 'Numerals and algebra', 4, 'mind', 0.9, 'mathematics', { research: 0.1, income: 0.04 }, 'Nine digits and a zero, and a way of solving for the unknown. Merchants adopt them first.', ''],
    ['hospitals', 'Hospitals', 4, 'mind', 0.7, 'physic', { health: 0.12 }, 'Houses where the sick are kept, fed and treated by physicians who teach as they work.', ''],
    ['monasteries', 'Monasteries', 4, 'mind', 0.8, 'scripture', { research: 0.05, stab: 0.03, food: 0.03 }, 'Communities under a rule copy books, drain marshes, brew, and keep learning alive through bad centuries.', ''],
    // ----- Renaissance -----
    ['printing', 'Printing', 5, 'mind', 1.3, 'paper castiron', { research: 0.2, stab: 0.01 }, 'Movable metal type and a press. A book that took a scribe a year is made by the hundred in a week.', 'cf'],
    ['firearms', 'Firearms', 5, 'war', 1.1, 'gunpowder castiron', { recipes: ['guns'], strength: 0.12 }, 'A tube, a charge and a ball. A peasant with a month\'s training can kill a knight.', ''],
    ['cannon', 'Cannon', 5, 'war', 1.0, 'gunpowder castiron', { siege: 0.4 }, 'Bronze and iron guns throw shot that brings down in days the walls that stood for centuries.', ''],
    ['bastions', 'Star forts', 5, 'war', 0.9, 'castles mathematics', { defence: 0.25 }, 'Low, thick, angled walls of earth and brick, laid out so that every face is covered by guns.', ''],
    ['pikeshot', 'Pike and shot', 5, 'war', 0.9, 'firearms drill', { strength: 0.12 }, 'Blocks of pikemen shelter the musketeers while they reload. Drill becomes a science.', ''],
    ['rigging', 'Full-rigged ships', 5, 'trade', 1.0, 'shipbuilding compass', { sea: 0.4, c_ship: 0.2 }, 'Three masts, square and lateen sails, a sternpost rudder. Ships that can stay at sea for months.', ''],
    ['navigation', 'Ocean navigation', 5, 'trade', 1.1, 'compass astronomy', { sea: 0.5, trade: 0.1, can: ['oceans'] }, 'Charts, the quadrant and tables of the sun. Oceans are crossed on purpose, and crossed back: colonies are planted on any shore across them.', 'f'],
    ['newcrops', 'Crops from afar', 5, 'land', 0.9, 'navigation', { food: 0.12, grow: 0.03 }, 'Potatoes, maize and cassava cross the oceans one way; wheat, sugar and horses the other.', ''],
    ['plantations', 'Plantations', 5, 'land', 0.9, 'navigation', { y_crop: 0.2, income: 0.04 }, 'Sugar, tobacco and coffee grown for sale across the sea on great estates.', ''],
    ['companies', 'Chartered companies', 5, 'trade', 1.0, 'banking navigation', { trade: 0.3, income: 0.08 }, 'Hundreds of investors share the cost of a voyage and its profit. The company outlives them all.', ''],
    ['bourse', 'The exchange', 5, 'trade', 0.8, 'companies', { income: 0.08 }, 'Shares, bills and cargoes not yet landed are bought and sold in one hall, at prices posted daily.', ''],
    ['manufactories', 'Manufactories', 5, 'craft', 0.9, 'guilds', { c_crafts: 0.15, c_textile: 0.15, c_metal: 0.1 }, 'Many hands under one roof, each doing one part of the work.', ''],
    ['optics', 'Lenses', 5, 'mind', 0.7, 'glass mathematics', { research: 0.08, sea: 0.05 }, 'Ground glass shows the moons of Jupiter and the creatures in a drop of water.', ''],
    ['method', 'The scientific method', 5, 'mind', 1.2, 'universities printing', { research: 0.2 }, 'Measure, test, publish, and let others try to prove you wrong.', 'f'],
    ['humanism', 'Humanism', 5, 'mind', 0.8, 'universities', { research: 0.05, stab: 0.03 }, 'The old books are read again for what they say about people, not only about heaven.', ''],
    ['anatomy', 'Anatomy', 5, 'mind', 0.7, 'hospitals', { health: 0.1 }, 'The body is opened and drawn as it is, not as the old books said.', ''],
    ['sovereignty', 'The sovereign state', 5, 'state', 1.0, 'service feudalism', { reach: 0.15, income: 0.08 }, 'One ruler, one law, one tax and one army within fixed borders.', ''],
    ['embassies', 'Embassies', 5, 'state', 0.7, 'envoys', { stab: 0.02, trade: 0.1 }, 'Envoys who stay: a house in every foreign capital, reporting home by every post.', ''],
    ['regulars', 'Standing armies', 5, 'war', 0.9, 'legions taxes', { strength: 0.1 }, 'Regiments kept in peace as in war, uniformed, paid from taxes and loyal to the crown.', ''],
    // ----- Industrial -----
    ['sciencefarming', 'Scientific farming', 6, 'land', 1.0, 'rotation', { food: 0.15, farm: 5 }, 'Enclosed fields, the seed drill, turnips and clover, and stock bred by the book.', ''],
    ['coal', 'Coal mining', 6, 'land', 1.0, 'mining', { goods: ['coal'], y_mine: 0.2 }, 'Deep pits, pumped dry and propped with timber, bring up the fuel of the new age.', 'c'],
    ['steam', 'Steam power', 6, 'craft', 1.4, 'coal method', { recipes: ['machinery'], c_heavy: 0.2, c_textile: 0.2 }, 'Boiling water pushes a piston. For the first time work is done by something that neither eats, blows nor flows.', 'cf'],
    ['factory', 'The factory', 6, 'craft', 1.2, 'steam manufactories', { works: ['factory'], recipes: ['cloth_mill', 'glass_coal', 'paper_mill'], c_heavy: 0.2 }, 'Machines in rows driven by one engine, and people who keep the hours the machines keep.', ''],
    ['steel', 'Steelmaking', 6, 'craft', 1.2, 'castiron coal', { recipes: ['steel', 'tools_steel', 'arms_steel', 'guns_steel'], build: 0.06 }, 'Air blown through molten iron burns out the carbon. Steel by the ton, at the price of iron.', ''],
    ['chemistry', 'Chemistry', 6, 'mind', 1.0, 'method', { c_chem: 0.3, food: 0.04, health: 0.05 }, 'Elements, weighed and ordered. Dyes, acids, explosives and fertilisers made to a recipe.', ''],
    ['rubber', 'Rubber', 6, 'craft', 0.7, 'chemistry', { goods: ['rubber'] }, 'The sap of a forest tree, cooked with sulphur, stays tough in heat and cold: belts, hoses, tyres.', ''],
    ['railways', 'Railways', 6, 'trade', 1.2, 'steam steel', { reach: 0.3, trade: 0.3 }, 'Iron rails and a steam engine carry in a day what wagons carried in a month.', 'f'],
    ['steamships', 'Steamships', 6, 'trade', 1.0, 'steam rigging', { recipes: ['ships_steel'], sea: 0.4, trade: 0.15 }, 'Iron hulls and engines keep a timetable whatever the wind does.', ''],
    ['telegraph', 'The telegraph', 6, 'trade', 0.9, 'electricity', { reach: 0.2, income: 0.05, trade: 0.1 }, 'A message crosses a continent in minutes along a wire, and an ocean along a cable.', ''],
    ['corporations', 'The corporation', 6, 'trade', 0.9, 'companies', { income: 0.1, c_heavy: 0.1 }, 'A company is a person in law, and its owners can lose no more than they put in.', ''],
    ['rifles', 'Rifles', 6, 'war', 1.0, 'firearms manufactories', { strength: 0.15 }, 'Grooved barrels and loading at the breech: five aimed shots a minute at five hundred paces.', ''],
    ['conscription', 'Conscription', 6, 'war', 0.9, 'nationalism', { strength: 0.15 }, 'Every young man owes years of service. Armies are counted in millions.', ''],
    ['ironclads', 'Ironclads', 6, 'war', 0.8, 'steamships steel', { strength: 0.05, sea: 0.1 }, 'Armoured hulls and guns in turrets. Wooden fleets are obsolete in an afternoon.', ''],
    ['nationalism', 'Nationalism', 6, 'state', 1.0, 'printing sovereignty', { stab: 0.05, strength: 0.05 }, 'People who share a language and a story decide they are one nation and should rule themselves.', ''],
    ['constitutions', 'Constitutions', 6, 'state', 1.0, 'estates humanism', { stab: 0.05, income: 0.05 }, 'The powers of government written down, divided and limited. Rulers under the law.', ''],
    ['schooling', 'Public schooling', 6, 'mind', 1.1, 'printing', { research: 0.2, income: 0.05 }, 'Every child taught to read, write and reckon at the public expense.', ''],
    ['germs', 'Germ theory', 6, 'mind', 1.0, 'optics anatomy', { health: 0.25, grow: 0.08 }, 'Diseases are living things too small to see. Clean water, sewers and vaccines follow.', 'f'],
    ['press', 'The press', 6, 'mind', 0.7, 'printing', { stab: 0.02, research: 0.04 }, 'Daily papers by the hundred thousand. Everyone reads the same news the same morning.', ''],
    ['electricity', 'Electricity', 6, 'mind', 1.1, 'method', { research: 0.08 }, 'A current in a wire moves a magnet, and a moving magnet makes a current.', 'f'],
    // ----- Modern -----
    ['fertiliser', 'Fertiliser from air', 7, 'land', 1.0, 'chemistry', { food: 0.2 }, 'Nitrogen fixed from the air under pressure. Half the food the world eats is grown with it.', 'f'],
    ['tractors', 'Mechanised farming', 7, 'land', 0.9, 'combustion', { food: 0.15 }, 'Tractors and combine harvesters. One farmer feeds a hundred people.', ''],
    ['drilling', 'Oil and gas', 7, 'land', 1.0, 'steam chemistry', { goods: ['oil', 'gas'], y_well: 0.3 }, 'Wells drilled a mile down bring up the liquid that will run the century.', 'c'],
    ['refrigeration', 'Refrigeration', 7, 'craft', 0.7, 'electricity', { grow: 0.03, y_fish: 0.2, y_herd: 0.2, trade: 0.1 }, 'Cold made by machine. Meat, fish and fruit cross oceans and seasons.', ''],
    ['combustion', 'The engine', 7, 'craft', 1.2, 'steel drilling', { recipes: ['vehicles'], reach: 0.15, trade: 0.15 }, 'Fuel burned inside the cylinder. Cars, lorries and tractors put an engine wherever a horse had been.', 'cf'],
    ['refining', 'Oil refining', 7, 'craft', 1.0, 'drilling chemistry', { recipes: ['fuel'], works: ['refinery'] }, 'Crude oil cracked into petrol, diesel, kerosene and the feedstock of a new chemistry.', 'c'],
    ['polymers', 'Plastics', 7, 'craft', 0.8, 'refining', { recipes: ['plastics', 'plastics_gas'] }, 'Materials that do not exist in nature, moulded into any shape for almost nothing.', ''],
    ['electrification', 'Electrification', 7, 'craft', 1.1, 'electricity steam', { goods: ['bauxite'], recipes: ['aluminium', 'aluminium_gas'], c_heavy: 0.2, c_crafts: 0.2, c_textile: 0.2, c_chem: 0.2 }, 'Power stations and a grid. A motor on every machine and a lamp in every room.', ''],
    ['assembly', 'The assembly line', 7, 'craft', 0.9, 'factory electrification', { c_heavy: 0.3 }, 'The work moves past the worker. A car every ninety minutes, cheap enough for the man who builds it.', ''],
    ['flight', 'Flight', 7, 'trade', 1.0, 'combustion', { reach: 0.2, trade: 0.15, strength: 0.05 }, 'A powered machine heavier than air leaves the ground. Within a lifetime it crosses oceans daily.', 'f'],
    ['radio', 'Radio', 7, 'trade', 0.8, 'telegraph', { reach: 0.15, stab: 0.02, trade: 0.1 }, 'Voices and music through the air, into every home at once.', ''],
    ['centralbank', 'Central banking', 7, 'trade', 0.8, 'bourse corporations', { income: 0.1, stab: 0.02 }, 'One bank issues the currency, lends when no one else will, and sets the price of money.', ''],
    ['armour', 'Armoured warfare', 7, 'war', 1.0, 'combustion rifles', { strength: 0.2 }, 'Engines, tracks and armour plate. The trench line is broken and war moves again.', ''],
    ['airpower', 'Air power', 7, 'war', 0.9, 'flight', { strength: 0.15, siege: 0.2 }, 'Whoever holds the sky sees everything and strikes anywhere.', ''],
    ['fission', 'Nuclear fission', 7, 'war', 1.1, 'physics', { goods: ['uranium'], strength: 0.15 }, 'A heavy atom splits and releases a million times the energy of burning. A city can be lit, or destroyed.', 'f'],
    ['suffrage', 'Universal suffrage', 7, 'state', 0.9, 'constitutions', { stab: 0.06 }, 'Every adult has a vote, whatever they own and whoever they are.', ''],
    ['welfare', 'The welfare state', 7, 'state', 0.9, 'suffrage schooling', { stab: 0.06, health: 0.1, grow: 0.02 }, 'Pensions, and insurance against sickness and unemployment, paid for by all.', ''],
    ['planning', 'Mobilisation', 7, 'state', 0.8, 'nationalism corporations', { strength: 0.08, income: 0.05 }, 'The whole economy turned to one purpose, by plan and by ration.', ''],
    ['antibiotics', 'Antibiotics', 7, 'mind', 1.0, 'germs chemistry', { health: 0.3, grow: 0.08 }, 'A mould kills bacteria. Infections that were death sentences are cured in a week.', 'f'],
    ['physics', 'Modern physics', 7, 'mind', 1.0, 'electricity', { research: 0.15 }, 'Space, time and matter are not what they seemed. The atom has parts.', ''],
    ['institutes', 'Research institutes', 7, 'mind', 0.9, 'schooling', { research: 0.2 }, 'Laboratories with staff, budgets and a programme. Discovery becomes an industry.', ''],
    ['broadcast', 'Film and broadcasting', 7, 'mind', 0.6, 'radio', { stab: 0.03 }, 'Moving pictures and a voice in every room. A nation laughs at the same joke.', ''],
    // ----- Information Age -----
    ['greenrev', 'The green revolution', 8, 'land', 0.9, 'fertiliser tractors', { food: 0.2 }, 'Short-stalked wheat and rice bred to turn fertiliser into grain. Famines that were certain do not come.', ''],
    ['biotech', 'Genetic engineering', 8, 'land', 1.0, 'antibiotics computers', { food: 0.1, health: 0.15 }, 'The code of life read, copied and edited.', ''],
    ['materials', 'Advanced materials', 8, 'craft', 0.9, 'polymers physics', { goods: ['rareearth', 'lithium'], y_mine: 0.2 }, 'Magnets, batteries and alloys built atom by atom from elements once thought useless.', ''],
    ['semiconductors', 'Semiconductors', 8, 'craft', 1.2, 'physics electrification', { recipes: ['electronics'], works: ['lab'] }, 'A switch with no moving parts, etched by the billion onto a sliver of silicon.', 'cf'],
    ['computers', 'Computers', 8, 'mind', 1.1, 'semiconductors', { research: 0.25, income: 0.08 }, 'A machine that follows any instructions it is given, faster than thought.', 'f'],
    ['automation', 'Automation', 8, 'craft', 0.9, 'computers assembly', { c_heavy: 0.3, c_tech: 0.3, c_chem: 0.2 }, 'Robots weld, paint and assemble. Factories run with the lights off.', ''],
    ['containers', 'Container shipping', 8, 'trade', 0.8, 'combustion steamships', { sea: 0.3, trade: 0.3 }, 'One steel box goes from factory to lorry to ship to shop without being opened.', ''],
    ['internet', 'The internet', 8, 'trade', 1.1, 'computers radio', { trade: 0.3, research: 0.15, income: 0.08 }, 'Every computer joined to every other. Anything written anywhere can be read everywhere.', 'f'],
    ['finance', 'Global finance', 8, 'trade', 0.8, 'centralbank computers', { income: 0.12 }, 'Capital moves between continents in the time it takes to press a key.', ''],
    ['missiles', 'Guided weapons', 8, 'war', 1.0, 'semiconductors airpower', { strength: 0.2, siege: 0.2 }, 'A weapon that finds its own target.', ''],
    ['spaceflight', 'Spaceflight', 8, 'mind', 1.0, 'fission computers', { research: 0.1, reach: 0.2, strength: 0.05 }, 'Rockets carry instruments, then people, beyond the air. Satellites watch and connect the whole planet.', 'f'],
    ['networks', 'Drones and networks', 8, 'war', 0.8, 'internet missiles', { strength: 0.15 }, 'Every soldier, vehicle and aircraft sees what all the others see.', ''],
    ['rights', 'Human rights', 8, 'state', 0.8, 'suffrage', { stab: 0.06 }, 'Rights that belong to every person, which no government may take away.', ''],
    ['egov', 'Digital government', 8, 'state', 0.8, 'internet welfare', { reach: 0.2, income: 0.08 }, 'Records, taxes and services on a network. The state knows what it is doing.', ''],
    ['unions', 'Unions of states', 8, 'state', 0.7, 'embassies rights', { stab: 0.03, trade: 0.15 }, 'Nations pool their trade, their borders and part of their sovereignty.', ''],
    ['genomics', 'Genomics', 8, 'mind', 0.8, 'biotech', { health: 0.2, grow: 0.03 }, 'A whole genome read in a day. Medicine fitted to the patient.', ''],
    ['cleanpower', 'Clean power', 8, 'land', 0.9, 'materials semiconductors', { c_heavy: 0.1, c_chem: 0.1, income: 0.04 }, 'Sun and wind turned into electricity for less than coal.', ''],
    ['ai', 'Thinking machines', 8, 'mind', 1.3, 'internet computers', { research: 0.3, c_tech: 0.3 }, 'Programs that learn from the world\'s writing and answer in kind.', 'f'],
  ];
  const BR = {}; BRANCHES.forEach((b, i) => { BR[b.key] = i; });
  const ID = {}; RAW.forEach((r, i) => { if (ID[r[0]] !== undefined) throw new Error('know: two discoveries are called ' + r[0]); ID[r[0]] = i; });
  const LIST = RAW.map(([key, name, era, branch, w, req, gives, text, marks], id) => {
    const need = req ? req.split(' ').map((k) => { if (ID[k] === undefined) throw new Error(`know: ${key} stands on ${k}, which is not a discovery`); return ID[k]; }) : [];
    for (const n of need) if (RAW[n][2] > era) throw new Error(`know: ${key} stands on ${RAW[n][0]}, which comes later`);
    if (BR[branch] === undefined) throw new Error(`know: ${key} has no branch`);
    return { id, key, name, era, branch: BR[branch], w, need, gives, text, core: marks.indexOf('c') >= 0, first: marks.indexOf('f') >= 0, cost: 0, leads: [] };
  });
  const ND = LIST.length; const NE = ERA_AT.length - 1;
  for (const d of LIST) for (const n of d.need) LIST[n].leads.push(d.id);
  // costs: the discoveries of an age cost together what the age is long (the first age, what is left of it above T0)
  { const sum = new Float64Array(NE); for (const d of LIST) sum[d.era] += d.w;
    for (const d of LIST) { const band = ERA_AT[d.era + 1] - (d.era ? ERA_AT[d.era] : T0); d.cost = d.w / sum[d.era] * band; } }
  // what an age expects: for each edge, the sum over the ages before, and the sum within the age
  const EXP_CUM = new Float64Array(NK * (NE + 1)), EXP_ERA = new Float64Array(NK * NE);
  for (const d of LIST) for (const k in d.gives) if (K[k] !== undefined) EXP_ERA[K[k] * NE + d.era] += d.gives[k];
  for (let k = 0; k < NK; k++) for (let e = 0; e < NE; e++) EXP_CUM[k * (NE + 1) + e + 1] = EXP_CUM[k * (NE + 1) + e] + EXP_ERA[k * NE + e];
  const eraOf = (t) => { let e = 0; for (let k = 0; k < NE; k++) if (t >= ERA_AT[k]) e = k; return e; };
  // how far through its age a realm of this much knowledge is (0..1), and what its age expects of an edge
  const fracOf = (t, e) => { const a = e ? ERA_AT[e] : T0, b = ERA_AT[e + 1]; const f = (t - a) / (b - a); return f < 0 ? 0 : f > 1 ? 1 : f; };
  const expected = (k, t) => { const e = eraOf(t); return EXP_CUM[k * (NE + 1) + e] + EXP_ERA[k * NE + e] * fracOf(t, e); };
  // the levels of farms and walls each discovery allows; which discovery opens each work, and each ability
  const FARM = [], WALLS = []; const WORK_BY = {}, CAN_BY = {};
  for (const d of LIST) { if (d.gives.farm) FARM.push([d.gives.farm, d.id]); if (d.gives.walls) WALLS.push([d.gives.walls, d.id]); for (const w of d.gives.works || []) { if (WORKS.indexOf(w) < 0) throw new Error('know: no such work ' + w); WORK_BY[w] = d.id; } for (const a of d.gives.can || []) { if (CANS.indexOf(a) < 0) throw new Error('know: no such ability ' + a); CAN_BY[a] = d.id; } }
  FARM.sort((a, b) => a[0] - b[0]); WALLS.sort((a, b) => a[0] - b[0]);
  // how the autopilot's rulers lean
  const LEAN = { conqueror: { war: 2 }, tyrant: { war: 1.5, state: 1.3 }, builder: { craft: 2 }, pious: { mind: 1.6 }, scholar: { mind: 2 }, merchant: { trade: 2 }, steward: { state: 1.8, land: 1.3 }, navigator: { trade: 1.8 } };
  // after the last discovery: learning without end, each step a little dearer, each a small edge that no age expects
  const FUTURE = { cost: 0.008, grows: 0.15, gives: { research: 0.02, income: 0.02, strength: 0.02, health: 0.02 } };

  // ---------- one world's knowledge ----------
  // host: { MAXC, civs, goods (ECON.GOODS), goodId (ECON.ID), recipes (ECON.RECIPES), held (MAXC*NG: land of each good),
  //         coastal(c), shortOf(c, g), seed, start (the year the world began), year(), nameOf(cv), onLearn(cv, discovery, first, futureLevel) }
  function create(host) {
    const { MAXC, civs } = host; const GOODS = host.goods, GID = host.goodId, RECIPES = host.recipes; const NG = GOODS.length > 64 ? GOODS.length : 64, NR = RECIPES.length;
    const has = new Uint8Array(MAXC * ND), nb = new Uint8Array(MAXC * ND), count = new Int16Array(MAXC), cur = new Int16Array(MAXC).fill(-1), fut = new Int16Array(MAXC);
    const prog = new Float64Array(MAXC), pool = new Float64Array(MAXC), lastT = new Float64Array(MAXC), spent = new Float64Array(MAXC);
    const own = new Float32Array(MAXC * NK), f = new Float32Array(MAXC * NK).fill(1);
    const gmask = new Uint8Array(MAXC * NG).fill(1), rmask = new Uint8Array(MAXC * NR).fill(1), ymul = new Float32Array(MAXC * NG).fill(1);
    const farmCap = new Uint8Array(MAXC), wallCap = new Uint8Array(MAXC), works = new Uint32Array(MAXC), cans = new Uint8Array(MAXC);
    const first = new Array(ND).fill(null);            // who learned each discovery first: { y, name }
    // which discovery opens each good and each craft (-1: none; the age alone decides)
    const GATE_G = new Int16Array(NG).fill(-1), GATE_R = new Int16Array(NR).fill(-1), GRP = new Int8Array(NG).fill(-1);
    const rid = {}; RECIPES.forEach((r, i) => { rid[r.key] = i; });
    for (const d of LIST) {
      for (const g of d.gives.goods || []) { if (GID[g] === undefined) throw new Error('know: no such good ' + g); GATE_G[GID[g]] = d.id; }
      for (const r of d.gives.recipes || []) { if (rid[r] === undefined) throw new Error('know: no such craft ' + r); GATE_R[rid[r]] = d.id; }
    }
    for (const grp in GROUPS) for (const g of GROUPS[grp]) { if (GID[g] === undefined) throw new Error('know: no such good ' + g); GRP[GID[g]] = K[grp]; }
    let hush = false;      // (while a people's starting knowledge is being laid out: no news of it)
    let rs = ((host.seed >>> 0) ^ 0x51ED270B) >>> 0;
    const rnd = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

    // the masks a realm's knowledge makes: goods it can work, crafts it knows, works it can raise
    function remask(c) {
      const o = c * ND, go = c * NG, ro = c * NR;
      for (let g = 1; g < NG; g++) gmask[go + g] = GATE_G[g] < 0 || has[o + GATE_G[g]] ? 1 : 0;
      for (let r = 0; r < NR; r++) rmask[ro + r] = GATE_R[r] < 0 || has[o + GATE_R[r]] ? 1 : 0;
      let fc = 0; for (const [lv, d] of FARM) if (has[o + d]) fc = lv; farmCap[c] = fc;
      let wc = 0; for (const [lv, d] of WALLS) if (has[o + d]) wc = lv; wallCap[c] = wc;
      let wb = 0; WORKS.forEach((w, i) => { const d = WORK_BY[w]; if (d === undefined || has[o + d]) wb |= 1 << i; }); works[c] = wb >>> 0;
      let cb = 0; CANS.forEach((a, i) => { const d = CAN_BY[a]; if (d === undefined || has[o + d]) cb |= 1 << i; }); cans[c] = cb;
    }
    // its edges this year: what it knows against what its age expects
    function refresh(c, t) {
      const o = c * NK; const e = eraOf(t), fr = fracOf(t, e);
      for (let k = 0; k < NK; k++) { const ex = EXP_CUM[k * (NE + 1) + e] + EXP_ERA[k * NE + e] * fr; f[o + k] = (1 + own[o + k]) / (1 + ex); }
      f[o + K.stab] = own[o + K.stab] - (EXP_CUM[K.stab * (NE + 1) + e] + EXP_ERA[K.stab * NE + e] * fr);
      f[o + K.build] = 1 / f[o + K.build];        // (an edge in building is a lower cost)
      const go = c * NG; for (let g = 1; g < NG; g++) ymul[go + g] = GRP[g] >= 0 ? f[o + GRP[g]] : 1;
    }
    function addOwn(c, gives, sign) { const o = c * NK; for (const k in gives) if (K[k] !== undefined) own[o + K[k]] += gives[k] * sign; }
    function reset(c) { has.fill(0, c * ND, c * ND + ND); nb.fill(0, c * ND, c * ND + ND); own.fill(0, c * NK, c * NK + NK); count[c] = 0; cur[c] = -1; prog[c] = 0; pool[c] = 0; fut[c] = 0; spent[c] = 0; }
    function learn(c, cv, d, quiet) {
      const D = LIST[d]; if (has[c * ND + d]) return; has[c * ND + d] = 1; count[c]++; spent[c] += D.cost; addOwn(c, D.gives, 1); remask(c); if (cv) refresh(c, cv.tech);
      // who was first is remembered, except for what peoples knew when the world began (or a loaded world's unrecorded past)
      let isFirst = !first[d]; if (isFirst) { const dim = hush || !cv || host.year() <= host.start + 10; first[d] = dim ? { y: -1e9, name: '', id: -1 } : { y: host.year(), name: host.nameOf ? host.nameOf(cv) : cv.name, id: c }; if (dim) isFirst = false; }
      if (!quiet && !hush && host.onLearn && cv) host.onLearn(cv, D, isFirst);
    }
    const canStudy = (c, d, era) => { const D = LIST[d]; if (has[c * ND + d] || D.era > era) return false; for (const n of D.need) if (!has[c * ND + n]) return false; return true; };
    function available(c, era) { const out = []; for (let d = 0; d < ND; d++) if (canStudy(c, d, era)) out.push(d); return out; }
    // the autopilot's choice: what the age cannot do without, what the realm's own land and markets call for, what its
    // ruler leans to, what its neighbours already know
    function weight(c, cv, d) {
      const D = LIST[d]; let w = D.core ? 3 : 1; if (D.era < cv.era) w *= 2; if (nb[c * ND + d]) w *= 1.5;
      const g = D.gives; const b = c * NG;
      if (g.goods) for (const k of g.goods) if (host.held[b + GID[k]]) w *= 3;
      if (g.recipes && host.shortOf) { let s = 0; for (const k of g.recipes) { const sh = host.shortOf(c, RECIPES[rid[k]].out); if (sh > s) s = sh; } w *= 1 + 2 * s; }
      if (g.sea || (g.works && g.works.indexOf('port') >= 0)) w *= host.coastal && host.coastal(c) ? 1.5 : 0.4;
      const lean = cv.ruler && LEAN[cv.ruler.trait]; if (lean && lean[BRANCHES[D.branch].key]) w *= lean[BRANCHES[D.branch].key];
      if (D.branch === BR.war && cv.wars) for (const _ in cv.wars) { w *= 1.6; break; }
      return w;
    }
    function pick(c, cv) {
      const av = available(c, cv.era); if (!av.length) return -1; let sum = 0; const ws = av.map((d) => { const w = weight(c, cv, d); sum += w; return w; });
      let r = rnd() * sum; for (let k = 0; k < av.length; k++) { r -= ws[k]; if (r <= 0) return av[k]; } return av[av.length - 1];
    }
    // the player's realm keeps a queue (and what it has put into discoveries it then set aside)
    const mind = (cv) => cv.know || (cv.know = { q: [], auto: false, part: {}, idle: 0, left: false });
    function next(c, cv) {
      if (!cv.player) return pick(c, cv);
      const m = mind(cv);
      for (let k = 0; k < m.q.length; k++) { const d = ID[m.q[k]]; if (d === undefined || has[c * ND + d]) { m.q.splice(k--, 1); continue; } if (canStudy(c, d, cv.era)) { m.q.splice(k, 1); return d; } }
      if (m.auto) return pick(c, cv);
      // no word from the court: the scholars wait a generation (or until they hold more than they can keep in their heads),
      // and then go on choosing for themselves until the court speaks again
      if (!available(c, cv.era).length) { m.idle = 0; return -1; }
      if (!m.left) { m.idle++; if (m.idle > 25) m.left = true; }
      if (m.left || pool[c] > 0.012) { const d = pick(c, cv); if (d >= 0) m.self = LIST[d].key; return d; }
      return -1;
    }
    // a year's learning: the insight goes into what is being studied (half again as fast if a neighbour knows it)
    function step(c, cv, gain) {
      if (gain > 0) pool[c] += gain;
      for (let guard = 0; guard < 12 && pool[c] > 1e-12; guard++) {
        let d = cur[c];
        if (d < 0 || has[c * ND + d]) { d = next(c, cv); if (d < 0) { cur[c] = -1; break; } cur[c] = d; prog[c] = cv.player && mind(cv).part[LIST[d].key] ? mind(cv).part[LIST[d].key] : 0; if (cv.player) delete mind(cv).part[LIST[d].key]; }
        const D = LIST[d]; const rate = nb[c * ND + d] ? 1.5 : 1; const need = (D.cost - prog[c]) / rate;
        if (pool[c] >= need) { pool[c] -= need; prog[c] = 0; cur[c] = -1; learn(c, cv, d); } else { prog[c] += pool[c] * rate; pool[c] = 0; }
      }
      // beyond the last discovery
      if (count[c] >= ND && pool[c] > 0) { const cost = FUTURE.cost * (1 + FUTURE.grows * fut[c]); if (pool[c] >= cost) { pool[c] -= cost; fut[c]++; addOwn(c, FUTURE.gives, 1); if (host.onLearn) host.onLearn(cv, null, false, fut[c]); } }
      refresh(c, cv.tech);
    }

    const api = {
      UNIT, ND, NK, K, LIST, ID, has, nb, count, cur, prog, pool, own, f, gmask, rmask, ymul, farmCap, wallCap, works, cans, first, fut, lastT,
      step, learn, refresh, canStudy, available, pick, mind, expected,
      knows(c, key) { return !!has[c * ND + ID[key]]; },
      // can this realm raise this work (at this level, for farms and walls)? null when it can, else the discovery it lacks
      lacks(c, work, level) {
        if (work === 'farm') { if (farmCap[c] >= level) return null; for (const [lv, d] of FARM) if (lv >= level) return LIST[d]; return null; }
        if (work === 'walls') { if (wallCap[c] >= level) return null; for (const [lv, d] of WALLS) if (lv >= level) return LIST[d]; return null; }
        const i = WORKS.indexOf(work); if (i < 0 || (works[c] >>> i) & 1) return null; return LIST[WORK_BY[work]];
      },
      can(c, a) { return !!((cans[c] >> CANS.indexOf(a)) & 1); },
      canBy(a) { return LIST[CAN_BY[a]]; },
      // the discovery a realm lacks to work a good's land (null: none), and to make a craft
      gateOf(c, g) { const d = GATE_G[g]; return d >= 0 && !has[c * ND + d] ? LIST[d] : null; },
      craftGate(c, r) { const d = GATE_R[r]; return d >= 0 && !has[c * ND + d] ? LIST[d] : null; },
      // what a realm lacks to work a good's land in earnest (a mine, a plantation, a ranch): the good's own discovery, then its kind's
      estate(c, g) {
        const gate = GATE_G[g]; if (gate >= 0 && !has[c * ND + gate]) return LIST[gate];
        const grp = GRP[g]; const need = grp === K.y_mine ? (GOODS[g].era >= 1 ? ID.mining : ID.quarrying) : grp === K.y_crop ? ID.farming : grp === K.y_herd ? ID.herding : grp === K.y_fish ? ID.fishing : -1;
        return need >= 0 && !has[c * ND + need] ? LIST[need] : null;
      },
      goodGate(g) { return GATE_G[g] >= 0 ? LIST[GATE_G[g]] : null; }, recipeGate(r) { return GATE_R[r] >= 0 ? LIST[GATE_R[r]] : null; },
      groupOf(g) { return GRP[g] >= 0 ? KEYS[GRP[g]] : null; },
      // a new realm: one cut from another knows what its parent knew; one from the wild has what its knowledge is worth to spend
      born(c, from, tech) {
        reset(c); lastT[c] = tech;
        if (from >= 0 && civs[from]) { has.copyWithin(c * ND, from * ND, from * ND + ND); own.copyWithin(c * NK, from * NK, from * NK + NK); count[c] = count[from]; spent[c] = spent[from]; fut[c] = fut[from]; }
        else pool[c] = Math.max(0, tech - T0);
        remask(c); refresh(c, tech);
      },
      // what a realm's neighbours know between them (the simulation says who they are, every ten years)
      around(c, list) { const o = c * ND; nb.fill(0, o, o + ND); if (list) for (const b of list) { if (!civs[b] || b === c) continue; const p = b * ND; for (let d = 0; d < ND; d++) if (has[p + d]) nb[o + d] = 1; } },
      // spend whatever a realm holds at once (a world loaded from before there was knowledge; a people given a start)
      settle(c, cv) { const was = cv.player; cv.player = false; hush = true; try { for (let k = 0; k < 400 && pool[c] > 1e-9; k++) { const before = count[c]; step(c, cv, 0); if (count[c] === before) break; } } finally { hush = false; cv.player = was; } refresh(c, cv.tech); },
      // ----- the player's hand -----
      // study this now (what was being studied keeps what was put into it); null when done, else why not
      study(c, cv, key) {
        const d = ID[key]; if (d === undefined) return 'No such discovery'; if (has[c * ND + d]) return 'Already known'; const D = LIST[d];
        if (D.era > cv.era) return `That belongs to a later age`; for (const n of D.need) if (!has[c * ND + n]) return `First ${LIST[n].name}`;
        const m = mind(cv); if (cur[c] >= 0 && cur[c] !== d && prog[c] > 0) m.part[LIST[cur[c]].key] = prog[c];
        cur[c] = d; prog[c] = m.part[key] || 0; delete m.part[key]; m.q = m.q.filter((k) => k !== key); m.idle = 0; m.left = false; m.self = null;
        step(c, cv, 0); return null;
      },
      // add to the queue, with whatever it stands on that is not yet known in front of it
      enqueue(c, cv, key) {
        const d0 = ID[key]; if (d0 === undefined || has[c * ND + d0]) return; const m = mind(cv); const order = [];
        const visit = (d) => { if (has[c * ND + d] || order.indexOf(d) >= 0) return; for (const n of LIST[d].need) visit(n); order.push(d); }; visit(d0);
        for (const d of order) { const k = LIST[d].key; if (cur[c] === d || m.q.indexOf(k) >= 0) continue; m.q.push(k); }
        m.idle = 0; m.left = false;
        if (cur[c] < 0) step(c, cv, 0);
      },
      dequeue(cv, key) { const m = mind(cv); m.q = m.q.filter((k) => k !== key); },
      // where a realm stands: what it studies, how far along, how many years at this year's pace
      status(c, cv, perYear) {
        const d = cur[c]; const D = d >= 0 ? LIST[d] : null; const rate = D && nb[c * ND + d] ? 1.5 : 1;
        return { d: D, prog: D ? prog[c] / D.cost : 0, left: D ? (D.cost - prog[c]) / rate : 0, years: D && perYear > 0 ? Math.max(1, Math.ceil(((D.cost - prog[c]) / rate - pool[c]) / perYear)) : Infinity, pool: pool[c], known: count[c], future: fut[c], quick: rate > 1 };
      },
      // how long a discovery would take from here (0: what the realm holds unspent already covers it)
      yearsFor(c, d, perYear) { const rate = nb[c * ND + d] ? 1.5 : 1; const pr = cur[c] === d ? prog[c] : (civs[c] && civs[c].know && civs[c].know.part[LIST[d].key]) || 0; const left = (LIST[d].cost - pr) / rate - (cur[c] < 0 || cur[c] === d ? pool[c] : 0); return left <= 1e-12 ? 0 : perYear > 0 ? Math.max(1, Math.ceil(left / perYear)) : Infinity; },
      // every edge: what the realm knows, what its age expects, and the factor the simulation uses
      standing(c, t) { return KEYS.map((key, k) => ({ key, own: own[c * NK + k], exp: expected(k, t), f: f[c * NK + k] })); },
      knownBy(d) { let n = 0; for (let c = 0; c < MAXC; c++) if (civs[c] && has[c * ND + d]) n++; return n; },
      save() {
        const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
        const ids = []; for (let c = 0; c < MAXC; c++) if (civs[c]) ids.push(c); const B = Math.ceil(ND / 8); const buf = new Uint8Array(ids.length * B);
        ids.forEach((c, n) => { for (let d = 0; d < ND; d++) if (has[c * ND + d]) buf[n * B + (d >> 3)] |= 1 << (d & 7); });
        return { v: 1, keys: LIST.map((d) => d.key), ids, has: b64(buf), cur: ids.map((c) => cur[c]), prog: ids.map((c) => Math.round(prog[c] * 1e7)), pool: ids.map((c) => Math.round(pool[c] * 1e7)), last: ids.map((c) => lastT[c]), fut: ids.map((c) => fut[c]), first: first.map((x) => x ? [x.y, x.name, x.id] : 0), rs };
      },
      load(s) {
        for (let c = 0; c < MAXC; c++) { reset(c); remask(c); f.fill(1, c * NK, c * NK + NK); ymul.fill(1, c * NG, c * NG + NG); } first.fill(null);
        if (!s || s.v !== 1 || !s.keys) return false;
        const u8 = (str) => { const bin = atob(str); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
        const map = s.keys.map((k) => ID[k] === undefined ? -1 : ID[k]); const B = Math.ceil(s.keys.length / 8); const buf = u8(s.has); rs = s.rs >>> 0;
        s.ids.forEach((c, n) => {
          for (let j = 0; j < s.keys.length; j++) if (map[j] >= 0 && (buf[n * B + (j >> 3)] >> (j & 7)) & 1) { const d = map[j]; has[c * ND + d] = 1; count[c]++; spent[c] += LIST[d].cost; addOwn(c, LIST[d].gives, 1); }
          const cj = s.cur[n]; cur[c] = cj >= 0 && map[cj] >= 0 ? map[cj] : -1; prog[c] = cur[c] >= 0 ? (s.prog[n] || 0) / 1e7 : 0; pool[c] = (s.pool[n] || 0) / 1e7; fut[c] = s.fut ? s.fut[n] || 0 : 0; for (let k = 0; k < fut[c]; k++) addOwn(c, FUTURE.gives, 1);
          // (its edges were last worked out for the knowledge it had when it last studied: a neighbour may have taught it since)
          remask(c); if (civs[c]) { lastT[c] = s.last && s.last[n] !== undefined ? s.last[n] : civs[c].tech; refresh(c, lastT[c]); }
        });
        if (s.first) s.first.forEach((x, j) => { if (x && map[j] >= 0) first[map[j]] = { y: x[0], name: x[1], id: x[2] }; });
        return true;
      },
    };
    return api;
  }

  window.KNOW = { UNIT, T0, ERA_AT, BRANCHES, KEYS, K, NK, GROUPS, WORKS, CANS, LIST, ID, ND, NE, FARM, WALLS, WORK_BY, CAN_BY, FUTURE, EXP_CUM, EXP_ERA, eraOf, fracOf, expected, create };
})();
