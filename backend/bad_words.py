# Bad words list — add or remove words here at any time
BAD_WORDS = [
    # ── Profanity & variations ────────────────────────────────────────────────
    "fuck","fucking","fucker","fucked","fucks","fuk","f**k","f***","fck","fukk",
    "f u c k","wtf","wth",
    "shit","shite","bullshit","sh*t","sht","shitt","$hit",
    "bitch","b*tch","btch","biatch","b1tch","bytch",
    "ass","asshole","arsehole","arse","a**","azzhole","a$$",
    "bastard","damn","crap","piss","pissed","cunt","c**t","c*nt",
    "dick","d*ck","cock","c*ck","d1ck","d!ck","dikk",
    "pussy","p*ssy","vagina","puss","p***y",
    "whore","wh*re","slut","sl*t","hoe","thot","skank","tramp",
    "boobs","tits","t*ts","b00bs","naked","nudes","nude",
    "sex","sexy","sexting","porn","p0rn","xxx","nsfw",
    "stfu","gtfo","ffs","omfg","afk","smh",

    # ── Evasion / leet speak ──────────────────────────────────────────────────
    "fvck","fvk","fck","ph*ck","phuck",
    "sh!t","$hit","5hit",
    "b!tch","b1tch",
    "a$$hole","@sshole",
    "c0ck","d!ck","d1ck",

    # ── Racial / ethnic slurs ─────────────────────────────────────────────────
    "nigger","nigga","n*gger","n*gga","niga","n1gga","nigg","negro",
    "faggot","fag","f*ggot","dyke","homo","queer","tranny",
    "spic","chink","gook","kike","wetback","cracker","honky","coon",
    "beaner","towelhead","sandnigger","zipperhead","jap","paki",

    # ── Ableist slurs ─────────────────────────────────────────────────────────
    "retard","retarded","r*tard","tard","spastic","mong","cripple",

    # ── Threats & violence ────────────────────────────────────────────────────
    "kill yourself","kys","kill urself","kys yourself","end yourself",
    "i will kill","i'll kill","gonna kill","want to kill","ill kill","going to kill",
    "die bitch","go die","drop dead","kill u","kill you","i'll hurt you",
    "i want to kill","shoot you","stab you","gonna stab","im gonna kill",
    "rape","r*pe","raped","raping","rapist","molest","molestation",
    "bomb","bombing","terrorist","terrorism","jihad","suicide bomb",
    "i will hurt","hurt you","beat you up","beat u up",
    "cut yourself","self harm","harm yourself",

    # ── Scams & spam ─────────────────────────────────────────────────────────
    "scammer","scam","spammer","spam","phishing","hack you","hacking",
    "send money","wire transfer","bitcoin scam","free money","click here",
    "your account suspended","verify your account","you won",

    # ── Drug references ───────────────────────────────────────────────────────
    "cocaine","heroin","meth","methamphetamine","crack cocaine",
    "buy drugs","sell drugs","weed dealer","drug dealer",

    # ── Harassment ────────────────────────────────────────────────────────────
    "idiot","moron","stupid","loser","freak","pathetic",
    "ugly","fat pig","fat bitch","go to hell","shut up","dumb",
    "piece of shit","son of a bitch","piece of crap","go fuck yourself",
    "nobody likes you","you should die","worthless","useless piece",
    "kill urself","end it all",

    # ── Urdu / Pakistani bad words & insults ──────────────────────────────────
    # Body insults
    "moti","mota","motay","moti larki","mota banda",
    "kala","kali","kalay",

    # Stupidity insults
    "bewaqoof","bewakoof","bevaqoof",
    "gadha","gadhe","gadhay","gadhi",
    "ullu","ulloo","ullu ka pattha",
    "pagal","paagal","pagla",
    "ahmaq","besharam","be sharam",
    "nalayak","nikamma","nikammi",
    "jhooth","jhoota","jhooti","jhootay",

    # Disrespect / rudeness
    "badtameez","bad tameez","gustakh",
    "kamine","kameena","kameeni","kamini",
    "lafanga","awara","luchha",
    "harami","haramine",
    "haramzada","haramzadi","haraam zada",
    "haramkhor","haram khor",
    "bhadwa","bhadhwa",
    "randi","raand",
    "sala","salay","sali",
    "kutte","kutta","kutiya","kutti",
    "suar","suwar","suvar",
    "janwar","jaanwar",

    # Vulgar Urdu
    "maa ki","maa ki aankh","maa ki gali",
    "behen ki","behen ke",
    "chutiya","chutiye","chutiyapa",
    "lund","lnda",
    "gand","gaand","gandu",
    "bhosda","bhosdike",
    "madharchod","madarchod",
    "behenchod","bhenchod","bc",
    "mc","maa chod","maa ka",
    "teri maa","teri behen",

    # Threats in Urdu
    "maar donga","maar dunga","maar dunga tujhe",
    "jaan se maar","khoon kar","tod dunga",

    # ── Custom test ───────────────────────────────────────────────────────────
    "676767",
]

def check_bad_words(text):
    """Returns list of bad words found in text (case-insensitive)."""
    if not text:
        return []
    lower = text.lower()
    found = []
    for word in BAD_WORDS:
        if word in lower:
            found.append(word)
    return found
