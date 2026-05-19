/**
 * Timeless Wardrobe — frozen catalogue seed (offline fallback + dev).
 *
 * Frozen from Supabase wardrobe_items on 2026-05-19T16:13:59.642Z.
 * Regenerate: npm run db:freeze-catalogue
 *
 * Collection thesis is described in the site header. Each row uses `category` (and optional
 * `season`) for browsing; `section` / `pillar` are legacy fields and not shown in the UI.
 *
 * Images: local files under `/images/wardrobe/` (backed up from Supabase Storage).
 * Optional `gallery`: string[] of extra image URLs; `image` is always the cover.
 * Optional `colourVariants`: same product in multiple colours — one collection row.
 * Optional `size`, `measuredDimensions`, and `purchaseDate`.
 */

const WARDROBE_ITEMS = [
  {
    "id": "navy-double-breasted-blazer",
    "category": "Jackets",
    "brand": "Acme Cultum",
    "name": "Navy Double-Breasted  Blazer",
    "season": "A/W",
    "colour": "Navy",
    "colourCode": "#20232D",
    "fabric": "Super 120s Wool",
    "weight": "265 gsm",
    "size": "56C",
    "purchaseDate": "2024-11-06",
    "image": "/images/wardrobe/navy-double-breasted-blazer/main/cover.png",
    "gallery": [
      "/images/wardrobe/navy-double-breasted-blazer/main/gallery/01.jpg"
    ],
    "metadata": {
      "price": 1284.65,
      "priceCurrency": "CNY"
    }
  },

  {
    "id": "tassel-loafer",
    "category": "Footwear",
    "brand": "Alden",
    "name": "Tassel Loafer",
    "season": "All-season",
    "colour": "Color 8",
    "colourCode": "#492C2E",
    "fabric": "Horween shell cordovan",
    "weight": "563",
    "size": "US 10.5 E",
    "purchaseDate": "2023-01-19",
    "image": "/images/wardrobe/tassel-loafer/main/cover.png",
    "gallery": [
      "/images/wardrobe/tassel-loafer/main/gallery/01.png"
    ],
    "notes": "Sole: Single oak leather outsole \nLast: Aberdeen",
    "metadata": {
      "price": 200,
      "basicColour": "red",
      "priceCurrency": "USD"
    }
  },

  {
    "id": "sage-beaufort-waxed-jacket",
    "category": "Outerwear",
    "brand": "Barbour",
    "name": "Sage Beaufort Waxed Jacket",
    "season": "A/W",
    "colour": "Sage",
    "colourCode": "40403C",
    "fabric": "Waxed cotton",
    "size": "44",
    "purchaseDate": "2025-08-01",
    "image": "/images/wardrobe/sage-beaufort-waxed-jacket/main/cover.png",
    "gallery": [
      "/images/wardrobe/sage-beaufort-waxed-jacket/main/gallery/01.jpg",
      "/images/wardrobe/sage-beaufort-waxed-jacket/main/gallery/02.jpg",
      "/images/wardrobe/sage-beaufort-waxed-jacket/main/gallery/03.jpg"
    ],
    "metadata": {
      "price": 43200,
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "curb-bracelet",
    "category": "Jewellery",
    "brand": "Bespoke",
    "name": "Curb Bracelet",
    "season": "All-season",
    "colour": "Gold",
    "colourCode": "#D6C082",
    "weight": "18ct yellow gold, 5.2 mm",
    "size": "20.5 cm （8.07inches）",
    "purchaseDate": "2024-10-26",
    "image": "/images/wardrobe/curb-bracelet/1778704222719-cover-edit.png",
    "gallery": [
      "/images/wardrobe/curb-bracelet/main/gallery/01.jpg",
      "/images/wardrobe/curb-bracelet/main/gallery/01.png"
    ],
    "notes": "Size: 20.5 cm （8.07inches）\nWeight: 11.71 g\nGold price: 596 CNY/g (base: 472, +45% vs 2020)\nMaking: 124 CNY/g\nTotal: 6,973 CNY ≈ 31,200 TWD (2024)\nDate: 26 October 2024",
    "metadata": {
      "price": 31200,
      "priceCurrency": "TWD"
    }
  },

  {
    "id": "rolo-chain",
    "category": "Jewellery",
    "brand": "Bespoke",
    "name": "Rolo Chain",
    "season": "All-season",
    "colour": "18ct yellow gold, 2.5 mm",
    "colourCode": "#D6C082",
    "size": "50 cm",
    "purchaseDate": "2024-08-20",
    "image": "/images/wardrobe/rolo-chain/1778704232768-cover-edit.png",
    "gallery": [
      "/images/wardrobe/rolo-chain/main/gallery/01.jpg"
    ],
    "notes": "Size: 50 cm\nWeight: 9.29 g\nGold price: 514 CNY/g (base: 431, +25% vs 2020)\nMaking: 83 CNY/g\nTotal: 4,778 CNY ≈ 21,400 TWD (2024)\n\u001aDate: 20 August 2024",
    "metadata": {
      "price": 21400,
      "basicColour": "gold",
      "priceCurrency": "TWD"
    }
  },

  {
    "id": "ruby-gypsy-ring",
    "category": "Jewellery",
    "brand": "Bespoke",
    "name": "Ruby Gypsy Ring",
    "season": "All-season",
    "colour": "Gold",
    "colourCode": "#D6C082",
    "fabric": "18K",
    "weight": "18ct yellow gold with Diamonds, 6.8 mm face, 3 mm shank",
    "size": "HK 22",
    "purchaseDate": "2024-08-04",
    "image": "/images/wardrobe/ruby-gypsy-ring/1778698277222-cover-edit.png",
    "gallery": [
      "/images/wardrobe/ruby-gypsy-ring/main/gallery/01.jpg"
    ],
    "notes": "Size: HK 22 (2024-10-10; adjusted to 22.5–23 on 2026-04-07)\nWeight: 8.20 g (total, including stones)     Gold price: 604 CNY/g (base 450, +47% vs 2020)\nRuby: 3 × 4 mm (~0.2 ct)\nDiamonds: 2.3 mm × 2 (total ~0.1 ct)\nMaking: 154 CNY/g\nTotal: 5,057 CNY ≈ 22,600 TWD (2024)\nDate: 4 October 2024\n\nEngraving\nInscription: Ad Meliora . 2024\n￼\n\nReference: A gold ring inset with a single turquoise, inscribed Rumpenheim, 1843",
    "metadata": {
      "price": 22600,
      "basicColour": "gold",
      "priceCurrency": "TWD",
      "secondaryColour": "Pigeon's Blood Ruby",
      "secondaryColourCode": "#7C0A02"
    }
  },

  {
    "id": "signet-ring",
    "category": "Jewellery",
    "brand": "Bespoke",
    "name": "Signet Ring",
    "season": "All-season",
    "colour": "Gold",
    "colourCode": "#D6C082",
    "weight": "18ct yellow gold, 12 × 14 mm",
    "size": "HK 14",
    "purchaseDate": "2020-11-01",
    "image": "/images/wardrobe/signet-ring/1778698092039-cover-edit.png",
    "gallery": [
      "/images/wardrobe/signet-ring/main/gallery/01.jpg",
      "/images/wardrobe/signet-ring/main/gallery/01.png",
      "/images/wardrobe/signet-ring/main/gallery/02.jpg"
    ],
    "notes": "Size: HK 14 (2020-11-20; confirmed 2026-04-07)\nWeight: 9.6 g (actual)     Gold price: 411 CNY/g (base: 385 CNY/g)\nMaking: 78 CNY/g\nTotal: 4,698 CNY ≈ 20,000 TWD (2020)\nDate: 1 November 2020\n\nEngraving: Victorian interlaced monogram (TYL)",
    "metadata": {
      "price": 20000,
      "priceCurrency": "TWD"
    }
  },

  {
    "id": "golden-fleece-navy-blazer",
    "category": "Jackets",
    "brand": "Brooks Brothers",
    "name": "Golden Fleece Navy Blazer",
    "season": "A/W",
    "colour": "Navy",
    "colourCode": "#1B1C26",
    "fabric": "Twill",
    "weight": "300 gsm",
    "size": "46R",
    "purchaseDate": "2025-02-01",
    "image": "/images/wardrobe/golden-fleece-navy-blazer/1778693552701-cover-edit.png",
    "gallery": [
      "/images/wardrobe/golden-fleece-navy-blazer/main/gallery/01.png"
    ],
    "metadata": {
      "price": 55,
      "priceCurrency": "USD"
    }
  },

  {
    "id": "houndstooth-tweed-jacket",
    "category": "Jackets",
    "brand": "Brooks Brothers",
    "name": "Houndstooth Tweed Jacket",
    "season": "A/W",
    "colour": "Camel",
    "colourCode": "#998573",
    "fabric": "Tweed",
    "weight": "~450 gsm",
    "size": "46R",
    "purchaseDate": "2025-03-09",
    "image": "/images/wardrobe/houndstooth-tweed-jacket/main/cover.png",
    "gallery": [
      "/images/wardrobe/houndstooth-tweed-jacket/main/gallery/01.jpg",
      "/images/wardrobe/houndstooth-tweed-jacket/main/gallery/02.jpg",
      "/images/wardrobe/houndstooth-tweed-jacket/main/gallery/03.jpg",
      "/images/wardrobe/houndstooth-tweed-jacket/main/gallery/04.jpg",
      "/images/wardrobe/houndstooth-tweed-jacket/main/gallery/05.jpg"
    ],
    "metadata": {
      "price": 79.99,
      "priceCurrency": "USD"
    }
  },

  {
    "id": "balmacaan-coat",
    "category": "Outerwear",
    "brand": "Burberrys",
    "name": "Balmacaan Coat",
    "season": "A/W",
    "colour": "Stone Beige",
    "colourCode": "#dbd3c7",
    "weight": "Single-Breasted",
    "size": "42R",
    "purchaseDate": "2020-12-06",
    "image": "/images/wardrobe/balmacaan-coat/main/cover.png",
    "gallery": [
      "/images/wardrobe/balmacaan-coat/main/gallery/01.png",
      "/images/wardrobe/balmacaan-coat/main/gallery/02.png",
      "/images/wardrobe/balmacaan-coat/main/gallery/01.jpg"
    ],
    "metadata": {
      "price": 83.99,
      "priceCurrency": "USD"
    }
  },

  {
    "id": "tank-solo",
    "category": "Dress watch",
    "brand": "Cartier",
    "name": "Tank Solo",
    "season": "All-season",
    "colour": "Gold",
    "colourCode": "D6C082",
    "weight": "W5200004",
    "size": "Large Model",
    "purchaseDate": "2024-11-03",
    "image": "/images/wardrobe/tank-solo/main/cover.png",
    "gallery": [
      "/images/wardrobe/tank-solo/main/gallery/01.jpg"
    ],
    "notes": "Reference: W5200004\nMovement: Cartier Cal. 690 quartz\nCase: 34.8 × 27.4 mm, 18ct yellow gold with alloyed steel case back\nThickness: 5.55 mm\nLugs: 17 mm\nCrown: Beaded crown set with blue synthetic spinel cabochon\nDial: Clear silvered opaline dial, Roman numerals\nHands: Blued-steel sword-shaped hands\nCrystal: Square sapphire crystal\nStrap: Brown square-scale alligator leather\nBuckle: 18ct yellow gold ardillon buckle\nWater Resistance: 3 bar (30 m)\n\nNotes:\nDesigned by Louis Cartier in 1917, the Tank remains one of the purest expressions of modern watch design, defined by geometry, restraint, and exact proportion. In continuous production for over a century, it has remained unmistakable while giving rise to later interpretations including Tank Cintrée, Chinoise, Américaine, and Française. The blue spinel cabochon crown, Roman numerals, and blued-steel hands preserve Cartier’s original design language. At only 5.55 mm thick, it retains the ultra-thin elegance expected of a true dress watch. As the only solid-gold watch in this collection, the Tank serves as its aesthetic anchor—not a variation, but one of the original canonical forms of twentieth-century design.",
    "metadata": {
      "price": 100000,
      "basicColour": "gold",
      "priceCurrency": "TWD",
      "secondaryColour": "Brown Aligator Strap",
      "secondaryColourCode": "9A4B17"
    }
  },

  {
    "id": "achilles-low",
    "category": "Footwear",
    "brand": "Common Projects",
    "name": "Achilles Low",
    "season": "All-season",
    "colour": "White",
    "colourCode": "#f1f1ee",
    "fabric": "Leather",
    "size": "EU 45",
    "purchaseDate": "2025-11-28",
    "image": "/images/wardrobe/achilles-low/1778704429485-cover-edit.png",
    "gallery": [
      "/images/wardrobe/achilles-low/main/gallery/01.webp"
    ],
    "notes": "Margom cup sole. Date: 28 Nov 2025.",
    "metadata": {
      "price": 374.85,
      "priceCurrency": "CNY"
    }
  },

  {
    "id": "chukka",
    "category": "Footwear",
    "brand": "Crockett & Jones",
    "name": "Chukka",
    "season": "All-season",
    "colour": "Snuff",
    "colourCode": "#743E1C",
    "fabric": "Repello suede",
    "size": "UK 10 D",
    "purchaseDate": "2023-01-29",
    "image": "/images/wardrobe/chukka/1778697977522-cover-edit.png",
    "gallery": [
      "/images/wardrobe/chukka/main/gallery/01.jpg"
    ],
    "notes": "Unlined ankle boot; Scotch-guard treated\nSole: single leather\nLast: 200",
    "metadata": {
      "price": 161.44,
      "basicColour": "brown",
      "priceCurrency": "USD"
    }
  },

  {
    "id": "pembroke",
    "category": "Footwear",
    "brand": "Crockett & Jones",
    "name": "Pembroke",
    "season": "All-season",
    "colour": "Tan",
    "colourCode": "#a3480e",
    "fabric": "Scotch grain calf",
    "size": "UK 10 E",
    "purchaseDate": "2020-10-26",
    "image": "/images/wardrobe/pembroke/1778698000508-cover-edit.png",
    "gallery": [
      "/images/wardrobe/pembroke/main/gallery/01.jpg"
    ],
    "notes": "Type: Full brogue country derby, wing-tip with full punching. Sole: Dainite rubber. Last: 325. Date: 27 Oct 2020.",
    "metadata": {
      "price": 201.75,
      "basicColour": "brown",
      "priceCurrency": "USD"
    }
  },

  {
    "id": "kingsman-0847-sunglasses",
    "category": "Eyewear",
    "brand": "Cutler and Gross",
    "name": "Kingsman 0847 Sunglasses",
    "season": "All-season",
    "colour": "Black, Brown Lenses",
    "purchaseDate": "2023-11-27",
    "image": "/images/wardrobe/kingsman-0847-sunglasses/main/cover.png",
    "gallery": [
      "/images/wardrobe/kingsman-0847-sunglasses/main/gallery/01.png",
      "/images/wardrobe/kingsman-0847-sunglasses/main/gallery/02.png"
    ],
    "metadata": {
      "price": 177.99,
      "basicColour": "black",
      "priceCurrency": "CNY"
    }
  },

  {
    "id": "sapphire-ring",
    "category": "Jewellery",
    "brand": "Future Piece",
    "name": "Sapphire Ring",
    "season": "All-season",
    "colour": "Platinum",
    "colourCode": "#e8e8e8",
    "fabric": "Platinum",
    "image": "/images/wardrobe/sapphire-ring/main/cover.png",
    "gallery": [
      "/images/wardrobe/sapphire-ring/main/gallery/01.png"
    ],
    "notes": "Sapphire: 8 × 6 mm (1.3 - 1.5 ct)\nHue: Light cornflower blue (矢車菊藍)\n\nReference: Garrard 1735 sapphire ring",
    "metadata": {
      "secondaryColour": "Sapphire",
      "secondaryColourCode": "#384D87"
    }
  },

  {
    "id": "wedding-bands",
    "category": "Jewellery",
    "brand": "Future Piece",
    "name": "Wedding Bands",
    "season": "All-season",
    "colour": "Gold",
    "colourCode": "#D6C082",
    "fabric": "Pt950 1.8 mm (bride) / 18ct YG 2 mm size 13 (groom)",
    "image": "/images/wardrobe/wedding-bands/1778704141467-cover-edit.png",
    "notes": "Inscription: spouse name · date (e.g. Edward · 29 Mai). Worn at base when stacked. Reference: bands of Prince Edward Duke of Kent (1767–1820) and Princess Victoria Duchess of Kent (1786–1861).",
    "metadata": {
      "basicColour": "gold"
    }
  },

  {
    "id": "dw-5600",
    "category": "Beater",
    "brand": "G-Shock",
    "name": "DW-5600",
    "season": "All-season",
    "purchaseDate": "2020-04-09",
    "image": "/images/wardrobe/dw-5600/main/cover.png",
    "gallery": [
      "/images/wardrobe/dw-5600/main/gallery/01.jpg"
    ],
    "metadata": {
      "price": 1479,
      "basicColour": "black",
      "priceCurrency": "TWD"
    }
  },

  {
    "id": "cable-knit-polo",
    "category": "Shirts",
    "brand": "Gu",
    "name": "Cable-Knit Polo",
    "season": "S/S",
    "colour": "Wine (White Striped Trim)",
    "colourCode": "#451e2b",
    "fabric": "53% Cotton, 47% Acrylic",
    "size": "XL",
    "purchaseDate": "2025-07-15",
    "image": "/images/wardrobe/cable-knit-polo/main/cover.png",
    "gallery": [
      "/images/wardrobe/cable-knit-polo/main/gallery/01.jpg"
    ],
    "metadata": {
      "price": 1990,
      "basicColour": "red",
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "wide-straight-trousers",
    "category": "Bottoms",
    "brand": "Gu",
    "name": "Wide-Straight Trousers",
    "season": "All-season",
    "colour": "Tan",
    "colourCode": "#8A7C6F",
    "fabric": "Poly blend",
    "weight": "Crease front",
    "size": "XL",
    "purchaseDate": "2025-08-11 · Taupe",
    "image": "/images/wardrobe/wide-straight-trousers/1778703733818-cover-edit.png",
    "gallery": [
      "/images/wardrobe/wide-straight-trousers/main/gallery/01.avif"
    ],
    "notes": "ワイドスラックス+EC(丈長め78.5cm)",
    "metadata": {
      "price": 2990,
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "hole-knit-polo-shirt",
    "category": "Shirts",
    "brand": "H&M",
    "name": "Hole-Knit Polo Shirt",
    "season": "S/S",
    "colour": "Oatmeal Beige",
    "colourCode": "#D6C6B4",
    "fabric": "Knit",
    "size": "XL",
    "purchaseDate": "2025-07-28",
    "image": "/images/wardrobe/hole-knit-polo-shirt/1778703469914-cover-edit.png",
    "gallery": [
      "/images/wardrobe/hole-knit-polo-shirt/main/gallery/01.webp"
    ],
    "metadata": {
      "price": 2499,
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "linen-pleated-shorts",
    "category": "Bottoms",
    "brand": "H&M",
    "name": "Linen Pleated Shorts",
    "season": "S/S",
    "colour": "Ecru",
    "colourCode": "#E2DDD1",
    "fabric": "Linen",
    "size": "XL",
    "purchaseDate": "2025-07-29",
    "image": "/images/wardrobe/linen-pleated-shorts/1778703351069-cover-edit.png",
    "gallery": [
      "/images/wardrobe/linen-pleated-shorts/main/gallery/01.png"
    ],
    "metadata": {
      "price": 3600,
      "basicColour": "white",
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "striped-camp-collar-shirt",
    "category": "Shirts",
    "brand": "H&M",
    "name": "Striped Camp Collar Shirt",
    "season": "S/S",
    "colour": "Oatmeal/Striped",
    "colourCode": "#cdc5bc",
    "size": "XL",
    "purchaseDate": "2025-08-01",
    "image": "/images/wardrobe/striped-camp-collar-shirt/1778703504683-cover-edit.png",
    "gallery": [
      "/images/wardrobe/striped-camp-collar-shirt/main/gallery/01.webp",
      "/images/wardrobe/striped-camp-collar-shirt/main/gallery/02.webp",
      "/images/wardrobe/striped-camp-collar-shirt/main/gallery/03.webp"
    ],
    "notes": "Regular Fit Textured resort shirt",
    "metadata": {
      "price": 2499,
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "herringbone-tweed-jacket",
    "category": "Jackets",
    "brand": "J. Press",
    "name": "Herringbone Tweed Jacket",
    "season": "A/W",
    "colour": "Grey",
    "colourCode": "#c2bfbb",
    "fabric": "Tweed",
    "weight": "~480 gsm",
    "size": "46R",
    "purchaseDate": "2025-01-13",
    "image": "/images/wardrobe/herringbone-tweed-jacket/main/cover.png",
    "gallery": [
      "/images/wardrobe/herringbone-tweed-jacket/main/gallery/01.png"
    ],
    "metadata": {
      "price": 175,
      "priceCurrency": "USD"
    }
  },

  {
    "id": "smoke-olive-acetate-optical",
    "category": "Eyewear",
    "brand": "Klassic.",
    "name": "Smoke Olive Acetate Optical",
    "season": "All-season",
    "colour": "Smoke Olive",
    "colourCode": "#555425",
    "weight": "M141",
    "purchaseDate": "2024-08-15",
    "image": "/images/wardrobe/smoke-olive-acetate-optical/main/cover.png",
    "gallery": [
      "/images/wardrobe/smoke-olive-acetate-optical/main/gallery/01.jpg",
      "/images/wardrobe/smoke-olive-acetate-optical/main/gallery/02.jpg"
    ],
    "metadata": {
      "price": 990,
      "basicColour": "green",
      "priceCurrency": "TWD"
    }
  },

  {
    "id": "corduroy-trousers",
    "category": "Bottoms",
    "brand": "L.L.Bean",
    "name": "Corduroy Trousers",
    "season": "A/W",
    "colour": "Dark Khaki",
    "colourCode": "#c6ac88",
    "fabric": "Corduroy",
    "size": "38 x 30 inch",
    "purchaseDate": "2025-01-01",
    "image": "/images/wardrobe/corduroy-trousers/main/cover.png",
    "gallery": [
      "/images/wardrobe/corduroy-trousers/main/gallery/01.jpg"
    ],
    "metadata": {
      "price": 11000,
      "basicColour": "brown",
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "grand-soir",
    "category": "Evening",
    "brand": "Maison Francis Kurkdjian",
    "name": "Grand Soir",
    "season": "All-season",
    "colour": "Gold",
    "colourCode": "#D6C082",
    "weight": "Labdanum, benzoin, vanilla, amber",
    "size": "70 ml",
    "purchaseDate": "2025-08-01",
    "image": "/images/wardrobe/grand-soir/main/cover.png",
    "gallery": [
      "/images/wardrobe/grand-soir/main/gallery/01.jpg"
    ],
    "metadata": {
      "price": 22000,
      "basicColour": "__omit__",
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "aran-cable-knit-jumper",
    "category": "Mid Layer",
    "brand": "Muji",
    "name": "Aran Cable-Knit Jumper",
    "season": "A/W",
    "colour": "Mushroom Taupe",
    "colourCode": "B2A9A5",
    "fabric": "Wool",
    "weight": "Heavy",
    "size": "XL",
    "purchaseDate": "2024-12-27",
    "image": "/images/wardrobe/aran-cable-knit-jumper/main/cover.png",
    "gallery": [
      "/images/wardrobe/aran-cable-knit-jumper/main/gallery/01.png"
    ],
    "metadata": {
      "price": 7990,
      "basicColour": "beige",
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "fine-knit-t-shirt",
    "category": "Shirts",
    "brand": "Muji",
    "name": "Fine Knit T-Shirt",
    "season": "S/S",
    "colour": "Slate Blue",
    "colourCode": "#606a72",
    "fabric": "Knit",
    "weight": "Lightweight",
    "size": "XL",
    "measuredDimensions": "Measurements: XL\t72.0cm\t48.0cm\t120.0cm\t118.0cm\t53.0cm\t27.5cm\t51.5cm\t106.0cm\t60.0cm\t59.0cm cm",
    "purchaseDate": "2025-04-07",
    "image": "/images/wardrobe/fine-knit-t-shirt/main/cover.png",
    "gallery": [
      "/images/wardrobe/fine-knit-t-shirt/main/gallery/01.jpg"
    ],
    "notes": "* Lightweight hemp-blend knit with a dry, breathable hand feel.\n* Knitted from twisted hemp and polyester yarns for improved washability, shape retention, and reduced surface fuzz.\n* Garment-washed to preserve the natural texture of hemp while achieving 90%+ UV protection.\n* Relaxed crew-neck silhouette, suitable for wearing alone or layered over a T-shirt.\n* Slightly sheer, lightweight fabric with an easy, relaxed fit.",
    "metadata": {
      "price": 1990,
      "priceCurrency": "JPY",
      "measurementRows": [
        {
          "label": "Measurements",
          "value": "XL\t72.0cm\t48.0cm\t120.0cm\t118.0cm\t53.0cm\t27.5cm\t51.5cm\t106.0cm\t60.0cm\t59.0cm"
        }
      ]
    }
  },

  {
    "id": "v-neck-cardigan",
    "category": "Mid Layer",
    "brand": "Muji",
    "name": "V-Neck Cardigan",
    "season": "A/W",
    "colour": "Navy",
    "colourCode": "#19202c",
    "fabric": "High-Gauge Wool",
    "weight": "Lightweight",
    "size": "XL",
    "purchaseDate": "2024-12-17",
    "image": "/images/wardrobe/v-neck-cardigan/main/cover.png",
    "gallery": [
      "/images/wardrobe/v-neck-cardigan/main/gallery/01.jpg",
      "/images/wardrobe/v-neck-cardigan/main/gallery/02.webp"
    ],
    "notes": "紳士　洗えるウールハイゲージＶネックカーディガン紳士ＸＬ・ダークネイビー",
    "metadata": {
      "price": 4990,
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "wide-leg-jeans",
    "category": "Bottoms",
    "brand": "Muji",
    "name": "Wide-Leg Jeans",
    "season": "All-season",
    "colour": "Cream",
    "colourCode": "#ebe6d5",
    "fabric": "Kapok, Cotton",
    "size": "XL",
    "purchaseDate": "2025-04-21",
    "image": "/images/wardrobe/wide-leg-jeans/main/cover.png",
    "gallery": [
      "/images/wardrobe/wide-leg-jeans/main/gallery/01.jpg"
    ],
    "notes": "木の実から作ったカポック混キャンバスワイドパンツ\nカラー：生成\nサイズ：紳士ＸＬ\n商品番号：84218460",
    "metadata": {
      "price": 4990,
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "new-york",
    "category": "Day",
    "brand": "Nicolaï",
    "name": "New York",
    "season": "All-season",
    "colour": "Gold",
    "colourCode": "#BFA665",
    "weight": "Bergamot, black pepper, oak moss.",
    "size": "100 ml",
    "purchaseDate": "2025-08-02",
    "image": "/images/wardrobe/new-york/1778704154934-cover-edit.png",
    "gallery": [
      "/images/wardrobe/new-york/main/gallery/01.png"
    ],
    "metadata": {
      "price": 23000,
      "basicColour": "__omit__",
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "ferret",
    "category": "Footwear",
    "brand": "Paraboot",
    "name": "Ferret",
    "season": "S/S",
    "colour": "Lisse Café",
    "colourCode": "#332826",
    "weight": "Rubber Sole",
    "size": "UK 10",
    "purchaseDate": "2025-08-03",
    "image": "/images/wardrobe/ferret/main/cover.png",
    "gallery": [
      "/images/wardrobe/ferret/main/gallery/01.jpg",
      "/images/wardrobe/ferret/main/gallery/02.jpg",
      "/images/wardrobe/ferret/main/gallery/03.jpg"
    ],
    "metadata": {
      "price": 41696,
      "basicColour": "brown",
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "basket-weave-linen-jacket",
    "category": "Jackets",
    "brand": "Polo Ralph Lauren",
    "name": "Basket-Weave Linen Jacket",
    "season": "S/S",
    "colour": "Tan",
    "colourCode": "#aa9b83",
    "fabric": "Linen",
    "weight": "~280 gsm",
    "size": "AB8",
    "purchaseDate": "2025-02-01",
    "image": "/images/wardrobe/basket-weave-linen-jacket/main/cover.png",
    "gallery": [
      "/images/wardrobe/basket-weave-linen-jacket/main/gallery/01.jpg"
    ],
    "notes": "Polo Ralph Lauren Vintage Linen Sport Coat (1990s, Made in Japan)\n\n* Era: 1990s\n* Line: Polo by Ralph Lauren\n* Licensee: Impact 21 Co., Ltd. (Japanese subsidiary of Ralph Lauren)\n* Measurements:\n    * Back Length: 78 cm\n    * Shoulder: 49 cm\n    * Chest: 61 cm\n    * Sleeve Length: 64 cm\n* Colour: Mixed Beige\n* Shell: 100% Linen\n* Lining: Cupro\n* Country of Origin: Made in Japan\n\nNotes:\nA Japanese domestic licensed piece from the 1990s under Impact 21, featuring classic American tailoring details including a 3-roll-2 front, notch lapels, side vents, and breathable linen construction. The relaxed silhouette reflects the softer Ivy / trad tailoring proportions typical of Ralph Lauren’s 1990s tailoring. Suitable as a warm-weather sport coat with strong compatibility for both Ivy and classic American casual wardrobes.",
    "metadata": {
      "price": 10620,
      "basicColour": "beige",
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "polo-bear-jumper",
    "category": "Mid Layer",
    "brand": "Polo Ralph Lauren",
    "name": "Polo Bear Jumper",
    "season": "A/W",
    "colour": "Wine",
    "colourCode": "#49131e",
    "fabric": "Wool-cashmere",
    "size": "XL",
    "purchaseDate": "2025-01-07",
    "image": "/images/wardrobe/polo-bear-jumper/main/cover.png",
    "gallery": [
      "/images/wardrobe/polo-bear-jumper/main/gallery/01.jpg",
      "/images/wardrobe/polo-bear-jumper/main/gallery/02.jpg",
      "/images/wardrobe/polo-bear-jumper/main/gallery/03.jpg",
      "/images/wardrobe/polo-bear-jumper/main/gallery/04.jpg"
    ],
    "metadata": {
      "price": 28000,
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "washed-rugby-shirt",
    "category": "Mid Layer",
    "brand": "Polo Ralph Lauren",
    "name": "Washed Rugby Shirt",
    "season": "A/W",
    "colour": "Wine",
    "colourCode": "6A1124",
    "fabric": "Cotton",
    "size": "XL",
    "purchaseDate": "2025-01-19",
    "image": "/images/wardrobe/washed-rugby-shirt/1778705113968-cover-edit.png",
    "gallery": [
      "/images/wardrobe/washed-rugby-shirt/main/gallery/01.webp",
      "/images/wardrobe/washed-rugby-shirt/main/gallery/02.webp",
      "/images/wardrobe/washed-rugby-shirt/main/gallery/03.webp"
    ],
    "metadata": {
      "price": 6490,
      "basicColour": "red",
      "priceCurrency": "JPY",
      "secondaryColour": "Cream",
      "secondaryColourCode": "F5F1E8"
    }
  },

  {
    "id": "original-wayfarer-sunglasses",
    "category": "Eyewear",
    "brand": "Ray-Ban",
    "name": "Original Wayfarer Sunglasses",
    "season": "All-season",
    "colour": "Tortoise, G-15 Green",
    "colourCode": "#332720",
    "purchaseDate": "2025-08-08",
    "image": "/images/wardrobe/original-wayfarer-sunglasses/main/cover.png",
    "gallery": [
      "/images/wardrobe/original-wayfarer-sunglasses/main/gallery/05.webp",
      "/images/wardrobe/original-wayfarer-sunglasses/main/gallery/01.webp",
      "/images/wardrobe/original-wayfarer-sunglasses/main/gallery/02.webp",
      "/images/wardrobe/original-wayfarer-sunglasses/main/gallery/03.webp",
      "/images/wardrobe/original-wayfarer-sunglasses/main/gallery/04.webp"
    ],
    "metadata": {
      "price": 6490,
      "basicColour": "brown",
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "ligne-2",
    "category": "Jewellery",
    "brand": "S.T. Dupont",
    "name": "Ligne-2",
    "season": "All-season",
    "colour": "Gold",
    "colourCode": "#fef4bb",
    "purchaseDate": "2026-05-19",
    "image": "/images/wardrobe/ligne-2/main/cover.png",
    "gallery": [
      "/images/wardrobe/ligne-2/main/gallery/01.png",
      "/images/wardrobe/ligne-2/main/gallery/02.png",
      "/images/wardrobe/ligne-2/main/gallery/03.png",
      "/images/wardrobe/ligne-2/main/gallery/04.png"
    ],
    "notes": "Lighter Line 2, small model. Microdiamond tip Yellow gold color. Associated lighter stone: black. Associated gas refill: red (REF 900435). Lighter delivered empty of gas, refill sold separately."
  },

  {
    "id": "fair-isle-vest",
    "category": "Mid Layer",
    "brand": "The Engineer",
    "name": "Fair Isle Vest",
    "season": "A/W",
    "colour": "Brown Mixed",
    "colourCode": "#766051",
    "fabric": "Wool",
    "size": "XXL",
    "purchaseDate": "2024-11-03",
    "image": "/images/wardrobe/fair-isle-vest/main/cover.png",
    "gallery": [
      "/images/wardrobe/fair-isle-vest/main/gallery/01.jpg"
    ],
    "metadata": {
      "price": 357.97,
      "priceCurrency": "CNY"
    }
  },

  {
    "id": "knit-long-sleeve-polo",
    "category": "Shirts",
    "brand": "The Engineer",
    "name": "Knit Long-Sleeve Polo",
    "season": "A/W",
    "colour": "Black",
    "fabric": "Cotton",
    "size": "XXL",
    "purchaseDate": "2024-11-03",
    "image": "/images/wardrobe/knit-long-sleeve-polo/main/cover.png",
    "gallery": [
      "/images/wardrobe/knit-long-sleeve-polo/main/gallery/01.png"
    ],
    "metadata": {
      "price": 407.82,
      "priceCurrency": "CNY"
    }
  },

  {
    "id": "linen-safari-jacket",
    "category": "Outerwear",
    "brand": "The Engineer",
    "name": "Linen Safari Jacket",
    "season": "S/S",
    "colour": "Ecru",
    "colourCode": "#EBE0D6",
    "fabric": "Linen",
    "weight": "~350 gsm",
    "size": "XXL",
    "purchaseDate": "2023-01-28",
    "image": "/images/wardrobe/linen-safari-jacket/main/cover.png",
    "gallery": [
      "/images/wardrobe/linen-safari-jacket/main/gallery/01.jpg"
    ],
    "metadata": {
      "price": 893.32,
      "priceCurrency": "CNY"
    }
  },

  {
    "id": "prx-quartz",
    "category": "Everyday",
    "brand": "Tissot",
    "name": "PRX Quartz",
    "season": "All-season",
    "colour": "Gold PVD",
    "colourCode": "#D6C082",
    "weight": "T137.210.33.021.00",
    "size": "35 mm",
    "purchaseDate": "2024-08-08",
    "image": "/images/wardrobe/prx-quartz/main/cover.png",
    "gallery": [
      "/images/wardrobe/prx-quartz/main/gallery/01.jpg"
    ],
    "notes": "Movement: ETA F06.115 quartz\nCase: : 35mm YG PVD coating, thckness 9.6mm\nDial: Champagne sunburst\nBracelet: Integrated gold PVD coating\n\n\fNotes:\nPRX 源⾃ 70 年代 integrated-bracelet watch 的設計語⾔ , 與 VC 222 共享類似的造型 ｡ 儘管全錶都是⾦⾊調 , vintage luxury sports watch 的外觀使其仍能作為⼀隻稱職的 everyday watch , 同時作為未來邁向 Rolex 16018 的過渡 ｡",
    "metadata": {
      "price": 11309,
      "basicColour": "gold",
      "priceCurrency": "TWD"
    }
  },

  {
    "id": "cordovan-l-zip-wallet-regular-price",
    "category": "Bags",
    "brand": "Tsuchiya Kaban",
    "name": "Cordovan L Zip Wallet Regular price",
    "season": "All-season",
    "colour": "Brown",
    "colourCode": "#7c371b",
    "size": "Cordovan",
    "purchaseDate": "2024-12-26",
    "image": "/images/wardrobe/cordovan-l-zip-wallet-regular-price/main/cover.png",
    "gallery": [
      "/images/wardrobe/cordovan-l-zip-wallet-regular-price/main/gallery/01.jpg",
      "/images/wardrobe/cordovan-l-zip-wallet-regular-price/main/gallery/03.webp"
    ],
    "notes": "Crafted from aniline-dyed Japanese cordovan, this minimalist wallet offers sleek design and efficient functionality. The luxuriously smooth leather has striking presence in a streamlined profile that slips effortlessly into any pocket. Over time, it develops a rich, gem-like luster—the perfect companion for an intentional lifestyle.",
    "metadata": {
      "price": 33000,
      "basicColour": "brown",
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "black-bay-58",
    "category": "Dive watch",
    "brand": "Tudor",
    "name": "Black Bay 58",
    "season": "All-season",
    "colour": "Steel",
    "colourCode": "#e8e8e8",
    "weight": "M79030N",
    "size": "39 mm",
    "purchaseDate": "2024-10-17",
    "image": "/images/wardrobe/black-bay-58/main/cover.png",
    "gallery": [
      "/images/wardrobe/black-bay-58/main/gallery/01.jpg",
      "/images/wardrobe/black-bay-58/main/gallery/02.jpg"
    ],
    "notes": "Movement: MT5402\nCase: 39mm SS, thickness 11.9mm\nLugs: 20mm lug width\nDial: Black domed\nBracelet: Riveted steel bracelet\n\nNotes:\nBB58 的比例與細節承襲 1958 年 Tudor ／ Rolex Submariner (7924 ／ 7922) 的設定, 包括窄外圈與纖薄中殼｡ 12 點紅⾊倒三⾓呼應 6538 ｢Big Crown｣, gilt dial 亦與現有⾦飾相呼應 ｡ 是本收藏裡唯⼀真正意義上的運動錶 ｡",
    "metadata": {
      "price": 82000,
      "basicColour": "silver",
      "priceCurrency": "TWD"
    }
  },

  {
    "id": "jwa-straight-jeans",
    "category": "Bottoms",
    "brand": "Uniqlo",
    "name": "JWA Straight Jeans",
    "season": "All-season",
    "colour": "Light Wash Blue",
    "colourCode": "#98B0C7",
    "fabric": "Denim",
    "size": "35inch",
    "purchaseDate": "2026-03-24",
    "image": "/images/wardrobe/jwa-straight-jeans/main/cover.png",
    "gallery": [
      "/images/wardrobe/jwa-straight-jeans/main/gallery/01.jpg"
    ],
    "metadata": {
      "price": 1290,
      "basicColour": "blue",
      "priceCurrency": "TWD"
    }
  },

  {
    "id": "kataaze-knit-mock-neck",
    "category": "Shirts",
    "brand": "Uniqlo",
    "name": "Kataaze Knit Mock Neck",
    "season": "A/W",
    "colour": "Beige",
    "colourCode": "#d0bcac",
    "fabric": "Acrylic blend",
    "size": "XL",
    "purchaseDate": "2022-02-13",
    "image": "/images/wardrobe/kataaze-knit-mock-neck/main/cover.png",
    "gallery": [
      "/images/wardrobe/kataaze-knit-mock-neck/main/gallery/01.jpg"
    ],
    "metadata": {
      "price": 990,
      "priceCurrency": "TWD"
    }
  },

  {
    "id": "linen-camp-collar-shirt",
    "category": "Shirts",
    "brand": "Uniqlo",
    "name": "Linen Camp Collar Shirt",
    "season": "S/S",
    "colour": "Dusty Ice Blue",
    "colourCode": "#B5CDED",
    "fabric": "Linen",
    "size": "XL",
    "purchaseDate": "2025-07-13",
    "image": "/images/wardrobe/linen-camp-collar-shirt/1778705380735-cover-edit.png",
    "gallery": [
      "/images/wardrobe/linen-camp-collar-shirt/main/gallery/01.avif"
    ],
    "notes": "コットンリネンシャツ",
    "metadata": {
      "price": 2990,
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "ocbd-shirt",
    "category": "Shirts",
    "brand": "Uniqlo",
    "name": "OCBD Shirt",
    "season": "All-season",
    "colour": "Blue",
    "colourCode": "#BAC9EF",
    "fabric": "Cotton",
    "size": "XL",
    "purchaseDate": "2020-01-01",
    "image": "/images/wardrobe/ocbd-shirt/1778706728073-variant-blue-cover.png",
    "colourVariants": [
      {
        "key": "blue",
        "image": "/images/wardrobe/ocbd-shirt/variants/blue/cover.png",
        "label": "Blue",
        "notes": "",
        "colour": "Blue",
        "gallery": [
          "/images/wardrobe/ocbd-shirt/main/gallery/01.png"
        ],
        "colourCode": "#BAC9EF",
        "previewImage": "/images/wardrobe/ocbd-shirt/variants/blue/preview.jpg"
      },
      {
        "key": "white",
        "image": "/images/wardrobe/ocbd-shirt/variants/white/cover.png",
        "label": "White",
        "notes": "",
        "colour": "White",
        "gallery": [],
        "colourCode": "#F5F5F9",
        "previewImage": "/images/wardrobe/ocbd-shirt/variants/white/preview.jpg"
      },
      {
        "key": "pink-stripe",
        "image": "/images/wardrobe/ocbd-shirt/variants/pink-stripe/cover.png",
        "label": "Pink stripe",
        "notes": "",
        "colour": "Pink stripe",
        "gallery": [],
        "colourCode": "#EEE7E4",
        "basicColour": "red",
        "previewImage": "/images/wardrobe/ocbd-shirt/variants/pink-stripe/preview.png"
      },
      {
        "key": "blue-striped",
        "image": "/images/wardrobe/ocbd-shirt/variants/blue-striped/cover.png",
        "label": "Blue striped",
        "notes": "",
        "colour": "Blue striped",
        "gallery": [],
        "colourCode": "#DCE1F5",
        "previewImage": "/images/wardrobe/ocbd-shirt/variants/blue-striped/preview.png"
      }
    ],
    "metadata": {
      "price": 3990,
      "priceCurrency": "JPY",
      "colourVariants": [
        {
          "key": "blue",
          "image": "/images/wardrobe/ocbd-shirt/variants/blue/cover.png",
          "label": "Blue",
          "notes": "",
          "colour": "Blue",
          "gallery": [
            "/images/wardrobe/ocbd-shirt/main/gallery/01.png"
          ],
          "colourCode": "#BAC9EF",
          "previewImage": "/images/wardrobe/ocbd-shirt/variants/blue/preview.jpg"
        },
        {
          "key": "white",
          "image": "/images/wardrobe/ocbd-shirt/variants/white/cover.png",
          "label": "White",
          "notes": "",
          "colour": "White",
          "gallery": [],
          "colourCode": "#F5F5F9",
          "previewImage": "/images/wardrobe/ocbd-shirt/variants/white/preview.jpg"
        },
        {
          "key": "pink-stripe",
          "image": "/images/wardrobe/ocbd-shirt/variants/pink-stripe/cover.png",
          "label": "Pink stripe",
          "notes": "",
          "colour": "Pink stripe",
          "gallery": [],
          "colourCode": "#EEE7E4",
          "basicColour": "red",
          "previewImage": "/images/wardrobe/ocbd-shirt/variants/pink-stripe/preview.png"
        },
        {
          "key": "blue-striped",
          "image": "/images/wardrobe/ocbd-shirt/variants/blue-striped/cover.png",
          "label": "Blue striped",
          "notes": "",
          "colour": "Blue striped",
          "gallery": [],
          "colourCode": "#DCE1F5",
          "previewImage": "/images/wardrobe/ocbd-shirt/variants/blue-striped/preview.png"
        }
      ]
    }
  },

  {
    "id": "cutwork-knit-polo-shirt",
    "category": "Shirts",
    "brand": "Zara",
    "name": "Cutwork Knit Polo Shirt",
    "season": "S/S",
    "colour": "Charcoal",
    "colourCode": "#262626",
    "fabric": "88% acrylic, 12% polyester",
    "size": "XL",
    "purchaseDate": "2025-07-29",
    "image": "/images/wardrobe/cutwork-knit-polo-shirt/main/cover.png",
    "gallery": [
      "/images/wardrobe/cutwork-knit-polo-shirt/main/gallery/01.jpg",
      "/images/wardrobe/cutwork-knit-polo-shirt/main/gallery/02.jpg"
    ],
    "notes": "Relaxed fit knit polo shirt woven from yarn with an open structure. Lapel collar with front opening. Short sleeves. Ribbed trims.",
    "metadata": {
      "price": 7990,
      "basicColour": "grey",
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "linen-loop-collar-shirt",
    "category": "Shirts",
    "brand": "Zara",
    "name": "Linen Loop-Collar Shirt",
    "season": "S/S",
    "colour": "Oyster-white",
    "fabric": "Linen",
    "size": "XL",
    "purchaseDate": "2025-08-09",
    "image": "/images/wardrobe/linen-loop-collar-shirt/main/cover.png",
    "gallery": [
      "/images/wardrobe/linen-loop-collar-shirt/main/gallery/01.jpg"
    ],
    "notes": "FLOWING REGULAR FIT SHIRT",
    "metadata": {
      "price": 8590,
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "purl-knit-t-shirt",
    "category": "Shirts",
    "brand": "Zara",
    "name": "Purl-Knit T-Shirt",
    "season": "S/S",
    "colour": "Off-White",
    "size": "XL",
    "purchaseDate": "2025-08-05",
    "image": "/images/wardrobe/purl-knit-t-shirt/main/cover.png",
    "gallery": [
      "/images/wardrobe/purl-knit-t-shirt/main/gallery/01.jpg"
    ],
    "metadata": {
      "price": 5990,
      "basicColour": "white",
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "rib-knit-polo-shirt-dusty-ice-blue",
    "category": "Shirts",
    "brand": "Zara",
    "name": "Rib Knit Polo Shirt",
    "season": "S/S",
    "colour": "Dusty Ice Blue",
    "colourCode": "#92a5b1",
    "fabric": "Knit",
    "size": "XL",
    "purchaseDate": "2025-12-12",
    "image": "/images/wardrobe/rib-knit-polo-shirt-dusty-ice-blue/main/cover.png",
    "gallery": [
      "/images/wardrobe/rib-knit-polo-shirt-dusty-ice-blue/main/gallery/01.jpg"
    ],
    "notes": "ZARA RIB KNIT POLO SHIRT",
    "metadata": {
      "price": 1570,
      "priceCurrency": "TWD"
    }
  },

  {
    "id": "boston-metal-frames",
    "category": "Eyewear",
    "brand": "Zoff",
    "name": "Boston Metal Frames",
    "season": "All-season",
    "colour": "Dark Havana",
    "colourCode": "#3b2425",
    "fabric": "Green Photochromic Lenses",
    "weight": "ZF192014",
    "purchaseDate": "2025-02-28",
    "image": "/images/wardrobe/boston-metal-frames/main/cover.png",
    "gallery": [
      "/images/wardrobe/boston-metal-frames/main/gallery/01.png"
    ],
    "notes": "『Zoff CLASSIC』\n\n【デザイン】\nアジアントレンドを意識した今っぽいメタルフレーム。\n柔らかなでおしゃれな印象のボストン型◎\n0.7㎜のリム線を使用することで、顔なじみの良さと快適な掛け心地を実現。\n光沢感のあるメタルフレームはアクセサリー感覚で使用していただけます。\n縦幅があるフレームは、抜け感が出る上に小顔効果も期待でき、ファッションのアクセントに。\n\n【カラー】\nZF192014-14E1：人気のブラック。テンプルのゴールドが抜け感のある印象に\nZF192014-49E1：おしゃれなべっこう柄ブラウン。ゴールドのテンプルがアクセントに。\nZF192014-21E1：柔らかい印象を与えてくれるピンク。フェミニンさをプラス。\nZF192014-56E1：こなれ感のあるゴールド。アクセサリー感覚でお使いいただけます。\n\n【スタイリングポイント】\nカジュアルからキレイめスタイルにも合わせやすい逸品。\nかけるだけでこなれ感をプラスするアイウェアは、普段コンタクトの方にもおすすめ。\nトレンドに左右されず、長くご愛用いただけます。\n\n※柄や色味の出方に個体差があり、画像と異なる場合がございます。\n\nCLASSIC(クラシック) 特集ページをみる\n※アウトレット商品は、販売から一定期間経過した商品などです。キズ、汚れなどがあるB級品ではございません。\n52□20-145\nA 片方のレンズ横幅：52mm\nB ブリッジ(鼻部分)の横幅：20mm\nC テンプル(つる)の長さ：145mm",
    "metadata": {
      "price": 9800,
      "basicColour": "gold",
      "priceCurrency": "JPY",
      "secondaryColour": "Gold",
      "secondaryColourCode": "#D6C082"
    }
  },

  // ——— A/W – Country Classics ———,

  {
    "id": "glen-check-tweed-jacket",
    "pillar": "Clothing",
    "section": "A/W – Country Classics",
    "category": "Jackets",
    "brand": "Cultum",
    "name": "Glen Check Tweed Jacket",
    "season": "A/W",
    "colour": "Brown",
    "colourCode": "7B5A43",
    "fabric": "Tweed",
    "weight": "620 gsm",
    "size": "58B",
    "purchaseDate": "2025-11-22",
    "image": "/images/wardrobe/glen-check-tweed-jacket/main/cover.png",
    "gallery": [
      "/images/wardrobe/glen-check-tweed-jacket/main/gallery/01.png"
    ],
    "metadata": {
      "price": 867,
      "basicColour": "brown",
      "priceCurrency": "CNY"
    }
  },

  {
    "id": "boa-fleece-vest",
    "pillar": "Clothing",
    "section": "A/W – Country Classics",
    "category": "Mid Layer",
    "brand": "Muji",
    "name": "Boa Fleece Vest",
    "season": "A/W",
    "colour": "Ecru",
    "colourCode": "#eae0d2",
    "fabric": "Sherpa fleece",
    "size": "XL",
    "purchaseDate": "2023-12-09",
    "image": "/images/wardrobe/boa-fleece-vest/main/cover.png",
    "gallery": [
      "/images/wardrobe/boa-fleece-vest/main/gallery/01.png"
    ],
    "notes": "紳士 ボアフリースベスト | 無印良品",
    "metadata": {
      "price": 1190,
      "priceCurrency": "TWD",
      "secondaryColour": "Olive Trim",
      "secondaryColourCode": "#737051"
    }
  },

  {
    "id": "rib-knit-roll-neck-neck-jumper",
    "pillar": "Clothing",
    "section": "A/W – Country Classics",
    "category": "Shirts",
    "brand": "Muji",
    "name": "Rib Knit Roll-Neck Neck Jumper",
    "season": "A/W",
    "colour": "Black",
    "fabric": "Wool",
    "weight": "Lightweight",
    "size": "XL",
    "purchaseDate": "2024-12-17",
    "image": "/images/wardrobe/rib-knit-roll-neck-neck-jumper/main/cover.png",
    "gallery": [
      "/images/wardrobe/rib-knit-roll-neck-neck-jumper/main/gallery/01.jpg"
    ],
    "notes": "紳士 洗えるウールリブタートルネックセーター",
    "metadata": {
      "price": 3990,
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "ventile-harrington",
    "pillar": "Clothing",
    "section": "A/W – Country Classics",
    "category": "Outerwear",
    "brand": "Private White VC",
    "name": "Ventile Harrington",
    "season": "A/W",
    "colour": "Midnight Navy",
    "colourCode": "#20252F",
    "fabric": "Ventile",
    "size": "6=XL",
    "purchaseDate": "2025-12-26",
    "image": "/images/wardrobe/ventile-harrington/main/cover.png",
    "gallery": [
      "/images/wardrobe/ventile-harrington/main/gallery/01.webp",
      "/images/wardrobe/ventile-harrington/main/gallery/01.jpg",
      "/images/wardrobe/ventile-harrington/main/gallery/02.jpg",
      "/images/wardrobe/ventile-harrington/main/gallery/03.jpg"
    ],
    "notes": "A jacket with soul. First stitched in the 1950s and still made in Manchester, it has dressed rebels, musicians, and silver-screen legends for generations. With its stand collar, copper zip, and waterproof Ventile shell, the Harrington is as it was meant to be - timeless, understated, and unmistakably British.",
    "metadata": {
      "price": 3377,
      "priceCurrency": "CNY"
    }
  },

  {
    "id": "camel-hair-polo-coat",
    "pillar": "Clothing",
    "section": "A/W – Country Classics",
    "category": "Outerwear",
    "brand": "Spier & Mackay",
    "name": "Camel Hair Polo Coat",
    "season": "A/W",
    "colour": "Golden Camel",
    "colourCode": "#C89C7B",
    "fabric": "Camel hair",
    "weight": "760 gsm",
    "size": "46",
    "purchaseDate": "2025-02-16",
    "image": "/images/wardrobe/camel-hair-polo-coat/main/cover.png",
    "gallery": [
      "/images/wardrobe/camel-hair-polo-coat/main/gallery/01.jpg",
      "/images/wardrobe/camel-hair-polo-coat/main/gallery/02.jpg"
    ],
    "metadata": {
      "price": 718.2,
      "basicColour": "brown",
      "priceCurrency": "USD"
    }
  },

  {
    "id": "cricket-cable-knit-jumper-vest",
    "pillar": "Clothing",
    "section": "A/W – Country Classics",
    "category": "Mid Layer",
    "brand": "Uniqlo",
    "name": "Cricket Cable-Knit Jumper Vest",
    "season": "A/W",
    "colour": "Ecru",
    "colourCode": "#fffcf5",
    "fabric": "Cotton-acrylic",
    "size": "XL",
    "purchaseDate": "2022-08-08",
    "image": "/images/wardrobe/cricket-cable-knit-jumper-vest/main/cover.png",
    "gallery": [
      "/images/wardrobe/cricket-cable-knit-jumper-vest/main/gallery/01.webp",
      "/images/wardrobe/cricket-cable-knit-jumper-vest/main/gallery/02.webp"
    ],
    "notes": "Filename: if slash is problematic on disk, use a variant without “/” in the filename and adjust this path.",
    "metadata": {
      "price": 790,
      "basicColour": "__omit__",
      "priceCurrency": "TWD",
      "secondaryColour": "Navy / Yellow Trim",
      "secondaryColourCode": "#f0c04d",
      "secondaryBasicColour": "white"
    }
  },

  {
    "id": "pleated-trousers",
    "pillar": "Clothing",
    "section": "A/W – Country Classics",
    "category": "Bottoms",
    "brand": "Uniqlo",
    "name": "Pleated Trousers",
    "season": "All-season",
    "colour": "Grey",
    "colourCode": "#5F5F62",
    "size": "XL",
    "purchaseDate": "2023-11-20",
    "image": "/images/wardrobe/pleated-trousers/variants/grey/cover.png",
    "notes": "Fabric details\nBody: 62% Polyester - Recycled Fiber, 29% Viscose, 5% Polyester, 4% Elastane/ Pocket Lining: 65% Polyester, 35% Cotton\nWashing instructions\nMachine wash up to 40 degrees, gentle cycle, Dry Clean, Not suitable for tumble-drying.",
    "colourVariants": [
      {
        "key": "grey",
        "image": "/images/wardrobe/pleated-trousers/variants/grey/cover.png",
        "label": "Grey",
        "notes": "",
        "colour": "Grey",
        "gallery": [
          "/images/wardrobe/pleated-trousers/main/gallery/01.avif"
        ],
        "colourCode": "#5F5F62",
        "basicColour": "grey",
        "previewImage": "/images/wardrobe/pleated-trousers/variants/grey/preview.jpg"
      },
      {
        "key": "beige",
        "image": "/images/wardrobe/pleated-trousers/variants/beige/cover.png",
        "label": "Beige",
        "notes": "",
        "colour": "Beige",
        "gallery": [],
        "colourCode": "#CEBEA6",
        "basicColour": "beige",
        "previewImage": "/images/wardrobe/pleated-trousers/variants/beige/preview.jpg"
      }
    ],
    "metadata": {
      "price": 3990,
      "priceCurrency": "JPY",
      "colourVariants": [
        {
          "key": "grey",
          "image": "/images/wardrobe/pleated-trousers/variants/grey/cover.png",
          "label": "Grey",
          "notes": "",
          "colour": "Grey",
          "gallery": [
            "/images/wardrobe/pleated-trousers/main/gallery/01.avif"
          ],
          "colourCode": "#5F5F62",
          "basicColour": "grey",
          "previewImage": "/images/wardrobe/pleated-trousers/variants/grey/preview.jpg"
        },
        {
          "key": "beige",
          "image": "/images/wardrobe/pleated-trousers/variants/beige/cover.png",
          "label": "Beige",
          "notes": "",
          "colour": "Beige",
          "gallery": [],
          "colourCode": "#CEBEA6",
          "basicColour": "beige",
          "previewImage": "/images/wardrobe/pleated-trousers/variants/beige/preview.jpg"
        }
      ]
    }
  },

  // ——— Accessories ———,

  {
    "id": "panama-hat",
    "pillar": "Accessories",
    "section": "Accessories",
    "category": "Hats",
    "brand": "Eloy Bernal",
    "name": "Panama Hat",
    "season": "All-season",
    "size": "XL:61cm-1cm",
    "purchaseDate": "2025-05-11",
    "image": "/images/wardrobe/panama-hat/1778710719473-cover-edit.png",
    "gallery": [
      "/images/wardrobe/panama-hat/main/gallery/01.jpg",
      "/images/wardrobe/panama-hat/1778711933866-gallery-edit-2.avif",
      "/images/wardrobe/panama-hat/1778711934146-gallery-edit-3.avif"
    ],
    "notes": "Construction & Provenance\nHandwoven in Ecuador by ELOY BERNAL, this classic Panama is crafted from 100% natural toquilla straw using the traditional Llano weave. Finished in a bleached white tone with a black grosgrain ribbon, it balances lightweight structure with relaxed warm-weather elegance.\n\nDesign & Proportions (XL, Estimated)\n\n* Colour: Bleached White\n* Ribbon: Black Grosgrain\n* Style: Center-Dent Crown\n* Brim Type: Snap Brim\n* Crown Shape: Classic Fedora\n* Head Circumference: approx. 61 cm\n* Brim Width: approx. 6–7 cm\n* Front Crown Height: approx. 9.7 cm\n* Center Crown Height: approx. 10.7 cm\n* Overall Length: approx. 35–35.5 cm\n* Overall Width: approx. 31–31.5 cm\n* Weight: approx. 85–105 g\n\nMaterial & Weave\n\n* Material: 100% Natural Toquilla Straw\n* Weave: Llano (classic basket/plain weave)\n* Grade: Standard\n* Hand Feel: Lightweight, soft-structured\n* Rigidity: Soft to medium\n* Breathability: High\n\nSeasonality\n\n* Spring / Summer\n\nIncluded\n\n* Size adjustment tape (30 cm)",
    "metadata": {
      "price": 9600,
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "boat-and-tote",
    "pillar": "Accessories",
    "section": "Accessories",
    "category": "Bags",
    "brand": "L.L.Bean",
    "name": "Boat and Tote",
    "season": "All-season",
    "colour": "Cream",
    "colourCode": "#e2d8d0",
    "size": "Medium",
    "purchaseDate": "2025-01-01",
    "image": "/images/wardrobe/boat-and-tote/main/cover.png",
    "gallery": [
      "/images/wardrobe/boat-and-tote/main/gallery/01.jpg"
    ],
    "notes": "Boat and Tote, Open-Top\nItem No.: TC112636\nType: Medium\nColour: Blue Trim\nHandle: Regular\nMonogram: Yes\nLetter Style: Flare (FT)\nThread Colour: Coastal Gold (120)\nEmbroidered Initials: TLY",
    "metadata": {
      "price": 11880,
      "basicColour": "white",
      "priceCurrency": "JPY",
      "secondaryColour": "Navy trim",
      "secondaryColourCode": "#303c73"
    }
  },

  {
    "id": "anthony",
    "pillar": "Accessories",
    "section": "Accessories",
    "category": "Bags",
    "brand": "Mulberry",
    "name": "Anthony",
    "season": "All-season",
    "colour": "Oak",
    "colourCode": "#A95B32",
    "measuredDimensions": "Height: 25 cm\nWidth: 21 cm\nThickness: 7 cm\nStrap Width: 4 cm",
    "purchaseDate": "2025-07-27",
    "image": "/images/wardrobe/anthony/main/cover.png",
    "gallery": [
      "/images/wardrobe/anthony/main/gallery/01.png",
      "/images/wardrobe/anthony/main/gallery/02.png"
    ],
    "notes": "Purchased in near-excellent condition, with only one previous use. No visible stains, scratches, or notable signs of wear. Compact everyday messenger proportions with a broad adjustable shoulder strap, consistent with the classic Antony design language.",
    "metadata": {
      "price": 45000,
      "priceCurrency": "JPY",
      "measurementRows": [
        {
          "label": "Height",
          "value": "25"
        },
        {
          "label": "Width",
          "value": "21"
        },
        {
          "label": "Thickness",
          "value": "7"
        },
        {
          "label": "Strap Width",
          "value": "4"
        }
      ]
    }
  },

  {
    "id": "american-flag-hat",
    "pillar": "Accessories",
    "section": "Accessories",
    "category": "Hats",
    "brand": "Smathers & Branson",
    "name": "American Flag Hat",
    "season": "All-season",
    "colour": "Steel Blue",
    "colourCode": "#5E829A",
    "purchaseDate": "2026-05-11",
    "image": "/images/wardrobe/american-flag-hat/main/cover.png",
    "gallery": [
      "/images/wardrobe/american-flag-hat/main/gallery/01.jpg",
      "/images/wardrobe/american-flag-hat/main/gallery/01.png"
    ],
    "notes": "Size & Fit Information\nCircumference: approximately 22.45'' (adjustable by a nickel slide)\n\nTop to Side: approximately 6.65''\n\nBrim: 2.9'' long\n\nOur six panel cotton twill hats are adorned with our signature 100% hand-stitched needlepoint. Each hat is adjustable by a nickel slide on the back of the hat.\n\n-100% hand-stitched needlepoint\n-Stitched with French cotton thread\n-Six Panel Construction\n-Washed Cotton Twill\n-Adjustable. One size fits most adults.",
    "metadata": {
      "price": 1710,
      "priceCurrency": "TWD"
    }
  },

  {
    "id": "helmet-bag",
    "pillar": "Accessories",
    "section": "Accessories",
    "category": "Bags",
    "brand": "Uniqlo : C",
    "name": "Helmet Bag",
    "season": "All-season",
    "colour": "Grey Green",
    "colourCode": "#59686D",
    "purchaseDate": "2025-08-12",
    "image": "/images/wardrobe/helmet-bag/1778720745157-cover-edit.png",
    "gallery": [
      "/images/wardrobe/helmet-bag/1778712894508-gallery-edit-2.avif",
      "/images/wardrobe/helmet-bag/1778712894182-gallery-edit-1.avif"
    ],
    "notes": "Size\nWidth(Bottom): 34cm, Height: 38cm, Depth: 16cm, Shoulder Strap Length: 61cm～114cm, Bag Capacity: 26Liters\n\nProduct ID: 479880\n\nThe images shown may include colours that are not available.",
    "metadata": {
      "price": 2990,
      "colourCode": "#556469",
      "basicColour": "green",
      "priceCurrency": "JPY"
    }
  },

  // ——— Future Pieces ———,

  {
    "id": "sapphire-three-stone-ring",
    "pillar": "Jewellery",
    "section": "Future Pieces",
    "category": "Jewellery",
    "brand": "Future Piece",
    "name": "Sapphire Three-Stone Ring",
    "season": "All-season",
    "colour": "Platinum",
    "colourCode": "#e8e8e8",
    "fabric": "Platinum",
    "image": "/images/wardrobe/sapphire-three-stone-ring/main/cover.png",
    "gallery": [
      "/images/wardrobe/sapphire-three-stone-ring/main/gallery/01.jpg",
      "/images/wardrobe/sapphire-three-stone-ring/main/gallery/01.png",
      "/images/wardrobe/sapphire-three-stone-ring/main/gallery/02.png",
      "/images/wardrobe/sapphire-three-stone-ring/main/gallery/03.png"
    ],
    "notes": "Emerald-cut sapphire 6.8×5.1 mm ~1.1 ct; tapered baguette sides; ~1 ct diamonds total. Signed Cartier.  c.1950–65",
    "metadata": {
      "basicColour": "silver",
      "secondaryColour": "Sapphire",
      "secondaryColourCode": "#1B57BC"
    }
  },

  // ——— S/S – Mediterranean Resort ———,

  {
    "id": "washed-breton-stripe-boat-neck-3-4-sleeve-t-shirt",
    "pillar": "Clothing",
    "section": "S/S – Mediterranean Resort",
    "category": "Shirts",
    "brand": "Muji",
    "name": "Washed Breton-Stripe Boat-Neck 3/4 Sleeve T-Shirt",
    "season": "A/W",
    "colour": "Off-White / Navy",
    "colourCode": "#eeeeef",
    "fabric": "Cotton",
    "weight": "Midweight",
    "size": "XL",
    "purchaseDate": "2025-01-31",
    "image": "/images/wardrobe/washed-breton-stripe-boat-neck-3-4-sleeve-t-shirt/main/cover.png",
    "gallery": [
      "/images/wardrobe/washed-breton-stripe-boat-neck-3-4-sleeve-t-shirt/main/gallery/01.jpg"
    ],
    "notes": "紳士 洗いざらし太番手ボートネック九分袖Ｔシャツ",
    "metadata": {
      "price": 2990,
      "basicColour": "white",
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "baker-neck-knitted-t-shirt",
    "pillar": "Clothing",
    "section": "S/S – Mediterranean Resort",
    "category": "Shirts",
    "brand": "Zara",
    "name": "Baker Neck Knitted T-Shirt",
    "season": "S/S",
    "colour": "Navy",
    "colourCode": "#1f222e",
    "size": "XL",
    "purchaseDate": "2025-08-09",
    "image": "/images/wardrobe/baker-neck-knitted-t-shirt/main/cover.png",
    "gallery": [
      "/images/wardrobe/baker-neck-knitted-t-shirt/main/gallery/01.jpg"
    ],
    "notes": "BUTTON-NECK KNIT T-SHIRT",
    "metadata": {
      "price": 6590,
      "priceCurrency": "JPY"
    }
  },

  {
    "id": "rib-knit-polo-shirt-dark-chocolate",
    "pillar": "Clothing",
    "section": "S/S – Mediterranean Resort",
    "category": "Shirts",
    "brand": "Zara",
    "name": "Rib Knit Polo Shirt",
    "season": "S/S",
    "colour": "Dark Chocolate",
    "colourCode": "#2C2928",
    "size": "XL",
    "measuredDimensions": "Measurements: Chest 59.5 cm · Front length 71.5 cm · Sleeve length 24 cm · Back width 51.5 cm · Arm width 19.5 cm ·  ·  · cm",
    "purchaseDate": "2026-05-14",
    "image": "/images/wardrobe/rib-knit-polo-shirt-dark-chocolate/main/cover.png",
    "gallery": [
      "/images/wardrobe/rib-knit-polo-shirt-dark-chocolate/main/gallery/01.jpg"
    ],
    "notes": "Regular fit knitted polo shirt made from cotton yarn. Lapel collar with front button fastening. Ribbed trims.",
    "metadata": {
      "price": 1490,
      "basicColour": "brown",
      "priceCurrency": "TWD",
      "measurementRows": [
        {
          "label": "Measurements",
          "value": "Chest 59.5 cm · Front length 71.5 cm · Sleeve length 24 cm · Back width 51.5 cm · Arm width 19.5 cm ·  ·  ·"
        }
      ]
    }
  },

  {
    "id": "structured-knit-polo-shirt",
    "pillar": "Clothing",
    "section": "S/S – Mediterranean Resort",
    "category": "Shirts",
    "brand": "Zara",
    "name": "Structured Knit Polo Shirt",
    "season": "S/S",
    "colourCode": "#3E3934",
    "size": "XL",
    "measuredDimensions": "Chest: 59.5 cm\nFront length: 71.5 cm\nSleeve length: 24 cm\nBack width: 51.5 cm\nArm width: 19.5 cm",
    "purchaseDate": "2026-05-14",
    "image": "/images/wardrobe/structured-knit-polo-shirt/main/cover.png",
    "gallery": [
      "/images/wardrobe/structured-knit-polo-shirt/main/gallery/01.jpg"
    ],
    "notes": "STRUCTURED KNIT POLO SHIRT\nNT$ 1,490\nRef 3332/410\nRegular fit knitted polo shirt in spun cotton yarn. Lapel collar with front opening and short sleeve. Ribbed trims.",
    "metadata": {
      "price": 1490,
      "basicColour": "green",
      "priceCurrency": "TWD",
      "measurementRows": [
        {
          "label": "Chest",
          "value": "59.5"
        },
        {
          "label": "Front length",
          "value": "71.5"
        },
        {
          "label": "Sleeve length",
          "value": "24"
        },
        {
          "label": "Back width",
          "value": "51.5"
        },
        {
          "label": "Arm width",
          "value": "19.5"
        }
      ]
    }
  }
];
