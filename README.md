# Magyar CS2 admin-parancstár

Statikus, magyar nyelvű CS2-parancskézikönyv CS1.6/VGUI és korabeli rajongói oldal stílusban. Keresés, témakörszűrés, másolható parancsok, szerverprofilok, tíz játékmód és adminmenü-útmutató.

A publikus cím: [cs2.mannin.hair](https://cs2.mannin.hair/). A böngészős térhang oldala: [cs2.mannin.hair/voice/](https://cs2.mannin.hair/voice/).

Az `index.html` önállóan, internetkapcsolat nélkül is használható; a képek, stílusok és működés a fájlba vannak ágyazva. A `PARANCSOK.hu.md` a hozzá kapcsolt szöveges parancslista. A `CNAME` a GitHub Pages egyéni domainjét adja meg, a `.nojekyll` közvetlen statikus kiszolgálást kér.

Ez a könyvtár kizárólag nyilvános statikus fájlokat tartalmaz. A parancstár gombjai a parancs szövegét másolják a vágólapra. A térhang külön oldalán a játékban kért, egyszer használható kóddal párosítható a mikrofon; a 20 méteres HRTF hangot a saját VPS-en futó szolgáltatás továbbítja. A pozíció és a nézési irány 20 Hz-en frissül. A CS2 saját beszédhangerőjét a résztvevők nullára állítják, majd kilépéskor visszaállítják.

A valódi CS2 beszédgomb, gyári beszélőikon és háttérben futó mikrofon közös játékbeli ellenőrzésre vár. A böngészős hangmotor és a WebRTC hangátvitel automatizált próbája sikeres.
