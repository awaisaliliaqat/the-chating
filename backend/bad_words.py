# Bad words list — add or remove words here
BAD_WORDS = [
    # Profanity
    "fuck","fucking","fucker","fucked","fuk","f**k","f***",
    "shit","shite","bullshit","bs","sh*t",
    "bitch","b*tch","btch",
    "ass","asshole","arsehole","arse","a**",
    "bastard","damn","crap","piss","cunt","c**t",
    "dick","d*ck","cock","c*ck","penis",
    "pussy","p*ssy","vagina",
    "whore","wh*re","slut","sl*t","hoe",

    # Slurs (racial, religious, orientation)
    "nigger","nigga","n*gger","n*gga",
    "faggot","fag","f*ggot","dyke",
    "spic","chink","gook","kike","wetback","cracker","honky",
    "retard","retarded","r*tard",

    # Threats / violent
    "kill yourself","kys","kill urself",
    "i will kill","i'll kill","gonna kill","want to kill",
    "die bitch","go die","drop dead",
    "rape","r*pe","raped","raping",

    # Harassment
    "idiot","moron","stupid","loser","freak",
    "ugly","fat pig","go to hell",
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
