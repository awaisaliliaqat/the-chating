# Bad words list — add or remove words here at any time
BAD_WORDS = [
    # Profanity
    "fuck","fucking","fucker","fucked","fuk","f**k","f***","fck","fuk",
    "shit","shite","bullshit","bs","sh*t","sht",
    "bitch","b*tch","btch","biatch",
    "ass","asshole","arsehole","arse","a**","azzhole",
    "bastard","damn","crap","piss","cunt","c**t",
    "dick","d*ck","cock","c*ck","penis","d1ck",
    "pussy","p*ssy","vagina","puss",
    "whore","wh*re","slut","sl*t","hoe","thot",
    "wtf","stfu","gtfo","ffs",

    # Slurs (racial, religious, orientation)
    "nigger","nigga","n*gger","n*gga","niga",
    "faggot","fag","f*ggot","dyke","homo",
    "spic","chink","gook","kike","wetback","cracker","honky",
    "retard","retarded","r*tard","tard",

    # Threats / violent
    "kill yourself","kys","kill urself","kys yourself",
    "i will kill","i'll kill","gonna kill","want to kill","ill kill",
    "die bitch","go die","drop dead","kill u","kill you",
    "rape","r*pe","raped","raping","rapist",
    "bomb","terrorist","shoot you","stab you","i will hurt",

    # Harassment
    "idiot","moron","stupid","loser","freak",
    "ugly","fat pig","go to hell","shut up","dumb",
    "scammer","spam","spammer",

    # Custom test words (remove when done testing)
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
