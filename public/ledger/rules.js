/* Spending — categorisation data. Pure data, no logic.
   Edit this file to teach the tool about new merchants. */

var CATEGORIES = [
  "groceries", "restaurants", "transport", "travel", "housing", "utilities",
  "home", "health", "education", "entertainment", "shopping",
  "subscriptions", "cash", "fees", "income", "rewards", "external",
  "transfers", "uncategorized"
];

var CAT_LABEL = {
  groceries: "Groceries", restaurants: "Restaurants", transport: "Transport",
  travel: "Travel", housing: "Housing", utilities: "Utilities", home: "Home",
  health: "Health", education: "Education", entertainment: "Entertainment",
  shopping: "Shopping", subscriptions: "Subscriptions", cash: "Cash",
  fees: "Fees", income: "Income",
  rewards: "Rewards", external: "External transfers",
  transfers: "Internal transfers", uncategorized: "Uncategorised"
};

/* Not spending. Excluded from every total, chart and comparison. Only
   movement between your own accounts belongs here: money sent to another
   person has left, and counting it as a transfer would hide it. */
var NOT_SPEND = { income: 1, rewards: 1, transfers: 1 };

/* Large fixed commitments. Still spending, but they dwarf everything else and
   you cannot do much about them month to month, so the headline figure and the
   month-by-month trend leave them out and report them separately. Remove a
   category from here to fold it back into the main number. */
var FIXED = { housing: 1, education: 1 };

var PROCESSOR_PREFIXES = [
  "SQ", "TST", "SP", "PY", "PP", "PAYPAL", "EB", "IN", "WL", "CKE", "POS",
  "DD", "MOB", "ACH", "WPY", "GOOGLE", "APL", "STRIPE", "TOAST", "CLOVER",
  "CTLP", "ASUC.ORG", "AMZN"
];

var US_STATES = "AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|" +
  "MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|" +
  "UT|VT|VA|WA|WV|WI|WY";

/* Merchants whose names really are numbers — protect them from the
   "strip a trailing number" rule. */
var NUMBER_NAME_MERCHANTS = /^(7[\s-]?ELEVEN|99 RANCH|16 HANDLES|85C|FIVE GUYS|24 HOUR)/;

/* t = tier. 1 beats 2 beats 3, so a brand always beats a generic keyword. */
var RULES = [

  /* ---- transfers: must win over everything, or money is counted twice ---- */
  { t: 1, c: "transfers", re: /\bPAYMENT FROM (SAV|CHK|CRD)\b/ },
  { t: 1, c: "transfers", re: /\bBANKING (PAYMENT|TRANSFER) (TO|FROM)\b/ },
  { t: 1, c: "transfers", re: /\bONLINE BANKING TRANSFER\b/ },
  { t: 1, c: "transfers", re: /\bAGENT ASSISTED TRANSFER\b/ },
  { t: 1, c: "transfers", re: /\b(PAYMENT\s?-?\s?THANK YOU|AUTOPAY|CARD PAYMENT)\b/ },
  { t: 1, c: "external", re: /\bZELLE\b/ },
  { t: 1, c: "external", re: /\b(VENMO|CASH APP|CASHAPP)\b/ },
  { t: 1, c: "external", re: /\b(WISE|TRANSFERWISE|REMITLY|XOOM|WESTERN UNION|MONEYGRAM)\b/ },
  { t: 1, c: "transfers", re: /\b(WIRE TYPE|WIRE IN|WIRE OUT)\b/ },
  { t: 2, c: "transfers", re: /\bWIRE TRANSFER\b/ },   /* the FEE rule is tier 1, so it wins */
  { t: 1, c: "transfers", re: /\bTRANSFER (TO|FROM)\b/ },
  { t: 1, c: "transfers", re: /\b(SCHWAB|FIDELITY|VANGUARD|ROBINHOOD|COINBASE|BETTERMENT|WEALTHFRONT)\b/ },
  { t: 1, c: "cash", re: /\b(ATM|CASH WITHDRAWAL|CASH DEPOSIT|CASH WITHDRWL)\b/ },

  /* ---- income ---- */
  { t: 1, c: "income", re: /\b(PAYROLL|DIRECT DEP|DIR DEP|SALARY|WAGES|PAYCHECK)\b/ },
  { t: 1, c: "income", re: /\b(ADP|GUSTO|PAYCHEX|PAYCOM|TRINET|RIPPLING|WORKDAY)\b/ },
  { t: 1, c: "income", re: /\b(IRS TREAS 310|TAX REF|FRANCHISE TAX BD)\b/ },
  { t: 1, c: "income", re: /\b(INTEREST (EARNED|PAID)|DIVIDEND)\b/ },
  { t: 1, c: "rewards", re: /\b(CASHREWARD|CASH REWARD|CASH BACK|CASHBACK)\b/ },
  { t: 1, c: "rewards", re: /\bREWARDS?\b/ },

  /* ---- fees ---- */
  { t: 1, c: "fees", re: /\b(WIRE TRANSFER FEE|WIRE FEE)\b/ },
  { t: 1, c: "fees", re: /\b(INTEREST CHARGE|FINANCE CHARGE)\b/ },
  { t: 1, c: "fees", re: /\b(OVERDRAFT|NSF|INSUFFICIENT FUNDS|RETURNED ITEM|STOP PAYMENT)\b/ },
  { t: 1, c: "fees", re: /\b(ANNUAL (MEMBERSHIP )?FEE|LATE FEE|FOREIGN TRANSACTION FEE|SERVICE CHARGE)\b/ },
  { t: 1, c: "fees", re: /\bFEDERAL WITHHOLDING\b/ },
  { t: 1, c: "fees", re: /\b(PARKNGFINE|PARKING FINE|CITATION)\b/ },

  /* ---- housing ---- */
  { t: 1, c: "housing", re: /\b(APARTMENT|APTS?\b|PROPERTY MGMT|REALTY|LEASING|RESIDENCES?)\b/ },
  { t: 1, c: "housing", re: /\b(RENT PAYMENT|RENTCAFE|AVALONBAY|GREYSTAR|EQUITY RESIDENTIAL)\b/ },
  { t: 2, c: "housing", re: /\bWEB PMTS\b/ },

  /* ---- education ---- */
  { t: 1, c: "education", re: /\b(UC BERKELEY|UNIVERSITY OF|TUITION|BURSAR|REGISTRAR|STUDENT ACCOUNT)\b/ },
  { t: 1, c: "education", re: /\b(COURSERA|UDEMY|EDX|CHEGG|PEARSON|MCGRAW|CENGAGE)\b/ },
  { t: 1, c: "education", re: /\bASUC\b/ },

  /* ---- groceries ---- */
  { t: 1, c: "groceries", re: /\bTRADER JOE/ },
  { t: 1, c: "groceries", re: /\b(WHOLE ?FOODS|WHOLEFDS|\bWFM\b)/ },
  { t: 1, c: "groceries", re: /\b(SAFEWAY|VONS|PAVILIONS|ANDRONICO)\b/ },
  { t: 1, c: "groceries", re: /\b(BERKELEY BOWL|BI-?RITE|SHATTUCK MARKET|KATHMANDU MARKET|MONTEREY MARKET)\b/ },
  { t: 1, c: "groceries", re: /\b(KROGER|RALPHS|ALBERTSONS?|PUBLIX|WEGMANS|MEIJER|SPROUTS|ALDI|LIDL)\b/ },
  { t: 1, c: "groceries", re: /\b(COSTCO|SAMS ?CLUB|BJS WHOLESALE)\b/ },
  { t: 1, c: "groceries", re: /\b(INSTACART|AMAZON FRESH|SHIPT)\b/ },
  { t: 1, c: "groceries", re: /\b(99 RANCH|H ?MART|MITSUWA|GROCERY OUTLET)\b/ },
  /* tier 1 and listed before the restaurants DoorDash rule, so a grocery
     delivery is groceries rather than a restaurant */
  { t: 1, c: "subscriptions", re: /\bDOORDASHDASHPASS|\bDASHPASS\b/ },
  { t: 1, c: "groceries", re: /\bDOORDASH (SAFEWAY|ANDRONICO|GROCERYOU|TRADER|WHOLEFOODS|7-ELEVEN)/ },
  { t: 3, c: "groceries", re: /\b(GROCERY|SUPERMARKET|PRODUCE|FARMERS MKT)\b/ },

  /* ---- restaurants ---- */
  { t: 1, c: "restaurants", re: /\bUBER\s?EATS\b/ },
  /* no trailing \b: real descriptions run the words together, e.g. DOORDASHDASHPASS */
  { t: 1, c: "restaurants", re: /\bDOORDASH/ },
  { t: 1, c: "restaurants", re: /\b(GRUBHUB|SEAMLESS|POSTMATES|CAVIAR)\b/ },
  { t: 1, c: "restaurants", re: /\b(STARBUCKS|BLUE BOTTLE|PEETS|PHILZ|DUNKIN|CAFFE|BURLAP COFFEE)\b/ },
  { t: 1, c: "restaurants", re: /\b(CHIPOTLE|SWEETGREEN|PANERA|SUBWAY|CAVA|SHAKE SHACK)\b/ },
  { t: 1, c: "restaurants", re: /\b(MCDONALD|BURGER KING|WENDYS|TACO BELL|POPEYES|KFC|CHICK-?FIL-?A)\b/ },
  { t: 1, c: "restaurants", re: /\b(LADLE & LEAF|JUPITER PIZZA|BAKER AND COMMONS|HEADLANDS|CORNERSTONE|RALEIGHS|CELLARMAKER|TUPPER & REED|ALIBI ROOM|ACQUOLINA|KINGFISH|BIERGARTEN|FACULTY CLUB|CALI'?S SPORTS)\b/ },
  { t: 3, c: "restaurants", re: /\b(CAFE|COFFEE|ESPRESSO|RESTAURANT|BISTRO|TAQUERIA|SUSHI|RAMEN|NOODLE|PIZZERIA|PIZZA|KITCHEN|DELI|BAKERY|BREWING|BREWERY|TAPROOM|TAVERN|GRILL|THAI|PHO\b|BBQ|BURRITO|CREAMERY|DONUT|BAGEL|LOUNGE|BAR\b)\b/ },

  /* ---- transport ---- */
  { t: 1, c: "transport", re: /\bUBER\b/ },
  { t: 1, c: "transport", re: /\b(LYFT|WAYMO)\b/ },
  { t: 1, c: "transport", re: /\b(CLIPPER|TAP TRANSIT|BART|MUNI|CALTRAIN|MTA|OMNY|METRO)\b/ },
  { t: 1, c: "transport", re: /\b(SHELL|CHEVRON|EXXON|MOBIL|TEXACO|ARCO|CITGO|VALERO|BEL AIR OIL)\b/ },
  { t: 1, c: "transport", re: /\b(PARKING|PARKMOBILE|SPOTHERO|ABM PARKING)\b/ },
  { t: 1, c: "transport", re: /\b(FASTRAK|E-?Z ?PASS|TOLL)\b/ },
  { t: 1, c: "transport", re: /\b(JIFFY LUBE|VALVOLINE|AUTOZONE|DISCOUNT TIRE|CAR WASH)\b/ },

  /* ---- travel ---- */
  /* FRONTIER AI is Frontier Airlines, not an AI company. */
  { t: 1, c: "travel", re: /\bFRONTIER AI\b/ },
  { t: 1, c: "travel", re: /\b(UNITED AIR|DELTA AIR|AMERICAN AIR|SOUTHWEST|ALASKA AIR|JETBLUE|SPIRIT AIR|TURKISH AIR|LUFTHANSA|EMIRATES)\b/ },
  { t: 1, c: "travel", re: /\b(MARRIOTT|HILTON|HYATT|HOLIDAY INN|BEST WESTERN|MOTEL 6)\b/ },
  { t: 1, c: "travel", re: /\b(AIRBNB|VRBO|BOOKING ?COM|EXPEDIA|HOTELS ?COM|PRICELINE|KAYAK)\b/ },
  { t: 1, c: "travel", re: /\b(HERTZ|AVIS|ENTERPRISE RENT|BUDGET RENT|SIXT|TURO)\b/ },
  { t: 1, c: "travel", re: /\b(AMTRAK|TSA ?PRE|GLOBAL ENTRY|CLEAR ?ME)\b/ },
  { t: 3, c: "travel", re: /\b(AIRLINES?|AIRPORT|HOTEL|RESORT|HOSTEL|CRUISE)\b/ },

  /* ---- utilities ---- */
  { t: 1, c: "utilities", re: /\b(COMCAST|XFINITY|SPECTRUM|CENTURYLINK|GOOGLE FIBER|SONIC NET)\b/ },
  { t: 1, c: "utilities", re: /\b(MINT MOBILE|AT ?&? ?T|VERIZON|T-?MOBILE|GOOGLE FI|VISIBLE)\b/ },
  { t: 1, c: "utilities", re: /\b(PG ?&? ?E|PG AND E|PGANDE|PACIFIC GAS|EDISON|EBMUD|RECOLOGY|WASTE MANAGEMENT)\b/ },
  { t: 1, c: "utilities", re: /\b(WASH LAUNDRY|PAYRANGE|LAUNDRY)\b/ },
  { t: 3, c: "utilities", re: /\b(UTILITY|UTILITIES|ELECTRIC CO|WATER DEPT)\b/ },

  /* ---- home ---- */
  { t: 1, c: "home", re: /\b(IKEA|WAYFAIR|OVERSTOCK|WEST ELM|POTTERY BARN|CRATE ?&? ?BARREL|CB2|ARTICLE)\b/ },
  { t: 1, c: "home", re: /\b(HOME DEPOT|LOWES|MENARDS|ACE HARDWARE|HARBOR FREIGHT)\b/ },
  { t: 1, c: "home", re: /\b(BED BATH|HOMEGOODS|CONTAINER STORE|SUR LA TABLE)\b/ },
  { t: 1, c: "home", re: /\b(CASPER|PURPLE MATTRESS|MATTRESS FIRM|ASHLEY FURNITURE|LIVING SPACES)\b/ },
  { t: 3, c: "home", re: /\b(FURNITURE|HARDWARE|LUMBER|APPLIANCE|FLOORING)\b/ },

  /* ---- health ---- */
  { t: 1, c: "health", re: /\b(CVS|WALGREENS|RITE AID|GOODRX)\b/ },
  { t: 1, c: "health", re: /\b(KAISER|SUTTER|ONE MEDICAL|ZOCDOC|QUEST DIAGNOST|LABCORP|CARBON HEALTH)\b/ },
  { t: 1, c: "health", re: /\b(BLUE SHIELD|BLUE CROSS|ANTHEM|CIGNA|AETNA|DELTA DENTAL)\b/ },
  { t: 1, c: "health", re: /\b(EQUINOX|PLANET FITNESS|24 HOUR FIT|CLASSPASS|YMCA|ORANGETHEORY)\b/ },
  { t: 1, c: "health", re: /\b(WARBY PARKER|LENSCRAFTERS|ZENNI)\b/ },
  { t: 3, c: "health", re: /\b(PHARMACY|DENTAL|DENTIST|MEDICAL|CLINIC|HOSPITAL|OPTOMETR|THERAPY|URGENT CARE)\b/ },

  /* ---- entertainment & software ---- */
  { t: 1, c: "entertainment", re: /\b(NETFLIX|HULU|DISNEY|HBO ?MAX|PARAMOUNT|PEACOCK|YOUTUBE|CRUNCHYROLL)\b/ },
  { t: 1, c: "entertainment", re: /\b(SPOTIFY|APPLE MUSIC|PANDORA|TIDAL)\b/ },
  { t: 1, c: "entertainment", re: /\b(AUDIBLE|KINDLE|SCRIBD)\b/ },
  { t: 1, c: "entertainment", re: /\b(STEAM|PLAYSTATION|XBOX|NINTENDO|EPIC GAMES|TWITCH)\b/ },
  { t: 1, c: "entertainment", re: /\b(NYTIMES|NEW YORK TIMES|\bWSJ\b|ECONOMIST|SUBSTACK|PATREON)\b/ },
  { t: 1, c: "entertainment", re: /^APPLE$/ },          /* APPLE.COM/BILL */
  { t: 1, c: "entertainment", re: /\bTSAGLOBAL\b/ },   /* social events */
  { t: 1, c: "entertainment", re: /\b(DNA LOUNGE|NIGHTCLUB)\b/ },
  { t: 1, c: "entertainment", re: /\b(TICKETMASTER|STUBHUB|SEATGEEK|EVENTBRITE|AMC|REGAL CINEMA|CINEMARK)\b/ },
  { t: 1, c: "entertainment", re: /\b(APPLE ?BILL|APPLE ?PURCHASE|APPLE\.COM|ICLOUD|GOOGLE ONE|DROPBOX|ADOBE|MICROSOFT ?365|OPENAI|CHATGPT|ANTHROPIC|CLAUDE|NOTION|FIGMA|GITHUB|CANVA|CLOUDFLARE|LIGHTSPEED)\b/ },
  { t: 3, c: "entertainment", re: /\b(THEATRE|THEATER|MUSEUM|CONCERT|CINEMA|BOWLING|ARCADE|AMUSEMEN|PHOTO-MATICA)\b/ },

  /* ---- shopping: the catch-all, keep last ---- */
  { t: 2, c: "shopping", re: /\bAMAZON\b/ },
  { t: 2, c: "shopping", re: /\bTARGET\b/ },
  { t: 2, c: "shopping", re: /\bWAL-?MART\b/ },
  { t: 2, c: "shopping", re: /\b(TEMU|SHEIN|ALIEXPRESS|WISH)\b/ },
  { t: 2, c: "shopping", re: /\b(BEST BUY|B&H PHOTO|MICRO CENTER|NEWEGG|APPLE STORE)\b/ },
  { t: 2, c: "shopping", re: /\b(NIKE|ADIDAS|LULULEMON|UNDER ARMOUR|ALLBIRDS|NEW BALANCE)\b/ },
  { t: 2, c: "shopping", re: /\b(ZARA|H ?&? ?M|UNIQLO|OLD NAVY|GAP\b|MADEWELL|EVERLANE|URBAN OUTFITTER|ANTHROPOLOGIE)\b/ },
  { t: 2, c: "shopping", re: /\b(NORDSTROM|MACYS|KOHLS|TJ ?MAXX|MARSHALLS|ROSS STORES|ROSS DRESS|BURLINGTON)\b/ },
  { t: 2, c: "shopping", re: /\b(SEPHORA|ULTA|GLOSSIER)\b/ },
  { t: 2, c: "shopping", re: /\b(ETSY|EBAY|POSHMARK|MERCARI|STOCKX)\b/ },
  { t: 2, c: "shopping", re: /\b(REI\b|PATAGONIA|DICKS SPORTING|BACKCOUNTRY)\b/ },
  { t: 2, c: "shopping", re: /\b(PETCO|PETSMART|CHEWY)\b/ },
  { t: 2, c: "shopping", re: /\b(STAPLES|OFFICE DEPOT|MICHAELS|JOANN|BLICK ART)\b/ },
  { t: 2, c: "shopping", re: /\b(DOLLAR TREE|DOLLAR GENERAL|FIVE BELOW|GOODWILL)\b/ },
  { t: 2, c: "shopping", re: /\b(FLOWERS|FLORIST|MOE'?S FLOWERS)\b/ }
];

/* Header names seen across US issuers. Used as a prior, not a decision. */
var HEADER_SETS = {
  date: ["date", "posted date", "post date", "posting date", "transaction date",
         "trans date", "trans. date", "purchase date", "activity date", "effective date"],
  desc: ["description", "payee", "merchant", "name", "memo", "details",
         "original description", "transaction description"],
  amount: ["amount", "amount (usd)", "transaction amount", "amt", "value"],
  debit: ["debit", "withdrawal", "withdrawals", "money out", "debit amount"],
  credit: ["credit", "deposit", "deposits", "money in", "credit amount"],
  balance: ["balance", "running bal.", "running balance", "ending balance", "bal"],
  type: ["type", "transaction type", "debit/credit", "dr/cr"],
  category: ["category", "merchant category"],
  ref: ["reference number", "reference", "check", "check #", "check or slip #"],
  address: ["address", "city/state", "city", "state", "zip code", "country"]
};

/* ------------------------------------------------------------
   Cash in and out of an account. Every bank words it differently
   and abbreviates it differently — WITHDRWL, WTHDRWL, WITHDRAWAL —
   and the branch address rides along, so the same event arrives as
   a dozen different "merchants". These collapse it to one name per
   bank per direction. Add a bank by adding a line.
   ------------------------------------------------------------ */
var CASH_BANKS = [
  [/\b(BKOFAMERICA|BANK OF AMERICA|BOFA)\b/, "BofA"],
  [/\bCHASE\b/,                              "Chase"],
  [/\bWELLS ?FARGO\b/,                       "Wells Fargo"],
  [/\b(CITIBANK|CITI)\b/,                    "Citi"],
  [/\bCAPITAL ?ONE\b/,                       "Capital One"],
  [/\b(US BANK|USBANK)\b/,                   "US Bank"],
  [/\bPNC\b/,                                "PNC"],
  [/\bTD BANK\b/,                            "TD Bank"],
  [/\bALLY\b/,                               "Ally"],
  [/\b(SCHWAB|CHARLES SCHWAB)\b/,            "Schwab"],
  [/\bHSBC\b/,                               "HSBC"],
  [/\bSANTANDER\b/,                          "Santander"],
  [/\bCHIME\b/,                              "Chime"]
];

/* The marker that says this is cash moving, not a purchase. */
var CASH_PLACE = /\b(ATM|BC|BANKING ?CENTER|BRANCH|TELLER)\b/;
var CASH_OUT   = /\b(WITHDRWL|WTHDRWL|WDRWL|WITHDRAWL|WITHDRAWAL|WITHDRAW|WDL|CASH ?OUT)\b/;
var CASH_IN    = /\b(DEPOSIT|DEPOSITS|DEP)\b/;
