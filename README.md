# Magyar CS2 admin-parancstár

Statikus, magyar nyelvű CS2-parancskézikönyv CS1.6/VGUI és korabeli rajongói oldal stílusban. Keresés, témakörszűrés, másolható parancsok, szerverprofilok, tíz játékmód és adminmenü-útmutató.

A publikus cím: [cs2.mannin.hair](https://cs2.mannin.hair/). A böngészős térhang oldala: [cs2.mannin.hair/voice/](https://cs2.mannin.hair/voice/).

Az `index.html` önállóan, internetkapcsolat nélkül is használható; a képek, stílusok és működés a fájlba vannak ágyazva. A `PARANCSOK.hu.md` a hozzá kapcsolt szöveges parancslista. A `CNAME` a GitHub Pages egyéni domainjét adja meg, a `.nojekyll` közvetlen statikus kiszolgálást kér.

Ez a könyvtár kizárólag nyilvános statikus fájlokat tartalmaz. A parancstár gombjai a parancs szövegét másolják a vágólapra. A térhangoldalon először ki kell választani a szerveren lévő saját játékost; a Frissítés gomb lekéri az új neveket. Kapcsolódás után a játékban a !voice paranccsal hagyható jóvá a kérés, 60 másodpercen belül. Kódot nem kell másolni. A 20 méteres HRTF hangot a saját VPS továbbítja; a pozíció és a nézési irány 20 Hz-en frissül. A CS2 saját beszédhangerőjét a résztvevők nullára állítják, majd kilépéskor visszaállítják.

A már szinkronizált játékosok foglaltak. Mikrofon nélkül a NO VOICE választás is jóváhagyható a játékban, hangküldés és hangfogadás nélkül; új választáshoz `!voiceleave`. Működő hang nélkül a játékos neve mellett `(NO VOICE)` jelenik meg. Egy új meccs minden részt vevő T/CT ember működő hangjára vagy kifejezett NO VOICE választására vár; adminos indítás sem kerüli meg ezt. Ha a hanglap bezárul vagy kifagy, a játékos privát újracsatlakozási figyelmeztetést kap. Egy már futó meccset ez nem szüneteltet.

A valódi CS2 beszédgomb, gyári beszélőikon, névjelzés és háttérben futó mikrofon közös játékbeli ellenőrzésre vár. A böngészős hangmotor, WebRTC hangátvitel, foglalt játékosok és mikrofon nélküli belépés automatizált próbája sikeres.
