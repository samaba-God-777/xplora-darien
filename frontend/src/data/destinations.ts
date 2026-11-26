/**
 * Catálogo inicial de destinos de XPLORA DARIÉN.
 *
 * Fuente del contenido: fotografías de /imagen y publicaciones de @xplore_darien
 * (review/instagram/inventory.json). Este archivo es la semilla del frontend; en
 * producción los datos vienen de la API Rust (GET /api/v1/map/points) y se
 * administran desde el panel.
 *
 * IMPORTANTE
 * - `coordsVerified: false` => coordenada APROXIMADA, pendiente de validar con GPS
 *   en campo. La UI la marca como "Ubicación aproximada".
 * - No se publican precios, horarios ni disponibilidad: los define el administrador.
 * - No se dibujan rutas: ninguna ruta ha sido verificada como segura.
 */

export type ActivityKey =
  | "hiking"
  | "waterfall"
  | "swimming"
  | "birdwatching"
  | "photography"
  | "river"
  | "culture"
  | "history"
  | "camping"
  | "reforestation"
  | "fishing"
  | "beach"
  | "sunset"
  | "viewpoint"
  | "wildlife";

export type CategoryKey =
  | "selva"
  | "rios"
  | "cascadas"
  | "playas"
  | "montanas"
  | "cultura"
  | "comunidades"
  | "aves"
  | "ecoturismo"
  | "aventura";

export type Difficulty = "facil" | "moderada" | "exigente";

export interface Localized {
  es: string;
  en: string;
}

export interface Destination {
  slug: string;
  name: string;
  category: CategoryKey;
  categories: CategoryKey[];
  region: Localized;
  coords: [number, number]; // [lat, lng]
  coordsVerified: boolean;
  summary: Localized;
  description: Localized;
  history?: Localized;
  activities: ActivityKey[];
  difficulty: Difficulty;
  visitDuration: Localized;
  season: Localized;
  access: Localized;
  safety: Localized;
  photos: string[]; // rutas relativas a /media
  videos: string[];
  sources: string[]; // enlaces a publicaciones originales
}

const IG = (code: string) => `https://www.instagram.com/p/${code}/`;

export const destinations: Destination[] = [
  {
    slug: "cascada-arenal",
    name: "Cascada Arenal",
    category: "cascadas",
    categories: ["cascadas", "selva", "ecoturismo", "aventura"],
    region: { es: "Arenal, Río Congo Arriba · Chepigana", en: "Arenal, Río Congo Arriba · Chepigana" },
    coords: [8.612, -78.247],
    coordsVerified: false,
    summary: {
      es: "Cascada escalonada en roca, rodeada de selva, con pozas para refrescarse.",
      en: "Tiered rock waterfall in the rainforest with natural pools.",
    },
    description: {
      es: "Una de las cascadas emblemáticas de Darién y escenario de las jornadas Explora & Reforesta. El agua cae en varios escalones de roca hasta pozas cristalinas en medio de la selva del valle de Arenal.",
      en: "One of Darién's signature waterfalls and home of the Explora & Reforesta days. Water drops over several rock steps into clear pools in the Arenal valley forest.",
    },
    history: {
      es: "Desde 2022 la comunidad y @xplore_darien organizan aquí jornadas de reforestación con más de 1 500 plantas por edición.",
      en: "Since 2022 the community and @xplore_darien have run reforestation days here, planting 1,500+ trees per edition.",
    },
    activities: ["hiking", "waterfall", "swimming", "photography", "reforestation", "camping"],
    difficulty: "moderada",
    visitDuration: { es: "Día completo", en: "Full day" },
    season: { es: "Todo el año; más caudal en temporada lluviosa (may–nov)", en: "Year-round; more flow in rainy season (May–Nov)" },
    access: { es: "Por la Panamericana hasta Río Congo Arriba y caminata guiada.", en: "Pan-American Highway to Río Congo Arriba, then guided hike." },
    safety: { es: "Roca resbaladiza. No subir a la cascada con crecidas. Ir siempre con guía local.", en: "Slippery rock. Avoid the falls during floods. Always go with a local guide." },
    photos: ["imagen/arenal.jpg", "imagen/arenal2.jpeg", "imagen/casgada arenal.jpeg", "instagram/posters/2021-11-25_CWtgRN1vXPq_foto_cover.jpg"],
    videos: [],
    sources: [IG("CWtgRN1vXPq"), IG("DfgX-g1Dq5f"), IG("CfWv0KUuh_m")],
  },
  {
    slug: "chorro-rio-venao",
    name: "Chorro Río Venao",
    category: "rios",
    categories: ["rios", "cascadas", "ecoturismo"],
    region: { es: "Valle de Arenal · Chepigana", en: "Arenal valley · Chepigana" },
    coords: [8.628, -78.226],
    coordsVerified: false,
    summary: {
      es: "Chorro escondido pero muy cercano: ideal para un domingo de chill.",
      en: "A hidden yet nearby waterfall — perfect for a laid-back Sunday.",
    },
    description: {
      es: "Un chorro de agua que cae sobre una poza oscura entre paredes de roca. Divertido, relajante y fácil de combinar con Cascada Arenal en el mismo recorrido.",
      en: "A chute of water falling into a dark pool between rock walls. Fun, relaxing, and easy to combine with Cascada Arenal on the same trip.",
    },
    activities: ["swimming", "waterfall", "river", "photography"],
    difficulty: "facil",
    visitDuration: { es: "Medio día", en: "Half day" },
    season: { es: "Verano (dic–abr) para agua más clara", en: "Dry season (Dec–Apr) for clearer water" },
    access: { es: "Cercano a Arenal, caminata corta por el río.", en: "Near Arenal, short river walk." },
    safety: { es: "Profundidad variable en la poza. Evitar después de lluvias fuertes.", en: "Variable pool depth. Avoid after heavy rain." },
    photos: ["instagram/posters/2025-10-10_DPovSRODfHd_reel_cover.jpg", "instagram/slides/2026-11-08_DfgX-g1Dq5f_slide-01.jpg"],
    videos: ["instagram/videos/2025-10-10_DPovSRODfHd_reel.mp4"],
    sources: [IG("DPovSRODfHd"), IG("DfgX-g1Dq5f")],
  },
  {
    slug: "cascada-el-jobo",
    name: "Cascada El Jobo",
    category: "cascadas",
    categories: ["cascadas", "selva", "aventura"],
    region: { es: "Valle de Arenal · Chepigana", en: "Arenal valley · Chepigana" },
    coords: [8.598, -78.271],
    coordsVerified: false,
    summary: {
      es: "Caída alta y estrecha escondida en un cañón de selva.",
      en: "Tall, narrow falls hidden in a forest canyon.",
    },
    description: {
      es: "Parte de los recorridos de Explora & Reforesta. Una cascada alta que se abre paso entre la selva densa, ideal para tomas con dron y fotografía de naturaleza.",
      en: "Part of the Explora & Reforesta circuits. A tall waterfall cutting through dense forest — great for drone shots and nature photography.",
    },
    activities: ["hiking", "waterfall", "photography", "reforestation"],
    difficulty: "moderada",
    visitDuration: { es: "Medio día", en: "Half day" },
    season: { es: "Todo el año", en: "Year-round" },
    access: { es: "Caminata guiada desde Arenal.", en: "Guided hike from Arenal." },
    safety: { es: "Sendero con lodo en temporada lluviosa. Usar calzado con agarre.", en: "Muddy trail in rainy season. Wear grippy footwear." },
    photos: ["instagram/posters/2024-10-14_DBIQrXZtZXZ_reel_cover.jpg"],
    videos: ["instagram/videos/2024-10-14_DBIQrXZtZXZ_reel.mp4"],
    sources: [IG("DBIQrXZtZXZ")],
  },
  {
    slug: "cascada-infiernillo",
    name: "Cascada Infiernillo",
    category: "cascadas",
    categories: ["cascadas", "aventura", "selva"],
    region: { es: "Darién (ubicación por confirmar)", en: "Darién (location to be confirmed)" },
    coords: [8.565, -78.305],
    coordsVerified: false,
    summary: {
      es: "“Donde el diablo dejó las cutarras”… pero a solo 2 horas caminando.",
      en: "“Where the devil left his sandals”… yet only a 2-hour walk away.",
    },
    description: {
      es: "Cascada remota con una poza profunda al pie. Se llega tras unas dos horas de caminata por selva y río.",
      en: "A remote waterfall with a deep plunge pool, reached after about two hours of forest and river hiking.",
    },
    activities: ["hiking", "waterfall", "swimming", "photography"],
    difficulty: "exigente",
    visitDuration: { es: "Día completo (≈2 h de caminata por trayecto)", en: "Full day (≈2 h hike each way)" },
    season: { es: "Verano (dic–abr)", en: "Dry season (Dec–Apr)" },
    access: { es: "Solo con guía. Punto de partida a confirmar con el operador.", en: "Guide only. Trailhead to be confirmed with the operator." },
    safety: { es: "Ubicación y sendero no verificados en la plataforma. No intentar sin guía.", en: "Location and trail not verified on the platform. Do not attempt without a guide." },
    photos: [
      "instagram/posters/2025-10-14_DPz0Gerja3Z_carrusel_cover.jpg",
      "instagram/slides/2025-10-14_DPz0Gerja3Z_slide-02.jpg",
      "instagram/slides/2025-10-14_DPz0Gerja3Z_slide-03.jpg",
    ],
    videos: [],
    sources: [IG("DPz0Gerja3Z")],
  },
  {
    slug: "parque-nacional-darien",
    name: "Parque Nacional Darién",
    category: "selva",
    categories: ["selva", "aves", "ecoturismo", "aventura", "montanas"],
    region: { es: "Pinogana · acceso por El Real de Santa María", en: "Pinogana · access via El Real de Santa María" },
    coords: [8.017, -77.733],
    coordsVerified: false,
    summary: {
      es: "Patrimonio de la Humanidad (1981) y Reserva de la Biosfera: la selva más extensa de Centroamérica.",
      en: "UNESCO World Heritage (1981) and Biosphere Reserve: Central America's largest rainforest.",
    },
    description: {
      es: "El parque nacional más grande de Panamá y el área protegida más grande de Centroamérica y el Caribe. Selva primaria, ríos, aves y fauna en uno de los lugares con mayor biodiversidad del continente.",
      en: "Panama's largest national park and the biggest protected area in Central America and the Caribbean — primary forest, rivers, birds and wildlife in one of the most biodiverse places on the continent.",
    },
    history: {
      es: "Declarado Patrimonio de la Humanidad en 1981 y Reserva de la Biosfera por la UNESCO.",
      en: "Declared a UNESCO World Heritage Site in 1981 and a Biosphere Reserve.",
    },
    activities: ["hiking", "birdwatching", "wildlife", "photography", "river", "camping"],
    difficulty: "exigente",
    visitDuration: { es: "2–4 días", en: "2–4 days" },
    season: { es: "Verano (dic–abr) recomendado", en: "Dry season (Dec–Apr) recommended" },
    access: { es: "Panamericana hasta Yaviza, bote a El Real y traslado a la estación del parque. Requiere permiso de MiAmbiente.", en: "Pan-American to Yaviza, boat to El Real, then transfer to the ranger station. MiAmbiente permit required." },
    safety: { es: "Zona fronteriza: viajar solo con operador autorizado y permisos vigentes. Registrarse con SENAFRONT/MiAmbiente.", en: "Border zone: travel only with an authorized operator and valid permits. Register with SENAFRONT/MiAmbiente." },
    photos: [
      "imagen/img7.jpeg",
      "imagen/img5.jpeg",
      "instagram/posters/2026-11-10_Dfk_rYaGOA2_carrusel_cover.jpg",
      "instagram/posters/2022-03-12_CbBBvsmuFF__carrusel_cover.jpg",
      "instagram/slides/2022-03-12_CbBBvsmuFF__slide-02.jpg",
    ],
    videos: ["instagram/videos/2026-11-09_DfiYvP4hpeX_reel.mp4", "instagram/videos/2022-03-21_CbYdLx0F7_L_reel.mp4"],
    sources: [IG("Dfk_rYaGOA2"), IG("DfiYvP4hpeX"), IG("CbBBvsmuFF_"), IG("CbYdLx0F7_L")],
  },
  {
    slug: "el-real-de-santa-maria",
    name: "El Real de Santa María",
    category: "cultura",
    categories: ["cultura", "rios"],
    region: { es: "Pinogana", en: "Pinogana" },
    coords: [8.131, -77.721],
    coordsVerified: false,
    summary: {
      es: "Pueblo histórico a orillas del Tuira, puerta al Parque Nacional Darién.",
      en: "Historic river town on the Tuira, gateway to Darién National Park.",
    },
    description: {
      es: "Pueblo ribereño donde se observan pequeños restos históricos de la época colonial. Punto de partida hacia la estación del Parque Nacional Darién.",
      en: "Riverside town with small colonial-era remains. Starting point to the Darién National Park ranger station.",
    },
    history: {
      es: "La región fue escenario de los primeros asentamientos españoles en tierra firme; Santa María la Antigua del Darién se fundó en 1510.",
      en: "The region saw the first Spanish settlements on the American mainland; Santa María la Antigua del Darién was founded in 1510.",
    },
    activities: ["history", "culture", "river", "photography"],
    difficulty: "facil",
    visitDuration: { es: "Medio día", en: "Half day" },
    season: { es: "Todo el año", en: "Year-round" },
    access: { es: "Bote desde Yaviza por el río Tuira.", en: "Boat from Yaviza along the Tuira River." },
    safety: { es: "Viajar con operador autorizado. Llevar documento de identidad.", en: "Travel with an authorized operator. Carry ID." },
    photos: ["instagram/slides/2026-11-10_Dfk_rYaGOA2_slide-04.jpg", "instagram/slides/2026-11-10_Dfk_rYaGOA2_slide-05.jpg"],
    videos: ["instagram/videos/2026-11-10_Dfk_rYaGOA2_carrusel-h12_video.mp4"],
    sources: [IG("Dfk_rYaGOA2")],
  },
  {
    slug: "yaviza",
    name: "Yaviza",
    category: "cultura",
    categories: ["cultura", "rios", "comunidades"],
    region: { es: "Pinogana", en: "Pinogana" },
    coords: [8.1557, -77.6926],
    coordsVerified: true,
    summary: {
      es: "Fin de la carretera Panamericana: el Tapón del Darién empieza aquí.",
      en: "The end of the Pan-American Highway: the Darién Gap starts here.",
    },
    description: {
      es: "Kilómetro 12 580 desde Alaska. Pueblo sobre el río Chucunaque con las ruinas de la casa-fuerte colonial y vida fluvial intensa.",
      en: "Kilometer 12,580 from Alaska. A town on the Chucunaque River with colonial fort ruins and busy river life.",
    },
    history: {
      es: "Conserva los restos de la casa-fuerte de Yaviza, construida para defender el paso fluvial.",
      en: "Home to the remains of Yaviza's colonial fort, built to guard the river passage.",
    },
    activities: ["history", "culture", "river", "photography"],
    difficulty: "facil",
    visitDuration: { es: "2–3 horas", en: "2–3 hours" },
    season: { es: "Todo el año", en: "Year-round" },
    access: { es: "Por la Panamericana (≈ 6 h desde Ciudad de Panamá).", en: "Pan-American Highway (≈ 6 h from Panama City)." },
    safety: { es: "Puesto de control fronterizo: llevar identificación. No avanzar más allá sin operador.", en: "Border checkpoint: carry ID. Do not go further without an operator." },
    photos: ["imagen/yaviza.jpg", "imagen/img10.jpeg", "instagram/posters/2021-11-25_CWtvo9_v4IK_carrusel_cover.jpg"],
    videos: ["instagram/videos/2021-11-25_CWtvo9_v4IK_carrusel-h1_video.mp4"],
    sources: [IG("CWtvo9_v4IK")],
  },
  {
    slug: "puerto-lara",
    name: "Puerto Lara",
    category: "comunidades",
    categories: ["comunidades", "cultura"],
    region: { es: "Comunidad Wounaan · cerca de Santa Fe", en: "Wounaan community · near Santa Fe" },
    coords: [8.552, -78.163],
    coordsVerified: false,
    summary: {
      es: "Comunidad indígena con casas de palma, artesanía y tradición viva.",
      en: "Indigenous community with palm-thatched homes, crafts and living traditions.",
    },
    description: {
      es: "Visita cultural a una comunidad indígena: arquitectura tradicional, danzas, tejidos y tallas. Siempre con autorización y acompañamiento de la comunidad.",
      en: "A cultural visit to an Indigenous community: traditional architecture, dances, weaving and carving — always with the community's permission and hosting.",
    },
    activities: ["culture", "photography", "hiking"],
    difficulty: "facil",
    visitDuration: { es: "Medio día", en: "Half day" },
    season: { es: "Todo el año", en: "Year-round" },
    access: { es: "Desvío desde la Panamericana; coordinar visita con la comunidad.", en: "Turn-off from the Pan-American; arrange the visit with the community." },
    safety: { es: "Pedir permiso antes de fotografiar a personas. Respetar normas comunitarias.", en: "Ask before photographing people. Respect community rules." },
    photos: ["imagen/lara.avif", "imagen/puerto lara darien.avif"],
    videos: [],
    sources: [],
  },
  {
    slug: "mogue",
    name: "Mogué",
    category: "comunidades",
    categories: ["comunidades", "aves", "rios", "cultura"],
    region: { es: "Comunidad Emberá · río Mogué", en: "Emberá community · Mogué River" },
    coords: [8.132, -78.214],
    coordsVerified: false,
    summary: {
      es: "Aldea Emberá sobre el río, base para observar aves en la selva.",
      en: "Emberá river village and base for forest birdwatching.",
    },
    description: {
      es: "Comunidad Emberá con casas de palma sobre pilotes. Se llega en bote desde La Palma; ofrece recorridos por la selva y observación de aves con guías locales.",
      en: "Emberá community of stilt houses with palm roofs. Reached by boat from La Palma; offers forest walks and birdwatching with local guides.",
    },
    activities: ["culture", "birdwatching", "river", "hiking", "wildlife"],
    difficulty: "moderada",
    visitDuration: { es: "1–2 días", en: "1–2 days" },
    season: { es: "Todo el año; mareas condicionan el acceso", en: "Year-round; tides affect access" },
    access: { es: "Bote desde La Palma (según marea).", en: "Boat from La Palma (tide-dependent)." },
    safety: { es: "Chaleco salvavidas obligatorio en bote. Respetar normas comunitarias.", en: "Life jacket required on boats. Respect community rules." },
    photos: ["imagen/mogue.jpeg"],
    videos: [],
    sources: [],
  },
  {
    slug: "la-chunga",
    name: "La Chunga",
    category: "comunidades",
    categories: ["comunidades", "cultura"],
    region: { es: "Golfo de San Miguel (aprox.)", en: "Gulf of San Miguel (approx.)" },
    coords: [8.098, -78.318],
    coordsVerified: false,
    summary: {
      es: "Comunidad tradicional de casas de palma entre jardines y selva.",
      en: "Traditional community of palm-thatched homes among gardens and forest.",
    },
    description: {
      es: "Comunidad con arquitectura tradicional de techos de palma. Experiencias culturales autorizadas, gastronomía local y artesanía.",
      en: "A community with traditional palm-roof architecture. Authorized cultural experiences, local food and crafts.",
    },
    activities: ["culture", "photography"],
    difficulty: "facil",
    visitDuration: { es: "Medio día", en: "Half day" },
    season: { es: "Todo el año", en: "Year-round" },
    access: { es: "Acceso fluvial/marítimo; coordinar con la comunidad.", en: "River/sea access; arrange with the community." },
    safety: { es: "Visitar solo con autorización de la comunidad.", en: "Visit only with the community's authorization." },
    photos: ["imagen/la chunga.jpeg"],
    videos: [],
    sources: [],
  },
  {
    slug: "la-palma",
    name: "La Palma",
    category: "cultura",
    categories: ["cultura", "playas", "rios"],
    region: { es: "Capital de Darién · Chepigana", en: "Capital of Darién · Chepigana" },
    coords: [8.4067, -78.1428],
    coordsVerified: true,
    summary: {
      es: "Capital provincial frente al Golfo de San Miguel y puerto hacia las comunidades.",
      en: "Provincial capital on the Gulf of San Miguel and port to the communities.",
    },
    description: {
      es: "Pueblo costero en la desembocadura del río Tuira. Desde su muelle salen botes hacia comunidades como Mogué y la costa del Pacífico.",
      en: "Coastal town at the mouth of the Tuira River. Boats leave its pier for communities such as Mogué and the Pacific coast.",
    },
    activities: ["culture", "river", "sunset", "photography"],
    difficulty: "facil",
    visitDuration: { es: "Medio día", en: "Half day" },
    season: { es: "Todo el año", en: "Year-round" },
    access: { es: "Bote desde Puerto Quimba (Panamericana).", en: "Boat from Puerto Quimba (off the Pan-American)." },
    safety: { es: "Usar chaleco salvavidas en el cruce.", en: "Wear a life jacket on the crossing." },
    photos: ["imagen/image1.jpeg", "imagen/img6.jpg"],
    videos: [],
    sources: [],
  },
  {
    slug: "playa-muerto",
    name: "Playa Muerto",
    category: "playas",
    categories: ["playas", "comunidades", "selva"],
    region: { es: "Costa pacífica · Comarca Emberá", en: "Pacific coast · Emberá Comarca" },
    coords: [7.962, -78.329],
    coordsVerified: false,
    summary: {
      es: "Playa salvaje donde la selva toca el Pacífico, sin acceso terrestre.",
      en: "Wild beach where the jungle meets the Pacific, no road access.",
    },
    description: {
      es: "Bahía de arena oscura enmarcada por selva y montañas, con una comunidad Emberá. Miradores, senderos y atardeceres espectaculares de enero a abril.",
      en: "A dark-sand bay framed by jungle and mountains, home to an Emberá community. Viewpoints, trails and spectacular sunsets from January to April.",
    },
    activities: ["beach", "hiking", "viewpoint", "sunset", "culture", "photography"],
    difficulty: "moderada",
    visitDuration: { es: "2–3 días", en: "2–3 days" },
    season: { es: "Enero–abril (mejores atardeceres y mar en calma)", en: "January–April (best sunsets, calmer sea)" },
    access: { es: "Solo por mar, en bote desde La Palma o Garachiné.", en: "By sea only, by boat from La Palma or Garachiné." },
    safety: { es: "Travesía marítima: verificar estado del mar y usar chaleco.", en: "Sea crossing: check sea conditions and wear a life jacket." },
    photos: ["imagen/playa mueto2.jpeg", "imagen/playamuerto3.jpeg", "imagen/playmuerto.jpeg"],
    videos: [],
    sources: [],
  },
  {
    slug: "bahia-pina",
    name: "Bahía Piña",
    category: "playas",
    categories: ["playas", "aventura"],
    region: { es: "Costa sur del Pacífico", en: "Southern Pacific coast" },
    coords: [7.566, -78.185],
    coordsVerified: false,
    summary: {
      es: "Joya oculta sin acceso terrestre: prácticamente una isla.",
      en: "A hidden gem with no road access — practically an island.",
    },
    description: {
      es: "Pueblo costero al que se llega por agua o avioneta. Mar abierto, selva costera y fama mundial por la pesca deportiva en el Pacífico.",
      en: "Coastal village reached by water or small plane. Open ocean, coastal jungle and world fame for Pacific sport fishing.",
    },
    activities: ["beach", "fishing", "photography", "sunset", "wildlife"],
    difficulty: "facil",
    visitDuration: { es: "2–4 días", en: "2–4 days" },
    season: { es: "Verano (dic–abr)", en: "Dry season (Dec–Apr)" },
    access: { es: "Avioneta desde Ciudad de Panamá o bote por la costa.", en: "Small plane from Panama City or boat along the coast." },
    safety: { es: "Pesca solo donde esté permitida y con operador autorizado.", en: "Fish only where allowed, with an authorized operator." },
    photos: ["instagram/posters/2025-07-11_DL-5eo6PMvD_reel_cover.jpg"],
    videos: ["instagram/videos/2025-07-11_DL-5eo6PMvD_reel.mp4"],
    sources: [IG("DL-5eo6PMvD")],
  },
  {
    slug: "cerro-chucanti",
    name: "Cerro Chucantí",
    category: "montanas",
    categories: ["montanas", "aves", "selva", "ecoturismo"],
    region: { es: "Serranía de Majé · límite Darién–Panamá Este", en: "Majé range · Darién–Panamá Este border" },
    coords: [8.795, -78.452],
    coordsVerified: false,
    summary: {
      es: "Bosque nuboso con especies que solo existen aquí, como el helecho gigante.",
      en: "Cloud forest with species found nowhere else, like the giant tree fern.",
    },
    description: {
      es: "Reserva Natural Privada administrada por la ONG Adopta Bosque, dedicada a conservación, investigación, educación ambiental y voluntariado. Uno de los lugares más estudiados de Darién.",
      en: "Private nature reserve run by the NGO Adopta Bosque, focused on conservation, research, environmental education and volunteering — one of Darién's most studied sites.",
    },
    activities: ["hiking", "birdwatching", "wildlife", "camping", "photography", "viewpoint"],
    difficulty: "exigente",
    visitDuration: { es: "2–3 días", en: "2–3 days" },
    season: { es: "Verano (dic–abr)", en: "Dry season (Dec–Apr)" },
    access: { es: "Coordinación previa con Adopta Bosque; ascenso a pie.", en: "Prior arrangement with Adopta Bosque; ascent on foot." },
    safety: { es: "Clima frío y lluvioso en la cima. Llevar abrigo e impermeable.", en: "Cold, rainy summit. Bring warm and waterproof layers." },
    photos: ["instagram/posters/2023-04-19_CrO2CohvgYG_foto_cover.jpg", "instagram/posters/2025-08-06_DNAItQeMV9f_foto_cover.jpg"],
    videos: [],
    sources: [IG("CrO2CohvgYG"), IG("DNAItQeMV9f")],
  },
  {
    slug: "el-embudo",
    name: "El Embudo",
    category: "cascadas",
    categories: ["cascadas", "montanas", "aventura"],
    region: { es: "Cordillera de Majé · cerca de Tortí (Panamá Este)", en: "Majé range · near Tortí (Panamá Este)" },
    coords: [8.838, -78.405],
    coordsVerified: false,
    summary: {
      es: "Cascada entre musgo y niebla tras 1,5 h de caminata: otro ecosistema.",
      en: "A waterfall in moss and mist after a 1.5 h hike — a different ecosystem.",
    },
    description: {
      es: "Popular entre amantes de las cascadas. Clima lluvioso, musgo y frío hacen sentir que llegaste a otro mundo. Un trip perfecto de fin de semana.",
      en: "Popular with waterfall lovers. Rain, moss and cool air make it feel like another world. A perfect weekend trip.",
    },
    activities: ["hiking", "waterfall", "swimming", "photography"],
    difficulty: "moderada",
    visitDuration: { es: "Día completo (≈1,5 h de caminata)", en: "Full day (≈1.5 h hike)" },
    season: { es: "Todo el año", en: "Year-round" },
    access: { es: "Desde Tortí por la Panamericana, caminata guiada.", en: "From Tortí off the Pan-American, guided hike." },
    safety: { es: "Sendero húmedo y resbaladizo. Evitar con crecidas.", en: "Wet, slippery trail. Avoid during floods." },
    photos: ["instagram/posters/2025-08-12_DNRXk6ov-H4_carrusel_cover.jpg", "instagram/slides/2025-08-12_DNRXk6ov-H4_slide-03.jpg", "instagram/slides/2025-08-12_DNRXk6ov-H4_slide-05.jpg"],
    videos: ["instagram/videos/2025-08-13_DNTsjVjPh3N_reel.mp4"],
    sources: [IG("DNTsjVjPh3N"), IG("DNRXk6ov-H4")],
  },
  {
    slug: "giba-del-toro",
    name: "La Giba del Toro",
    category: "montanas",
    categories: ["montanas", "aventura"],
    region: { es: "Tortí (Panamá Este, límite con Darién)", en: "Tortí (Panamá Este, Darién border)" },
    coords: [8.905, -78.36],
    coordsVerified: false,
    summary: {
      es: "Cerro de ≈950 msnm para acampar y ver el amanecer sobre las nubes.",
      en: "≈950 m peak for camping and sunrise above the clouds.",
    },
    description: {
      es: "El cerro que se eleva abruptamente sobre Tortí. Clima fresco de día y frío intenso de noche; vistas espectaculares al amanecer.",
      en: "The peak that rises abruptly over Tortí. Cool days, very cold nights and spectacular sunrise views.",
    },
    activities: ["hiking", "camping", "viewpoint", "sunset", "photography"],
    difficulty: "exigente",
    visitDuration: { es: "2 días / 1 noche", en: "2 days / 1 night" },
    season: { es: "Verano (dic–abr)", en: "Dry season (Dec–Apr)" },
    access: { es: "Desde Tortí; ascenso guiado.", en: "From Tortí; guided ascent." },
    safety: { es: "Frío nocturno: saco de dormir y abrigo. Solo con guía.", en: "Cold nights: sleeping bag and warm layers. Guide only." },
    photos: ["instagram/posters/2023-02-28_CpOd3tTMaCW_carrusel_cover.jpg", "instagram/posters/2023-03-15_Cp0UqliOI4Q_carrusel_cover.jpg", "instagram/slides/2023-03-15_Cp0UqliOI4Q_slide-02.jpg"],
    videos: [],
    sources: [IG("CpOd3tTMaCW"), IG("Cp0UqliOI4Q")],
  },
  {
    slug: "entrada-a-darien",
    name: "Bienvenidos a Darién",
    category: "cultura",
    categories: ["cultura"],
    region: { es: "Límite provincial · Panamericana", en: "Province border · Pan-American Highway" },
    coords: [8.708, -78.17],
    coordsVerified: false,
    summary: {
      es: "El arco de bienvenida: el comienzo de la aventura por tierra.",
      en: "The welcome arch: where the overland adventure begins.",
    },
    description: {
      es: "Punto de interés y parada fotográfica en la Panamericana al entrar en la provincia.",
      en: "Point of interest and photo stop on the Pan-American Highway as you enter the province.",
    },
    activities: ["photography"],
    difficulty: "facil",
    visitDuration: { es: "15 minutos", en: "15 minutes" },
    season: { es: "Todo el año", en: "Year-round" },
    access: { es: "Junto a la Panamericana.", en: "Beside the Pan-American Highway." },
    safety: { es: "Estacionar fuera de la vía.", en: "Park off the road." },
    photos: ["imagen/img2.jpeg"],
    videos: [],
    sources: [],
  },
];

export const getDestination = (slug: string) => destinations.find((d) => d.slug === slug);
