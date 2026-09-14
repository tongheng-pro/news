/**
 * LOCAL MOCK DATASET  (fallback / offline seed)
 * ============================================
 *
 * The site now pulls REAL news from public APIs — see `src/lib/news/sources.ts`.
 * This file is the safety net:
 *
 *   • `src/lib/news/index.ts` uses it to BACKFILL any category the live feeds
 *     leave nearly empty, so every section stays populated.
 *   • If the live feeds fail entirely (offline build, all APIs down) it becomes
 *     the whole dataset.
 *   • With `NEWS_MODE=mock` it is the only source (no network at build time).
 *
 * Every article below is fictional. Real company names are used the way a trade
 * publication would, but no quote, number or event here is real. Items carry
 * `isMock: true` so they can be told apart from live stories.
 *
 * To drop the fallback once you trust the live feeds: delete this file and the
 * `RAW_ARTICLES` import in `src/lib/news/index.ts`.
 */

import type { Article, Category } from '../types/news';

interface Seed {
  title: string;
  excerpt: string;
  category: Category;
  source: string;
  author: string;
  tags: string[];
  featured?: boolean;
  trending?: boolean;
  /** Custom opening paragraphs. The builder appends generic body paragraphs. */
  lead: string[];
  /** Days before "now" the story was published. */
  daysAgo: number;
  /** Hours after publication it was last updated. */
  updatedAfterHours?: number;
}

/** Deterministic slug from a title. */
function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

/** Reusable filler paragraphs so every article reads like a full story. */
const FILLER: string[] = [
  'The announcement lands amid intense competition across the sector, where rivals have spent the past year racing to ship comparable capabilities. Analysts who cover the space said the move was widely expected but that the timing still caught parts of the market off guard.',
  'Industry observers note that execution will matter more than the reveal itself. Similar initiatives have stumbled at the point of broad rollout, when infrastructure costs, support load and real-world edge cases collide with ambitious launch messaging.',
  'Developers and enterprise customers reached for comment offered a mix of enthusiasm and caution. Several said they would wait for independent benchmarks and a few billing cycles before committing production workloads.',
  'Regulators on both sides of the Atlantic have signaled growing interest in the area, and any expansion is likely to draw scrutiny over competition, data handling and consumer protection.',
  'The company said additional details, pricing tiers and regional availability would be shared in the coming weeks, with a broader briefing planned for its next developer event.',
];

function buildContent(lead: string[]): string {
  // A realistic body: the custom lead, then two rotating filler paragraphs,
  // then a short closing line.
  const body = [
    ...lead,
    FILLER[lead.length % FILLER.length],
    FILLER[(lead.length + 2) % FILLER.length],
    'For now, the practical impact on everyday users is modest, but the direction of travel is unmistakable.',
  ];
  return body.join('\n\n');
}

function readingTimeFor(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(2, Math.round(words / 200));
}

const NOW = new Date('2026-08-27T12:00:00.000Z').getTime();

function buildArticle(seed: Seed, id: number): Article {
  const published = new Date(NOW - seed.daysAgo * 86_400_000);
  const updated = new Date(published.getTime() + (seed.updatedAfterHours ?? 0) * 3_600_000);
  const content = buildContent(seed.lead);
  const slug = toSlug(seed.title);
  return {
    id,
    slug,
    title: seed.title,
    excerpt: seed.excerpt,
    content,
    category: seed.category,
    source: seed.source,
    author: seed.author,
    image: `https://picsum.photos/seed/${slug}/1200/675`,
    publishedAt: published.toISOString(),
    updatedAt: updated.toISOString(),
    readingTime: readingTimeFor(content),
    featured: Boolean(seed.featured),
    trending: Boolean(seed.trending),
    tags: seed.tags,
    popularity: seed.trending ? 400 : seed.featured ? 250 : 60,
    isMock: true,
    sourceUrl: `https://picsum.photos/seed/${slug}/1200/675`,
  };
}

const SEEDS: Seed[] = [
  {
    title: 'OpenAI unveils its next flagship model with agentic tool use built in',
    excerpt: 'The new model can plan multi-step tasks, call external tools and verify its own output before responding, the company said.',
    category: 'AI',
    source: 'TechPulse Wire',
    author: 'Dana Whitfield',
    tags: ['OpenAI', 'LLM', 'agents'],
    featured: true,
    trending: true,
    daysAgo: 0,
    updatedAfterHours: 5,
    lead: [
      'OpenAI on Wednesday introduced what it calls its most capable model to date, a system designed to break complex requests into steps, invoke external tools on its own and check results before answering.',
      'The company framed the release as a shift from chat assistants toward software that can carry out work, positioning it against a wave of competing "agentic" products from Google, Anthropic and a crowd of startups.',
      'Early access opens to paying developers immediately, with a rate-limited preview for consumer subscribers rolling out over the next week.',
    ],
  },
  {
    title: 'NVIDIA launches a data-center platform aimed at trillion-parameter inference',
    excerpt: 'The new rack-scale system pairs next-generation GPUs with a custom interconnect the company says cuts inference cost per token sharply.',
    category: 'Hardware',
    source: 'SiliconBeat',
    author: 'Marcus Ohaeri',
    tags: ['NVIDIA', 'GPU', 'data center'],
    featured: true,
    trending: true,
    daysAgo: 1,
    updatedAfterHours: 12,
    lead: [
      'NVIDIA used its fall hardware event to unveil a rack-scale computing platform built specifically for serving very large AI models, claiming a significant reduction in cost per token compared with the systems shipping today.',
      'The platform combines the company\'s newest GPUs, a redesigned high-bandwidth interconnect and a liquid-cooling reference design that partners can build against.',
      'Cloud providers including several hyperscalers are listed as launch customers, with general availability slated for the first half of next year.',
    ],
  },
  {
    title: 'Apple previews on-device health models for the next Apple Watch',
    excerpt: 'A dedicated coprocessor will run sleep, cardiac and metabolic models locally, with no data leaving the device, Apple says.',
    category: 'Apple',
    source: 'TechPulse Wire',
    author: 'Priya Nandakumar',
    tags: ['Apple', 'Apple Watch', 'health', 'privacy'],
    featured: true,
    trending: true,
    daysAgo: 2,
    updatedAfterHours: 6,
    lead: [
      'Apple offered an early look at a set of health features for its next smartwatch that run entirely on the device, powered by a small dedicated coprocessor.',
      'The company emphasized that raw sensor data and model outputs stay on the watch unless a user explicitly chooses to share them, a pitch aimed squarely at privacy-conscious buyers and regulators.',
      'The features are expected to ship alongside the next watchOS release this fall.',
    ],
  },
  {
    title: 'Google brings Gemini deep-research mode to Workspace for every paid tier',
    excerpt: 'The assistant can now compile sourced briefs across a user\'s documents, email and the open web in a single pass.',
    category: 'Google',
    source: 'The Grid',
    author: 'Elliot Sarraf',
    tags: ['Google', 'Gemini', 'Workspace'],
    trending: true,
    daysAgo: 2,
    lead: [
      'Google is rolling its Gemini "deep research" capability into Workspace for all paid subscribers, letting the assistant assemble cited summaries that draw on a user\'s own files as well as public sources.',
      'The company says outputs include inline citations and a visible research plan the user can edit before the assistant runs it.',
    ],
  },
  {
    title: 'Microsoft expands Copilot to the Windows shell with an opt-in agent mode',
    excerpt: 'The assistant can now take actions across apps and settings, with every step logged and reversible, Microsoft says.',
    category: 'Microsoft',
    source: 'Redmond Report',
    author: 'Hannah Beckley',
    tags: ['Microsoft', 'Windows', 'Copilot'],
    trending: true,
    daysAgo: 3,
    updatedAfterHours: 20,
    lead: [
      'Microsoft is bringing an opt-in "agent mode" to Copilot on Windows that can change settings, organize files and drive supported applications on a user\'s behalf.',
      'Every action is recorded in a timeline the user can review and undo, and the feature is off by default for managed enterprise devices.',
    ],
  },
  {
    title: 'A critical flaw in a widely used SSH library prompts emergency patching',
    excerpt: 'Maintainers disclosed a pre-authentication vulnerability affecting servers built on the library over the past three years.',
    category: 'Cybersecurity',
    source: 'ThreatLine',
    author: 'Owen Castellano',
    tags: ['vulnerability', 'open source', 'SSH'],
    trending: true,
    daysAgo: 1,
    updatedAfterHours: 9,
    lead: [
      'Maintainers of a popular open-source SSH library published an emergency release after researchers found a vulnerability that could let an unauthenticated attacker execute code on affected servers.',
      'The flaw affects builds shipped over roughly the past three years. Several Linux distributions and appliance vendors have already issued updated packages.',
      'There is no confirmed exploitation in the wild yet, but proof-of-concept code is expected within days, researchers warned.',
    ],
  },
  {
    title: 'The Rust project ships a long-awaited stable async story for embedded targets',
    excerpt: 'A new set of language and library features makes async/await practical on microcontrollers without a heap.',
    category: 'Programming',
    source: 'CompileTime',
    author: 'Sofia Aaltonen',
    tags: ['Rust', 'async', 'embedded'],
    daysAgo: 4,
    lead: [
      'The Rust team stabilized a bundle of features that together make async/await usable on constrained embedded devices, including support for async functions in traits and allocation-free executors.',
      'Embedded developers have relied on nightly compilers and workarounds for years; the change moves that work onto stable Rust.',
    ],
  },
  {
    title: 'Valve teases a new Steam Machine and a standalone VR headset',
    excerpt: 'A short video showed a compact living-room PC and an untethered headset, both running SteamOS.',
    category: 'Gaming',
    source: 'PixelPress',
    author: 'Ravi Menon',
    tags: ['Valve', 'Steam', 'VR', 'hardware'],
    trending: true,
    daysAgo: 3,
    lead: [
      'Valve published a brief teaser showing two unannounced devices: a small form-factor living-room PC and a standalone VR headset, both running SteamOS.',
      'The company gave no price or release date, saying only that more information would come "when it\'s ready."',
    ],
  },
  {
    title: 'A climate-hardware startup raises $180M to scale iron-air grid batteries',
    excerpt: 'The company says its multi-day storage cells are cheap enough to firm up wind and solar without lithium.',
    category: 'Startups',
    source: 'Runway',
    author: 'Grace Adeyemi',
    tags: ['funding', 'energy', 'batteries', 'climate'],
    daysAgo: 5,
    lead: [
      'A startup building long-duration grid storage from iron and air said it had closed a $180 million round to build its first full-scale factory.',
      'The company claims its cells can discharge over multiple days at a fraction of the cost of lithium-ion, targeting utilities that need to cover long stretches of low wind and sun.',
    ],
  },
  {
    title: 'AWS cuts prices on its serverless database and adds a scale-to-zero tier',
    excerpt: 'The change targets spiky workloads and side projects that sat idle most of the day under the old pricing.',
    category: 'Cloud',
    source: 'The Grid',
    author: 'Elliot Sarraf',
    tags: ['AWS', 'serverless', 'database', 'pricing'],
    daysAgo: 6,
    lead: [
      'Amazon Web Services lowered prices on its serverless relational database and introduced a tier that pauses billing for compute when a database is idle.',
      'The move follows similar scale-to-zero options from competitors and independent database vendors that have chipped away at AWS in the developer market.',
    ],
  },
  {
    title: 'Researchers demonstrate a room-temperature single-photon source on silicon',
    excerpt: 'The device could make quantum communication hardware far cheaper to manufacture at scale.',
    category: 'Science',
    source: 'Lab Notes',
    author: 'Dr. Teodora Ilic',
    tags: ['quantum', 'photonics', 'research'],
    daysAgo: 7,
    lead: [
      'A research group reported a single-photon emitter that works at room temperature and can be fabricated using standard silicon processes.',
      'Reliable, cheap single-photon sources are a bottleneck for quantum key distribution and photonic quantum computing; most existing options need deep cooling.',
    ],
  },
  {
    title: 'Samsung\'s next foldable reportedly drops the crease with a new hinge stack',
    excerpt: 'Supply-chain reports describe a multi-layer hinge and a redesigned display laminate for the next Fold.',
    category: 'Mobile',
    source: 'HandsetHQ',
    author: 'Yuki Tanaka',
    tags: ['Samsung', 'foldable', 'smartphones'],
    daysAgo: 4,
    lead: [
      'Reports from display-industry sources describe Samsung\'s next large foldable as using a redesigned hinge and display laminate that largely eliminates the visible crease.',
      'Samsung has not commented. The company typically unveils its foldables in the second half of the year.',
    ],
  },
  {
    title: 'Anthropic publishes a method for auditing what features a model has learned',
    excerpt: 'The technique maps internal activations to human-readable concepts and flags unexpected ones.',
    category: 'AI',
    source: 'TechPulse Wire',
    author: 'Dana Whitfield',
    tags: ['Anthropic', 'interpretability', 'safety'],
    daysAgo: 8,
    lead: [
      'Anthropic released research describing a way to inspect the internal representations of a large language model and connect them to concepts a person can name.',
      'The company says the approach helped it find and remove a small number of features that correlated with unsafe behavior.',
    ],
  },
  {
    title: 'GitHub rolls out repository-wide semantic code search to all users',
    excerpt: 'The feature indexes symbols and natural-language intent, not just text, across public and private repos.',
    category: 'Programming',
    source: 'CompileTime',
    author: 'Sofia Aaltonen',
    tags: ['GitHub', 'developer tools', 'search'],
    trending: true,
    daysAgo: 5,
    lead: [
      'GitHub made semantic code search generally available, letting developers query a repository by describing what a piece of code does rather than guessing at exact identifiers.',
      'The index covers private repositories for paid accounts, with search happening server-side against an embedding index refreshed on push.',
    ],
  },
  {
    title: 'A ransomware crew leaks data from a major logistics provider after failed talks',
    excerpt: 'The group posted internal documents it says span shipping manifests and HR records for tens of thousands of staff.',
    category: 'Cybersecurity',
    source: 'ThreatLine',
    author: 'Owen Castellano',
    tags: ['ransomware', 'data breach', 'logistics'],
    daysAgo: 6,
    lead: [
      'A ransomware group published a large cache of files it claims to have stolen from an international logistics company, after the company declined to pay.',
      'The provider confirmed a "cyber incident" and said it had notified law enforcement and affected employees. Operations were briefly disrupted at several sorting hubs.',
    ],
  },
  {
    title: 'Meta open-sources a small multilingual model tuned for on-device translation',
    excerpt: 'The 2-billion-parameter model targets phones and covers 40 languages with quantized weights.',
    category: 'AI',
    source: 'The Grid',
    author: 'Elliot Sarraf',
    tags: ['Meta', 'open source', 'translation'],
    daysAgo: 9,
    lead: [
      'Meta released a compact multilingual model under a permissive license, aimed at running translation locally on modern smartphones.',
      'The company published quantized weights and a reference runtime, and says the model handles 40 languages with quality close to its previous server-side system.',
    ],
  },
  {
    title: 'Intel details its next foundry node and lands a large external customer',
    excerpt: 'The company said a major fabless chip designer had committed to volume production on its upcoming process.',
    category: 'Hardware',
    source: 'SiliconBeat',
    author: 'Marcus Ohaeri',
    tags: ['Intel', 'semiconductors', 'foundry'],
    daysAgo: 7,
    lead: [
      'Intel shared technical details of its next manufacturing node and said a major external chip designer had signed on for high-volume production.',
      'The win is a milestone for Intel\'s effort to build a contract manufacturing business that competes with the largest Asian foundries.',
    ],
  },
  {
    title: 'Nintendo confirms a hardware refresh with a bigger OLED screen and more storage',
    excerpt: 'The mid-generation update keeps the same game library and adds a faster storage controller.',
    category: 'Gaming',
    source: 'PixelPress',
    author: 'Ravi Menon',
    tags: ['Nintendo', 'consoles', 'hardware'],
    daysAgo: 8,
    lead: [
      'Nintendo announced a refreshed version of its current console with a larger OLED display, double the internal storage and a faster storage controller.',
      'The company stressed that the existing game catalog runs unchanged and that the update is not a new console generation.',
    ],
  },
  {
    title: 'A developer-tools startup raises a $60M Series B for AI code review',
    excerpt: 'The company\'s product reviews pull requests for logic bugs and flags risky changes before merge.',
    category: 'Startups',
    source: 'Runway',
    author: 'Grace Adeyemi',
    tags: ['funding', 'developer tools', 'AI'],
    daysAgo: 10,
    lead: [
      'A startup that builds automated code review tooling closed a $60 million Series B, saying its customer base had grown to several thousand engineering teams.',
      'The product analyzes proposed changes for correctness issues, not just style, and posts inline comments on pull requests.',
    ],
  },
  {
    title: 'Cloudflare adds a region-locked inference network for regulated industries',
    excerpt: 'Customers can pin AI workloads to specific countries with contractual guarantees on data residency.',
    category: 'Cloud',
    source: 'The Grid',
    author: 'Elliot Sarraf',
    tags: ['Cloudflare', 'inference', 'compliance'],
    daysAgo: 9,
    lead: [
      'Cloudflare launched an inference offering that lets customers restrict where their AI workloads run down to the country level, with contractual data-residency commitments.',
      'The company is pitching the product at banks, healthcare providers and public-sector buyers that face strict rules on where data can be processed.',
    ],
  },
  {
    title: 'NASA and a private partner set a launch window for a lunar power demo',
    excerpt: 'The mission will test a compact fission reactor designed to run through the two-week lunar night.',
    category: 'Science',
    source: 'Lab Notes',
    author: 'Dr. Teodora Ilic',
    tags: ['NASA', 'space', 'nuclear'],
    daysAgo: 11,
    lead: [
      'NASA and a commercial partner announced a launch window for a demonstration of a small fission reactor intended to provide continuous power on the lunar surface.',
      'Solar power on the Moon is interrupted by roughly 14 days of darkness at a time; a reliable reactor would change what long-duration missions can attempt.',
    ],
  },
  {
    title: 'Qualcomm shows a laptop chip it says matches desktop parts on sustained load',
    excerpt: 'Early demos focused on video export and local AI tasks running for minutes without throttling.',
    category: 'Hardware',
    source: 'SiliconBeat',
    author: 'Marcus Ohaeri',
    tags: ['Qualcomm', 'laptops', 'Arm'],
    daysAgo: 12,
    lead: [
      'Qualcomm demonstrated its next laptop processor with a focus on sustained performance, running video exports and local AI workloads for extended periods without significant throttling.',
      'Independent testing will determine whether the demos hold up, but PC makers are expected to ship systems based on the chip early next year.',
    ],
  },
  {
    title: 'Signal ships usernames and sealed contact discovery to all users',
    excerpt: 'People can now connect without sharing a phone number, with the server unable to see the social graph.',
    category: 'Cybersecurity',
    source: 'ThreatLine',
    author: 'Owen Castellano',
    tags: ['Signal', 'privacy', 'encryption'],
    daysAgo: 13,
    lead: [
      'The Signal Foundation completed the rollout of usernames, letting users add each other without exchanging phone numbers.',
      'The organization also described changes to contact discovery designed so its servers cannot reconstruct who knows whom.',
    ],
  },
  {
    title: 'The Python steering council accepts a proposal for optional static typing checks in the runtime',
    excerpt: 'A new interpreter flag will enforce annotations at module boundaries, off by default.',
    category: 'Programming',
    source: 'CompileTime',
    author: 'Sofia Aaltonen',
    tags: ['Python', 'typing', 'languages'],
    daysAgo: 10,
    lead: [
      'Python\'s steering council accepted a proposal to add an opt-in runtime mode that checks type annotations at module boundaries.',
      'The feature is disabled by default and aimed at catching interface mismatches in large codebases without a separate type checker in the loop.',
    ],
  },
  {
    title: 'Epic Games opens its store to third-party stores on Android in more regions',
    excerpt: 'The change follows regulatory action and lets other marketplaces ship inside the Epic Games app.',
    category: 'Gaming',
    source: 'PixelPress',
    author: 'Ravi Menon',
    tags: ['Epic Games', 'Android', 'app stores'],
    daysAgo: 14,
    lead: [
      'Epic Games expanded a program that lets other app marketplaces distribute themselves through the Epic Games Store on Android.',
      'The move builds on regulatory decisions in several markets that require large platform owners to allow competing stores.',
    ],
  },
  {
    title: 'A robotics company raises $250M to build general-purpose warehouse arms',
    excerpt: 'The round values the company in the billions as it moves from pilots to multi-site deployments.',
    category: 'Startups',
    source: 'Runway',
    author: 'Grace Adeyemi',
    tags: ['funding', 'robotics', 'logistics'],
    trending: true,
    daysAgo: 11,
    lead: [
      'A robotics startup building general-purpose picking arms for warehouses raised $250 million, saying several large retailers had moved from pilots to committed rollouts.',
      'The company trains a single model across many tasks rather than programming each station, an approach it says shortens deployment from months to weeks.',
    ],
  },
  {
    title: 'Google Cloud and a chip startup partner on an open accelerator interconnect',
    excerpt: 'The specification aims to let accelerators from different vendors share memory coherently.',
    category: 'Cloud',
    source: 'The Grid',
    author: 'Elliot Sarraf',
    tags: ['Google Cloud', 'accelerators', 'open standards'],
    daysAgo: 15,
    lead: [
      'Google Cloud and a semiconductor startup published a draft specification for a coherent interconnect that would let accelerators from multiple vendors share memory in the same system.',
      'The effort is positioned as an open alternative to proprietary interconnects that lock customers to a single accelerator supplier.',
    ],
  },
  {
    title: 'Fusion startup reports net energy gain sustained for five seconds',
    excerpt: 'The result, not yet peer reviewed, would be a step change in how long a reaction can be held.',
    category: 'Science',
    source: 'Lab Notes',
    author: 'Dr. Teodora Ilic',
    tags: ['fusion', 'energy', 'research'],
    trending: true,
    daysAgo: 12,
    lead: [
      'A private fusion company said it had sustained a reaction producing more energy than was delivered to the plasma for about five seconds, far longer than prior demonstrations.',
      'The claim has not been peer reviewed. Outside physicists said the reported duration, if confirmed, would be significant, while cautioning that a power plant remains years away.',
    ],
  },
  {
    title: 'Apple opens its Vision platform to background spatial apps and wider hand tracking',
    excerpt: 'Developers can now run persistent spatial widgets and access a lower-latency hand-tracking API.',
    category: 'Apple',
    source: 'TechPulse Wire',
    author: 'Priya Nandakumar',
    tags: ['Apple', 'Vision', 'AR', 'developers'],
    daysAgo: 16,
    lead: [
      'Apple updated its Vision platform with support for spatial apps that persist in a user\'s environment and a hand-tracking API with lower latency.',
      'The changes address two of the most common developer complaints since the headset launched.',
    ],
  },
  {
    title: 'Microsoft brings a local small-model runtime to Windows for offline Copilot features',
    excerpt: 'Summarization, rewriting and search will work without a network connection on capable PCs.',
    category: 'Microsoft',
    source: 'Redmond Report',
    author: 'Hannah Beckley',
    tags: ['Microsoft', 'Windows', 'on-device AI'],
    daysAgo: 17,
    lead: [
      'Microsoft added a runtime to Windows that runs small language models locally, enabling a subset of Copilot features to work offline on PCs with enough memory and a capable NPU.',
      'The company says text stays on the device for those features and that developers can target the same runtime from their apps.',
    ],
  },
  {
    title: 'A supply-chain attack hijacks a popular npm package to steal cloud credentials',
    excerpt: 'The malicious version was live for roughly six hours and pulled tokens from CI environments.',
    category: 'Cybersecurity',
    source: 'ThreatLine',
    author: 'Owen Castellano',
    tags: ['supply chain', 'npm', 'CI/CD'],
    trending: true,
    daysAgo: 3,
    updatedAfterHours: 4,
    lead: [
      'Attackers pushed a malicious release of a widely depended-on npm package after compromising a maintainer account, adding code that exfiltrated cloud credentials from continuous integration environments.',
      'The registry pulled the version after about six hours. Teams that ran installs in that window are advised to rotate any credentials exposed to their build pipelines.',
    ],
  },
  {
    title: 'The TypeScript team previews a native-code compiler for large projects',
    excerpt: 'A rewritten compiler core, distributed as a native binary, targets multi-fold speedups on big codebases.',
    category: 'Programming',
    source: 'CompileTime',
    author: 'Sofia Aaltonen',
    tags: ['TypeScript', 'compilers', 'performance'],
    featured: true,
    trending: true,
    daysAgo: 4,
    lead: [
      'The TypeScript team shared an early preview of a compiler core rewritten in a systems language and shipped as a native binary, reporting large speedups on type-checking and build times for big projects.',
      'The team said the language and type system semantics are unchanged and that the existing JavaScript-based compiler will be maintained during a transition period.',
    ],
  },
  {
    title: 'Sony details a cloud-first handheld that streams from a home console',
    excerpt: 'The device has no local game storage and is built around low-latency streaming on a local network or the internet.',
    category: 'Gaming',
    source: 'PixelPress',
    author: 'Ravi Menon',
    tags: ['Sony', 'PlayStation', 'streaming', 'handheld'],
    daysAgo: 18,
    lead: [
      'Sony shared full specifications for a handheld device designed to stream games from a user\'s home console or from its cloud service, with no local game storage.',
      'The company is targeting sub-frame latency on a good home network and has published guidance for internet play.',
    ],
  },
  {
    title: 'A health-records startup raises $90M to standardize patient data with open schemas',
    excerpt: 'The company publishes its data model openly and charges for the pipeline that maps hospital systems onto it.',
    category: 'Startups',
    source: 'Runway',
    author: 'Grace Adeyemi',
    tags: ['funding', 'healthcare', 'data'],
    daysAgo: 13,
    lead: [
      'A startup working on interoperable health records raised $90 million, saying dozens of hospital systems had adopted its open data model.',
      'The company keeps the schema free and open and sells the integration tooling that maps legacy electronic health record systems onto it.',
    ],
  },
  {
    title: 'Oracle and a telecom operator build an edge cloud for private 5G factories',
    excerpt: 'The joint offering puts compute inside industrial sites with a managed private cellular network.',
    category: 'Cloud',
    source: 'The Grid',
    author: 'Elliot Sarraf',
    tags: ['Oracle', 'edge', '5G', 'manufacturing'],
    daysAgo: 19,
    lead: [
      'Oracle and a large telecom operator announced a joint edge-cloud product that places compute hardware inside factories alongside a managed private cellular network.',
      'The pitch targets manufacturers running latency-sensitive automation and machine-vision workloads that they are reluctant to send to a distant region.',
    ],
  },
  {
    title: 'Astronomers map a nearby exoplanet\'s atmosphere in unprecedented detail',
    excerpt: 'Space-telescope spectroscopy revealed clouds, winds and a chemical gradient across the planet\'s face.',
    category: 'Science',
    source: 'Lab Notes',
    author: 'Dr. Teodora Ilic',
    tags: ['astronomy', 'exoplanets', 'space telescope'],
    daysAgo: 20,
    lead: [
      'Astronomers published a detailed atmospheric map of a gas-giant exoplanet a few dozen light-years away, resolving cloud bands, high-altitude winds and a chemical gradient between its day and night sides.',
      'The observations used repeated spectroscopy as the planet rotated, a technique that is becoming routine for the brightest targets.',
    ],
  },
  {
    title: 'AMD releases an open toolchain for programming its AI accelerators',
    excerpt: 'The stack includes a compiler, a kernel library and a profiler, all under a permissive license.',
    category: 'Hardware',
    source: 'SiliconBeat',
    author: 'Marcus Ohaeri',
    tags: ['AMD', 'accelerators', 'open source'],
    daysAgo: 21,
    lead: [
      'AMD published an open-source software stack for its AI accelerators, including a compiler, an optimized kernel library and profiling tools.',
      'The company is betting that an open toolchain will draw developers who have been reluctant to build on a proprietary alternative.',
    ],
  },
  {
    title: 'Google Pixel adds satellite messaging and an offline maps assistant',
    excerpt: 'The features work without a cell connection and are free for the first two years on new devices.',
    category: 'Google',
    source: 'HandsetHQ',
    author: 'Yuki Tanaka',
    tags: ['Google', 'Pixel', 'satellite'],
    daysAgo: 6,
    lead: [
      'Google added two-way satellite messaging to its Pixel phones along with an offline navigation assistant that can answer routing questions without a data connection.',
      'The satellite feature is included at no extra cost for two years on newly purchased devices.',
    ],
  },
  {
    title: 'A browser maker ships built-in local translation using a downloadable model',
    excerpt: 'Full-page translation now runs on the device once a language pack is installed, with nothing sent to a server.',
    category: 'Programming',
    source: 'CompileTime',
    author: 'Sofia Aaltonen',
    tags: ['browsers', 'translation', 'privacy'],
    daysAgo: 22,
    lead: [
      'A major browser vendor enabled on-device full-page translation using downloadable language packs, so translated browsing no longer requires sending page text to a remote service.',
      'The feature is on by default for a handful of language pairs, with more available as optional downloads.',
    ],
  },
  {
    title: 'Ubisoft spins its live-service teams into a separate studio label',
    excerpt: 'The reorganization gives the group its own leadership and release calendar independent of the main lineup.',
    category: 'Gaming',
    source: 'PixelPress',
    author: 'Ravi Menon',
    tags: ['Ubisoft', 'studios', 'live service'],
    daysAgo: 23,
    lead: [
      'Ubisoft carved its live-service development teams into a distinct studio label with separate leadership and its own release schedule.',
      'Executives framed the change as a way to give long-running online titles a dedicated roadmap rather than competing for resources with annual releases.',
    ],
  },
  {
    title: 'An AI-safety nonprofit launches a shared evaluation suite for agent tool use',
    excerpt: 'The open benchmark scores models on whether they take unsafe actions when given real tools in a sandbox.',
    category: 'AI',
    source: 'TechPulse Wire',
    author: 'Dana Whitfield',
    tags: ['AI safety', 'benchmarks', 'agents'],
    daysAgo: 24,
    lead: [
      'A nonprofit focused on AI safety released an open benchmark that puts models in a sandbox with real tools and scores how often they take unsafe or destructive actions.',
      'Several major labs contributed test cases, and the group says it will publish a public leaderboard updated as new models ship.',
    ],
  },
  {
    title: 'A fintech infrastructure startup raises $120M to run instant cross-border payouts',
    excerpt: 'The company settles into local rails in 30 countries and abstracts the differences behind one API.',
    category: 'Startups',
    source: 'Runway',
    author: 'Grace Adeyemi',
    tags: ['funding', 'fintech', 'payments'],
    daysAgo: 14,
    lead: [
      'A payments infrastructure startup raised $120 million to expand a service that pays out to recipients in 30 countries using local settlement rails, exposed through a single API.',
      'Its customers are marketplaces and payroll providers that need to move small amounts to many people quickly.',
    ],
  },
  {
    title: 'Datacenter operators pilot direct-to-chip cooling to cut water use',
    excerpt: 'A consortium published results showing large drops in on-site water consumption versus evaporative systems.',
    category: 'Cloud',
    source: 'The Grid',
    author: 'Elliot Sarraf',
    tags: ['data centers', 'cooling', 'sustainability'],
    daysAgo: 25,
    lead: [
      'A group of data-center operators published pilot results for direct-to-chip liquid cooling, reporting sharp reductions in on-site water use compared with evaporative cooling towers.',
      'Water consumption has become a flashpoint for new data-center construction in dry regions.',
    ],
  },
  {
    title: 'Researchers train a weather model that runs a 10-day forecast in under a minute',
    excerpt: 'The machine-learning system matches leading physics models on several metrics at a fraction of the compute.',
    category: 'AI',
    source: 'Lab Notes',
    author: 'Dr. Teodora Ilic',
    tags: ['weather', 'machine learning', 'climate'],
    trending: true,
    daysAgo: 7,
    lead: [
      'A research team published a machine-learning weather model that produces a 10-day global forecast in under a minute on a single accelerator, matching leading numerical models on several accuracy measures.',
      'National forecasting agencies have started running similar models alongside their physics-based systems.',
    ],
  },
  {
    title: 'Apple and a camera-sensor maker co-develop a stacked sensor for low-light video',
    excerpt: 'The sensor moves processing onto the same die, cutting noise and power on long recordings.',
    category: 'Apple',
    source: 'HandsetHQ',
    author: 'Yuki Tanaka',
    tags: ['Apple', 'cameras', 'iPhone'],
    daysAgo: 15,
    lead: [
      'Apple is co-developing a stacked image sensor that places signal processing on the same die as the pixels, according to supply-chain sources, improving low-light video and reducing power draw.',
      'The sensor is expected to debut in a future iPhone rather than the current generation.',
    ],
  },
  {
    title: 'A major Linux distribution moves to a rolling security-only kernel branch',
    excerpt: 'Users on the stable channel will get continuous kernel security fixes without full version jumps.',
    category: 'Programming',
    source: 'CompileTime',
    author: 'Sofia Aaltonen',
    tags: ['Linux', 'kernel', 'security'],
    daysAgo: 26,
    lead: [
      'A widely used Linux distribution restructured how it ships kernel updates, moving stable-channel users to a branch that receives security fixes continuously without jumping between major versions.',
      'The maintainers say the change reduces the window between a public fix and it reaching users.',
    ],
  },
  {
    title: 'Xbox brings its cloud service to smart TVs from three more manufacturers',
    excerpt: 'The app ships as a native install, no console or streaming stick required.',
    category: 'Gaming',
    source: 'PixelPress',
    author: 'Ravi Menon',
    tags: ['Xbox', 'cloud gaming', 'smart TV'],
    daysAgo: 27,
    lead: [
      'Microsoft expanded its cloud gaming app to smart TVs from three additional manufacturers, shipping as a native application that does not need any extra hardware.',
      'A subscription and a compatible controller are still required.',
    ],
  },
  {
    title: 'An enterprise search startup raises $75M to index internal tools with permissions intact',
    excerpt: 'The product respects each system\'s access controls so results never leak documents a user cannot open.',
    category: 'Startups',
    source: 'Runway',
    author: 'Grace Adeyemi',
    tags: ['funding', 'enterprise', 'search'],
    daysAgo: 16,
    lead: [
      'A startup building unified search across internal company tools raised $75 million, emphasizing that its index mirrors each source system\'s permissions so users only see what they are already allowed to access.',
      'Permission-aware indexing has been a recurring stumbling block for enterprise search products.',
    ],
  },
  {
    title: 'IBM demonstrates error mitigation that extends useful quantum circuit depth',
    excerpt: 'The technique squeezes more reliable operations out of current noisy hardware without full error correction.',
    category: 'Science',
    source: 'Lab Notes',
    author: 'Dr. Teodora Ilic',
    tags: ['IBM', 'quantum', 'research'],
    daysAgo: 28,
    lead: [
      'IBM published results for an error-mitigation method that lets current quantum processors run deeper circuits before noise overwhelms the signal.',
      'It is a stopgap on the road to full error correction, which still requires far more physical qubits than today\'s machines have.',
    ],
  },
  {
    title: 'A carrier launches a low-cost plan that bundles a data-only eSIM for travel',
    excerpt: 'The plan includes a set amount of roaming data across 90 countries with no daily fees.',
    category: 'Mobile',
    source: 'HandsetHQ',
    author: 'Yuki Tanaka',
    tags: ['carriers', 'eSIM', 'travel'],
    daysAgo: 29,
    lead: [
      'A mobile carrier introduced a budget plan that bundles a data-only travel eSIM, offering a fixed pool of roaming data across 90 countries without the per-day charges common on competing plans.',
      'The move follows the rise of standalone travel eSIM apps that have pulled roaming revenue away from carriers.',
    ],
  },
  {
    title: 'Nvidia and a hospital network publish a large open dataset for medical imaging models',
    excerpt: 'The de-identified dataset covers several modalities and comes with a standardized evaluation protocol.',
    category: 'AI',
    source: 'TechPulse Wire',
    author: 'Dana Whitfield',
    tags: ['NVIDIA', 'healthcare', 'datasets'],
    daysAgo: 30,
    lead: [
      'NVIDIA and a large hospital network released a de-identified medical imaging dataset spanning several modalities, along with a fixed evaluation protocol so results from different groups can be compared.',
      'Access requires agreeing to usage terms intended to prevent re-identification attempts.',
    ],
  },
  {
    title: 'A password manager adds device-bound passkeys with encrypted cloud sync',
    excerpt: 'Private keys stay in secure hardware while an encrypted blob syncs across a user\'s devices.',
    category: 'Cybersecurity',
    source: 'ThreatLine',
    author: 'Owen Castellano',
    tags: ['passkeys', 'authentication', 'privacy'],
    daysAgo: 18,
    lead: [
      'A widely used password manager added support for passkeys that are bound to device secure hardware, syncing an encrypted representation across a user\'s devices without exposing the underlying private keys.',
      'The company says it cannot decrypt the synced data and published a specification for others to implement.',
    ],
  },
  {
    title: 'Amazon opens its logistics robotics platform to outside warehouse operators',
    excerpt: 'Third-party fulfillment companies can now lease the same mobile robots Amazon uses internally.',
    category: 'Hardware',
    source: 'SiliconBeat',
    author: 'Marcus Ohaeri',
    tags: ['Amazon', 'robotics', 'logistics'],
    daysAgo: 31,
    lead: [
      'Amazon began offering its warehouse robotics platform to outside fulfillment operators, letting them lease the mobile robots and fleet-management software the company runs in its own facilities.',
      'It is an early step toward turning an internal capability into a standalone business line.',
    ],
  },
  {
    title: 'A game studio open-sources its in-house engine after shipping its final title on it',
    excerpt: 'The MIT-licensed release includes the editor, renderer and the studio\'s asset pipeline.',
    category: 'Gaming',
    source: 'PixelPress',
    author: 'Ravi Menon',
    tags: ['game engines', 'open source', 'tools'],
    daysAgo: 32,
    lead: [
      'An independent game studio open-sourced the engine it built over more than a decade, releasing the editor, renderer and asset pipeline under a permissive license after shipping what it says is the last game it will build on the technology.',
      'The studio is moving future projects to a commercial engine and says maintaining its own was no longer worth the cost.',
    ],
  },
  {
    title: 'Startups scramble as a popular vector database changes its open-source license',
    excerpt: 'The vendor moved to a source-available license, prompting a community fork within days.',
    category: 'Startups',
    source: 'Runway',
    author: 'Grace Adeyemi',
    tags: ['open source', 'databases', 'licensing'],
    trending: true,
    daysAgo: 5,
    lead: [
      'A widely adopted vector database company relicensed its core product under a source-available license that restricts hosting it as a competing service, echoing similar moves by other infrastructure vendors.',
      'A group of contributors and companies announced a fork under the original license within days.',
    ],
  },
  {
    title: 'Researchers show a cheap sensor that detects methane leaks from a moving vehicle',
    excerpt: 'The open-hardware design maps neighborhood-scale emissions at a fraction of the cost of aircraft surveys.',
    category: 'Science',
    source: 'Lab Notes',
    author: 'Dr. Teodora Ilic',
    tags: ['climate', 'sensors', 'open hardware'],
    daysAgo: 33,
    lead: [
      'A research group published an open-hardware methane sensor that can be mounted on a car to map leaks across a neighborhood, at a small fraction of the cost of the aircraft and satellite surveys used today.',
      'The team is sharing the design files and calibration procedure so cities and utilities can build their own units.',
    ],
  },
  {
    title: 'Microsoft and a chip designer detail a custom security processor for Azure servers',
    excerpt: 'The processor roots every server\'s boot chain and manages keys independently of the main CPU.',
    category: 'Microsoft',
    source: 'Redmond Report',
    author: 'Hannah Beckley',
    tags: ['Microsoft', 'Azure', 'security', 'silicon'],
    daysAgo: 34,
    lead: [
      'Microsoft and a semiconductor partner described a custom security processor now going into Azure servers, which anchors the boot chain and handles cryptographic keys separately from the main CPU.',
      'The company says the design lets it verify server firmware integrity continuously rather than only at startup.',
    ],
  },

  // ── World (general / non-tech headlines) ───────────────────────────────────
  {
    title: 'Glacial lake outburst triggers deadly flash flood in Himalayan valley',
    excerpt: 'Officials say a collapsed ice dam sent a wall of water down the valley overnight, with hundreds still unaccounted for.',
    category: 'World',
    source: 'Global Desk',
    author: 'Global Desk',
    tags: ['climate', 'disaster', 'Himalayas'],
    trending: true,
    daysAgo: 0,
    updatedAfterHours: 4,
    lead: [
      'A sudden glacial lake outburst flood swept through a mountain valley overnight, destroying bridges and homes and cutting off several villages, disaster-management officials said.',
      'Rescue teams backed by helicopters were searching for hundreds of people still missing, many of them seasonal workers and trekkers. Scientists have warned for years that warming is making such outburst floods more frequent across high-mountain Asia.',
    ],
  },
  {
    title: 'Ceasefire holds into a second week as aid convoys reach the worst-hit areas',
    excerpt: 'Mediators say both sides are observing the truce, allowing the first large-scale deliveries of food and medicine in months.',
    category: 'World',
    source: 'Global Desk',
    author: 'Global Desk',
    tags: ['diplomacy', 'humanitarian'],
    daysAgo: 2,
    lead: [
      'A negotiated ceasefire entered its second week, with international monitors reporting no major violations and humanitarian agencies moving convoys into areas that had been cut off for months.',
      'Talks on a longer-term settlement are due to resume, though officials cautioned that the hardest political questions remain unresolved.',
    ],
  },
  {
    title: 'Record-breaking heatwave strains power grids across three continents',
    excerpt: 'Utilities imposed rolling blackouts as demand for cooling hit all-time highs and several regions topped 45°C.',
    category: 'World',
    source: 'Global Desk',
    author: 'Global Desk',
    tags: ['climate', 'energy', 'heatwave'],
    trending: true,
    daysAgo: 3,
    lead: [
      'A prolonged heatwave pushed electricity demand to record levels, forcing utilities in several countries to impose rolling blackouts to protect their grids.',
      'Meteorological agencies linked the severity and duration of the event to a warming climate, and hospitals reported a sharp rise in heat-related admissions.',
    ],
  },
  {
    title: 'Voters head to the polls in a closely watched national election',
    excerpt: 'Turnout appeared high in early hours as the two main blocs made final appeals over the economy and immigration.',
    category: 'World',
    source: 'Global Desk',
    author: 'Global Desk',
    tags: ['election', 'politics'],
    daysAgo: 4,
    lead: [
      'Polls opened in a national election widely seen as too close to call, with the economy, the cost of living and immigration dominating the campaign.',
      'Observers from regional bodies were deployed across the country; results are expected the following morning.',
    ],
  },
  {
    title: 'Cross-border rail link reopens after a decade, cutting a two-day journey to six hours',
    excerpt: 'The restored line is expected to carry freight and passengers between two capitals that have slowly rebuilt ties.',
    category: 'World',
    source: 'Global Desk',
    author: 'Global Desk',
    tags: ['infrastructure', 'trade'],
    daysAgo: 9,
    lead: [
      'A cross-border railway that had been closed for a decade reopened after a joint reconstruction effort, reconnecting two capital cities by a six-hour trip that previously took two days by road.',
      'Officials framed the reopening as a confidence-building step, with plans to add daily passenger services and expand freight capacity next year.',
    ],
  },
];

export const RAW_ARTICLES: Article[] = SEEDS.map((seed, i) => buildArticle(seed, i + 1));
