/* Spending — categorisation data. Pure data, no logic.
   Edit this file to teach the tool about new merchants. */

var CATEGORIES = [
  "groceries", "restaurants", "transport", "travel", "housing", "utilities",
  "home", "health", "education", "entertainment", "shopping",
  "personal", "pets", "subscriptions", "cash", "fees", "income", "rewards",
  "external", "transfers", "uncategorized"
];

var CAT_LABEL = {
  groceries: "Groceries", restaurants: "Restaurants", transport: "Transport",
  travel: "Travel", housing: "Housing", utilities: "Utilities", home: "Home",
  health: "Health", education: "Education", entertainment: "Entertainment",
  shopping: "Shopping", personal: "Personal care", pets: "Pets",
  subscriptions: "Subscriptions", cash: "Cash",
  fees: "Fees", income: "Income",
  rewards: "Rewards", external: "External transfers",
  transfers: "Internal transfers", uncategorized: "Uncategorised"
};

/* A credit from a shop is a refund. A credit from a person, or cash going back
   into the account, is not — it is money arriving, and calling it a refund would
   make a Zelle from a flatmate look like a shop gave you money back. */
var MONEY_IN = { cash: 1, external: 1, uncategorized: 1 };

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
  { t: 3, c: "travel", re: /\b(AIRLINES?|AIRPORT|HOTELS?|RESORTS?|HOSTEL|CRUISE)\b/ },

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

  /* ================================================================
     CHAINS. Brand rules only generalise if the brand is one most
     people actually use, so these are national chains rather than
     anything local. Tier 2: a local shop with the same word in its
     name should still lose to a keyword rule that is more specific.
     ================================================================ */

  /* groceries */
  { t: 2, c: "groceries", re: /\b(KROGER|SAFEWAY|ALBERTSONS|VONS|RALPHS|FRED MEYER|KING SOOPERS|HARRIS TEETER|FRYS FOOD|SMITHS FOOD)\b/ },
  { t: 2, c: "groceries", re: /\b(PUBLIX|WEGMANS|HEB\b|MEIJER|HY-?VEE|GIANT EAGLE|STOP ?& ?SHOP|FOOD LION|WINN-?DIXIE|SHOPRITE|SPROUTS|ALDI|LIDL|SAVE-?A-?LOT|PIGGLY WIGGLY)\b/ },
  { t: 2, c: "groceries", re: /\b(WHOLE ?FOODS|WHOLEFDS|TRADER ?JOE|COSTCO|SAMS CLUB|BJS WHOLESALE|GROCERY OUTLET|FRESH MARKET|NATURAL GROCERS|RAINBOW GROCERY)\b/ },
  { t: 2, c: "groceries", re: /\b(INSTACART|GOPUFF|WEEE|HMART|H ?MART|99 RANCH|PATEL BROTHERS|MITSUWA|SEAFOOD CITY)\b/ },

  /* restaurants, cafes and delivery */
  { t: 2, c: "restaurants", re: /\b(STARBUCKS|DUNKIN|PEETS|CARIBOU COFFEE|TIM HORTONS|COSTA COFFEE|PHILZ|LA COLOMBE|BLUE BOTTLE)\b/ },
  { t: 2, c: "restaurants", re: /\b(MCDONALD|BURGER KING|WENDY|JACK IN THE BOX|SONIC DRIVE|WHATABURGER|CULVERS|FIVE GUYS|SHAKE SHACK|IN-?N-?OUT|WHITE CASTLE|CARLS JR|HARDEES)\b/ },
  { t: 2, c: "restaurants", re: /\b(CHIPOTLE|QDOBA|MOES SOUTHWEST|TACO BELL|DEL TACO|EL POLLO LOCO|BAJA FRESH|CAVA\b|SWEETGREEN|PANERA|POTBELLY|JERSEY MIKE|JIMMY JOHN|FIREHOUSE SUBS|SUBWAY|QUIZNOS)\b/ },
  { t: 2, c: "restaurants", re: /\b(CHICK-?FIL-?A|POPEYES|KFC\b|RAISING CANE|ZAXBY|BOJANGLES|CHURCHS CHICKEN|WINGSTOP|BUFFALO WILD)\b/ },
  { t: 2, c: "restaurants", re: /\b(DOMINOS|PIZZA HUT|PAPA JOHN|LITTLE CAESAR|BLAZE PIZZA|MOD PIZZA|CALIFORNIA PIZZA|ROUND TABLE|MARCOS PIZZA)\b/ },
  { t: 2, c: "restaurants", re: /\b(PANDA EXPRESS|PF CHANGS|NOODLES ?& ?CO|OLIVE GARDEN|APPLEBEE|CHILIS|TGI FRIDAY|OUTBACK|TEXAS ROADHOUSE|RED LOBSTER|CHEESECAKE FACTORY|DENNYS|IHOP|WAFFLE HOUSE|CRACKER BARREL|RED ROBIN|DAVES HOT CHICKEN|HALAL GUYS)\b/ },
  { t: 2, c: "restaurants", re: /\b(DAIRY QUEEN|BASKIN|COLD STONE|BEN ?& ?JERRY|JAMBA|SMOOTHIE KING|CINNABON|KRISPY KREME|INSOMNIA COOKIE|CRUMBL|PRESSED JUICERY|BOBA GUYS|KUNG FU TEA|GONG CHA|CHATIME|SHARETEA|TEA ?SPOT)\b/ },
  { t: 2, c: "restaurants", re: /\b(GRUBHUB|SEAMLESS|POSTMATES|CAVIAR|SLICE\b|TOAST ?TAB|OPENTABLE|RESY)\b/ },

  /* transport */
  /* EXXONMOBIL runs the two brands together, so no closing boundary here */
  { t: 2, c: "transport", re: /\b(EXXON|MOBIL ?GAS|GASOLINE)/ },
  { t: 2, c: "transport", re: /\b(CHEVRON|SHELL|TEXACO|VALERO|CITGO|SUNOCO|MARATHON PETRO|PHILLIPS 66|CONOCO|ARCO|SINCLAIR|SPEEDWAY|WAWA|QUIKTRIP|RACETRAC|CIRCLE K|PILOT TRAVEL|LOVES TRAVEL|BUC-?EES|SHEETZ|CASEYS GENERAL)\b/ },
  { t: 2, c: "transport", re: /\b(ELECTRIFY AMERICA|EVGO|CHARGEPOINT|BLINK CHARGING|TESLA SUPERCHARG)\b/ },
  { t: 2, c: "transport", re: /\b(MTA\b|BART\b|CTA\b|WMATA|SEPTA|NJ TRANSIT|CALTRAIN|METRO ?TRANSIT|SOUND TRANSIT|AMTRAK|GREYHOUND|MEGABUS|FLIXBUS|CLIPPER|COMPASS CARD|CHARLIE ?CARD|ORCA CARD|VENTRA|TAP CARD)\b/ },
  { t: 2, c: "transport", re: /\b(SPOTHERO|PARKMOBILE|PARKWHIZ|PASSPORT PARKING|LAZ PARKING|SP ?PLUS|IMPARK|FASTRAK|E-?ZPASS|SUNPASS|TXTAG|GOOD ?TO ?GO)\b/ },
  { t: 2, c: "transport", re: /\b(ZIPCAR|GETAROUND|TURO|LIME|BIRD RIDES|CITI ?BIKE|DIVVY|VEO RIDE|REVEL)\b/ },
  { t: 2, c: "transport", re: /\b(JIFFY LUBE|VALVOLINE|MIDAS|PEP BOYS|AUTOZONE|OREILLY|ADVANCE AUTO|DISCOUNT TIRE|LES SCHWAB|FIRESTONE|GOODYEAR|MEINEKE|CARMAX|DMV\b)\b/ },

  /* travel */
  { t: 2, c: "travel", re: /\b(UNITED AIR|DELTA AIR|AMERICAN AIR|SOUTHWEST AIR|ALASKA AIR|JETBLUE|SPIRIT AIR|FRONTIER AIR|HAWAIIAN AIR|ALLEGIANT|SUN COUNTRY|BREEZE AIR)\b/ },
  { t: 2, c: "travel", re: /\b(LUFTHANSA|BRITISH AIRWAYS|AIR FRANCE|KLM\b|EMIRATES|QATAR AIR|TURKISH AIR|IBERIA|AER LINGUS|RYANAIR|EASYJET|AIR CANADA|AEROMEXICO|ANA\b|JAPAN AIRLINES|SINGAPORE AIR|CATHAY)\b/ },
  { t: 2, c: "travel", re: /\b(MARRIOTT|HILTON|HYATT|IHG\b|HOLIDAY INN|HAMPTON INN|COURTYARD|SHERATON|WESTIN|RITZ-?CARLTON|FOUR SEASONS|BEST WESTERN|LA QUINTA|MOTEL 6|RED ROOF|WYNDHAM|RADISSON|DOUBLETREE|EMBASSY SUITES|FAIRFIELD INN|RESIDENCE INN)\b/ },
  { t: 2, c: "travel", re: /\b(AIRBNB|VRBO|BOOKING\.?COM|EXPEDIA|HOTELS\.?COM|PRICELINE|KAYAK|ORBITZ|TRAVELOCITY|HOPPER|TRIP\.?COM|AGODA|GET ?YOUR ?GUIDE|VIATOR)\b/ },
  { t: 2, c: "travel", re: /\b(HERTZ|AVIS|ENTERPRISE RENT|BUDGET RENT|NATIONAL CAR|ALAMO RENT|SIXT|DOLLAR RENT|THRIFTY)\b/ },
  { t: 2, c: "travel", re: /\b(TSA ?PRE|GLOBAL ENTRY|CLEAR ?ME|US ?PASSPORT|VISAHQ|CBP\b)\b/ },

  /* utilities and telecom */
  { t: 2, c: "utilities", re: /\b(COMED|DUKE ENERGY|DOMINION ENERGY|NATIONAL GRID|CONSOLIDATED EDISON|CON ?EDISON|SOCALGAS|SDGE\b|XCEL ENERGY|AMEREN|ENTERGY|FPL\b|FLORIDA POWER|GEORGIA POWER|APS\b|SRP\b|PSEG|EVERSOURCE|CENTERPOINT|ONCOR|SEATTLE CITY LIGHT|LADWP)\b/ },
  { t: 2, c: "utilities", re: /\b(SPECTRUM|COX COMMUNICATIONS|OPTIMUM|FRONTIER COMM|WINDSTREAM|MEDIACOM|RCN\b|ASTOUND|WOW ?INTERNET|STARLINK|HUGHESNET)\b/ },
  { t: 2, c: "utilities", re: /\b(BOOST MOBILE|CRICKET WIRELESS|METRO ?BY ?T-?MOBILE|STRAIGHT TALK|TRACFONE|TELLO|US ?CELLULAR|XFINITY MOBILE|SPECTRUM MOBILE|RING ?CENTRAL)\b/ },
  { t: 2, c: "utilities", re: /\b(REPUBLIC SERVICES|WASTE CONNECTIONS|CITY OF [A-Z]+ UTIL)\b/ },

  /* home */
  { t: 2, c: "home", re: /\b(HOME DEPOT|LOWES|MENARDS|ACE HARDWARE|TRUE VALUE|HARBOR FREIGHT|TRACTOR SUPPLY|SHERWIN-?WILLIAMS|FLOOR ?& ?DECOR)\b/ },
  { t: 2, c: "home", re: /\b(IKEA|WAYFAIR|CRATE ?& ?BARREL|WEST ELM|POTTERY BARN|CB2\b|ARTICLE\b|ROOMS TO GO|ASHLEY FURNITURE|RAYMOUR|BOB'?S DISCOUNT|RESTORATION HARDWARE|HOMEGOODS|BED BATH|CONTAINER STORE|WILLIAMS-?SONOMA|SUR LA TABLE)\b/ },
  { t: 2, c: "home", re: /\b(PUBLIC STORAGE|EXTRA SPACE|CUBESMART|U-?HAUL|PODS\b|LIFE STORAGE)\b/ },

  /* health */
  { t: 2, c: "health", re: /\b(WALGREEN|RITE ?AID|DUANE READE|COSTCO PHARMACY|EXPRESS SCRIPTS|OPTUMRX|CAREMARK)\b/ },
  { t: 2, c: "health", re: /\b(QUEST DIAGNOSTIC|LABCORP|MINUTECLINIC|CITY ?MD|CONCENTRA|TELADOC|HIMS\b|HERS\b|RO\.?CO|LEMONAID)\b/ },
  { t: 2, c: "health", re: /\b(UNITEDHEALTH|KAISER PERMANENTE|HUMANA|MOLINA|CENTENE|OSCAR HEALTH|AMBETTER|TRICARE)\b/ },
  { t: 2, c: "health", re: /\b(LIFE ?TIME FITNESS|CRUNCH FITNESS|GOLDS GYM|LA FITNESS|ANYTIME FITNESS|F45\b|BARRYS|SOULCYCLE|PURE BARRE|CORE ?POWER|CLUB PILATES|BLINK FITNESS|CHUZE FITNESS)\b/ },

  /* personal care */
  { t: 2, c: "personal", re: /\b(GREAT CLIPS|SUPERCUTS|SPORT CLIPS|DRYBAR|REGIS SALON|FLOYDS BARBER|EUROPEAN WAX|WAXING THE CITY|MASSAGE ENVY|HAND ?& ?STONE)\b/ },
  { t: 3, c: "personal", re: /\b(SALON|HAIR ?STUDIO|NAIL ?SALON|NAILS|LASHES|BROW ?BAR|SPA|MASSAGE|SKIN ?CARE|TATTOO)\b/ },
  { t: 3, c: "personal", re: /\b(BARBER|WAXING|AESTHETIC|PIERCING|GROOMING ?LOUNGE)/ },
  { t: 3, c: "personal", re: /\b(LAUNDROMAT|DRY ?CLEAN|CLEANERS|TAILOR|COBBLER|SHOE REPAIR)\b/ },

  /* pets */
  { t: 2, c: "pets", re: /\b(PETCO|PETSMART|CHEWY|PET ?SUPPLIES PLUS|BANFIELD|VCA ?ANIMAL|ROVER\.?COM|WAG ?LABS|TRUPANION|HEALTHY PAWS)\b/ },
  { t: 3, c: "pets", re: /\b(VET ?CLINIC|VET ?HOSPITAL|ANIMAL HOSPITAL|ANIMAL CLINIC|DOGGY ?DAY|KENNEL|PET ?SHOP|PET ?STORE)\b/ },
  { t: 3, c: "pets", re: /\b(VETERINAR|PET ?GROOM|PET ?CARE|PET ?SUPPL)/ },

  /* entertainment */
  { t: 2, c: "entertainment", re: /\b(AMC\b|REGAL CINEMA|CINEMARK|ALAMO DRAFTHOUSE|LANDMARK THEAT|IMAX\b|FANDANGO|ATOM TICKETS)\b/ },
  { t: 2, c: "entertainment", re: /\b(TICKETMASTER|LIVE NATION|STUBHUB|SEATGEEK|AXS\b|DICE ?FM|BANDSINTOWN|SIX FLAGS|CEDAR POINT|UNIVERSAL STUDIOS|DISNEYLAND|WALT DISNEY WORLD|TOPGOLF|DAVE ?& ?BUSTER|MAIN EVENT|ESCAPE ROOM)\b/ },
  { t: 2, c: "entertainment", re: /\b(STEAM ?GAMES|STEAMPOWERED|PLAYSTATION|XBOX|NINTENDO|EPIC GAMES|BLIZZARD|RIOT GAMES|ROBLOX|TWITCH)\b/ },

  /* subscriptions and software */
  { t: 2, c: "subscriptions", re: /\b(AUDIBLE|KINDLE UNLIMITED|SCRIBD|MASTERCLASS|DUOLINGO|BABBEL|HEADSPACE|CALM\.?COM|NOOM|STRAVA|PELOTON|WHOOP|OURA)\b/ },
  { t: 2, c: "subscriptions", re: /\b(NYTIMES|NY ?TIMES|WASHINGTON POST|WALL ST JOURNAL|WSJ\b|THE ATHLETIC|ECONOMIST|MEDIUM\b|SUBSTACK|PATREON)\b/ },
  { t: 2, c: "subscriptions", re: /\b(LINKEDIN PREM|COURSERA|UDEMY|SKILLSHARE|PLURALSIGHT|DATACAMP|CHEGG|QUIZLET|GRAMMARLY|EVERNOTE|TODOIST|1PASSWORD|LASTPASS|NORDVPN|EXPRESSVPN|BACKBLAZE|ICLOUD|GOOGLE STORAGE|GOOGLE ?ONE)\b/ },

  /* fees */
  { t: 2, c: "fees", re: /\b(OVERDRAFT|NSF ?FEE|LATE FEE|ANNUAL MEMBERSHIP FEE|FOREIGN TRANSACTION FEE|ATM ?FEE|SERVICE CHARGE|MAINTENANCE FEE|RETURNED ITEM)\b/ },

  /* ================================================================
     KEYWORDS. These are what carry a stranger's statement: a brand
     list can only ever cover the chains, and most people's money
     goes to places nobody has heard of. Tier 3, so any brand or
     family rule above still wins.
     ================================================================ */
  { t: 3, c: "groceries", re: /\b(MARKET|MARKT|MKT|FOOD ?MART|SUPERMERCADO|CARNICERIA|BODEGA|BUTCHER|FISHMONGER|CREAMERY|DAIRY)\b/ },
  { t: 3, c: "groceries", re: /\b(GROCER|SUPERMARKET|FOODS)/ },
  { t: 3, c: "restaurants", re: /\b(PIZZA|PIZZERIA|GRILL|GRILLE|KITCHEN|BBQ|BARBECUE|DELI|DELICATESSEN|BAKERY|BOULANGERIE|PATISSERIE|JUICE|SMOOTHIE|BOBA|TEA ?HOUSE|TEAHOUSE|DONUT|DOUGHNUT|CREPERIE|GELATO|ICE ?CREAM|CHOCOLAT)\b/ },
  { t: 3, c: "restaurants", re: /\b(TAVERN|PUB\b|BREWERY|BREWING|BREWPUB|CANTINA|TRATTORIA|OSTERIA|BRASSERIE|STEAKHOUSE|CHOPHOUSE|NOODLE|DUMPLING|PHO\b|BANH ?MI|KEBAB|SHAWARMA|FALAFEL|CURRY|TANDOORI|BIRYANI|TAPAS|IZAKAYA|YAKITORI|TERIYAKI|POKE\b|BURRITO|TACOS?\b|EMPANADA|AREPA|JERK\b|SOUL ?FOOD|DINER|EATERY|CANTEEN|FOOD ?HALL|FOOD ?TRUCK)\b/ },
  { t: 3, c: "transport", re: /\b(PARKING|PARK ?N ?FLY|GARAGE PARK|TRANSIT|METRO\b|SUBWAY STATION|LIGHT RAIL|COMMUTER RAIL|RAILWAY|TOLL|TOLLWAY|TURNPIKE|BRIDGE ?AUTH|FERRY|TAXI|CAB ?CO|RIDESHARE|CAR ?WASH|AUTO ?REPAIR|TIRE ?SHOP|SMOG ?CHECK)\b/ },
  { t: 3, c: "transport", re: /\b(GAS|FUEL|PETROL|SERVICE STATION|TRUCK STOP)\b/ },
  { t: 3, c: "transport", re: /\b(EV ?CHARG|CHARGING STATION|AUTOMOTIVE)/ },
  { t: 3, c: "travel", re: /\b(AIRWAYS|AIRLINE|AIR ?LINES|FLIGHT|INN\b|SUITES|LODGE|MOTEL|GUESTHOUSE|BED ?& ?BREAKFAST|CAMPGROUND|RV ?PARK|TOUR|TOURS|TRAVEL ?AGENC|BAGGAGE|SEAT ?FEE|DUTY ?FREE)\b/ },
  { t: 3, c: "utilities", re: /\b(ELECTRIC|POWER ?CO|ENERGY|GAS ?CO|NATURAL GAS|WATER ?CO|WATER ?UTIL|SEWER|SANITATION|GARBAGE|TRASH|RECYCLING|BROADBAND|INTERNET|FIBER|CABLE ?TV|TELECOM|WIRELESS|MOBILE ?PLAN|PHONE ?CO)\b/ },
  { t: 3, c: "home", re: /\b(BUILDING SUPPLY|PAINT ?CO|GARDEN CENTER|NURSERY|HVAC|HANDYMAN|LOCKSMITH|PEST CONTROL|MAID ?SERVICE|SELF ?STORAGE|MOVERS)\b/ },
  { t: 3, c: "home", re: /\b(HOME ?IMPROV|LANDSCAP|PLUMB|ELECTRICIAN|ROOFING|HOUSE ?CLEAN|MOVING ?CO)/ },
  { t: 3, c: "health", re: /\b(PHYSICIAN|DOCTOR|FAMILY ?PRACTICE|EMERGENCY ROOM|HEALTH ?CENTER|WELLNESS|OPTICAL|EYE ?CARE|VISION ?CENTER|HEARING|GYM|FITNESS|YOGA|PILATES|CROSSFIT|MARTIAL ARTS)\b/ },
  /* stems: no closing boundary, so DENTISTRY and CHIROPRACTIC match too */
  { t: 3, c: "health", re: /\b(DENTIST|DENTAL|PEDIATRIC|DERMATOLOG|ORTHOPED|ORTHODONT|CHIROPRACT|PHYSICAL THERAP|RADIOLOG|IMAGING|LABORATOR|SURGER|ANESTHES|COUNSELING|PSYCHOLOG|PSYCHIATR|URGENT ?CARE|OPTOMETR)/ },
  { t: 3, c: "entertainment", re: /\b(NIGHTCLUB|NIGHT ?CLUB|LOUNGE|COMEDY|LIVE MUSIC|VENUE|STADIUM|ARENA|BALLPARK|GOLF ?CLUB|GOLF ?COURSE|BOWLING|KARAOKE|AQUARIUM|ZOO|GALLERY|FESTIVAL|TICKET|EVENTBRITE|BILLIARD)/ },
  { t: 3, c: "education", re: /\b(UNIVERSITY|COLLEGE|SCHOOL|ACADEMY|INSTITUTE|TUITION|CAMPUS|BOOKSTORE|TEXTBOOK|LIBRARY|TUTOR|TEST ?PREP|COURSE ?FEE)\b/ },
  { t: 3, c: "shopping", re: /\b(BOUTIQUE|APPAREL|CLOTHING|SHOE ?STORE|JEWELRY|OPTICIAN|BOOKSHOP|BOOKS|GIFT ?SHOP|TOY ?STORE|HOBBY|CRAFT ?STORE|THRIFT|CONSIGNMENT|ELECTRONICS|COMPUTER ?STORE)\b/ },
  { t: 3, c: "shopping", re: /\b(OUTFITTER|JEWELER|STATIONER|DEPARTMENT STORE)/ },

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
